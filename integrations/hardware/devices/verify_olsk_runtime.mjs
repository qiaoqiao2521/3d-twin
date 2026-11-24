// CPU compatibility check for the unchanged original Draco-compressed models.
// This deliberately does not claim browser/WebGL or visual acceptance.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const [appDirectory, reportPath] = process.argv.slice(2);
if (!appDirectory || !reportPath) throw new Error('Usage: node verify_olsk_runtime.mjs <built-app> <report.json>');
const app = path.resolve(appDirectory);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hardware-original-draco-'));
try {
  const wrapper = path.join(temporary, 'decoder.cjs');
  await fs.copyFile(path.join(app, 'draco/draco_wasm_wrapper.js'), wrapper);
  const factory = createRequire(import.meta.url)(wrapper);
  const wasm = await fs.readFile(path.join(app, 'draco/draco_decoder.wasm'));
  // This historical Emscripten module is itself thenable. Resolve a wrapper
  // object so Promise assimilation cannot recursively await the same module.
  const { value: module } = await new Promise((resolve, reject) => {
    const ready = value => resolve({ value });
    const initialized = factory({ wasmBinary: wasm, onModuleLoaded: ready, onAbort: error => reject(new Error(String(error))) });
    if (initialized?.then) initialized.then(ready, reject);
  });
  const models = [];
  for (const name of (await fs.readdir(app)).filter(file => file.endsWith('.glb')).sort()) {
    const bytes = await fs.readFile(path.join(app, name));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binHeader = 20 + jsonLength;
    assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942);
    const binary = bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader));
    for (const buffer of document.buffers || []) {
      assert.equal(buffer.uri, undefined, `${name}: external buffer`);
      assert.ok(buffer.byteLength <= binary.length);
    }
    for (const view of document.bufferViews || []) assert.ok((view.byteOffset || 0) + view.byteLength <= binary.length, `${name}: truncated original buffer view`);
    for (const image of document.images || []) assert.equal(image.uri, undefined, `${name}: original image requires an external resource`);
    const primitives = document.meshes.flatMap(mesh => mesh.primitives);
    const primitive = primitives.find(item => item.extensions?.KHR_draco_mesh_compression);
    const original = { file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), originalNodes: document.nodes.length,
      originalMeshes: document.meshes.length, originalPrimitives: primitives.length, checkedAllBufferViews: true, externalBuffersOrImages: false };
    if (!primitive) {
      assert.ok(!document.extensionsRequired?.includes('KHR_draco_mesh_compression'));
      models.push({ ...original, compressed: false, status: 'passed' });
      continue;
    }
    const extension = primitive.extensions.KHR_draco_mesh_compression;
    const view = document.bufferViews[extension.bufferView];
    const encoded = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const buffer = new module.DecoderBuffer();
    const decoder = new module.Decoder();
    const mesh = new module.Mesh();
    const positions = new module.DracoFloat32Array();
    const faceIndices = new module.DracoInt32Array();
    let status;
    try {
      buffer.Init(new Int8Array(encoded), encoded.length);
      status = decoder.DecodeBufferToMesh(buffer, mesh);
      assert.equal(status.ok(), true, `${name}: ${status.error_msg()}`);
      assert.ok(mesh.ptr);
      const expected = document.accessors[primitive.attributes.POSITION];
      assert.equal(mesh.num_points(), expected.count, `${name}: original decoded point count differs`);
      const indexAccessorCount = document.accessors[primitive.indices].count;
      const decodedIndexCount = mesh.num_faces() * 3;
      // The author's original main GLBs store the number of triangles in the
      // index accessor's count. Their original GLTFLoader Draco path uses the
      // decoded indices directly. Retain that original metadata and record
      // the discrepancy instead of rewriting the user's original model.
      assert.ok(indexAccessorCount === decodedIndexCount || indexAccessorCount === mesh.num_faces(), `${name}: unexpected original index-count discrepancy`);
      for (let face = 0; face < mesh.num_faces(); face++) {
        assert.equal(decoder.GetFaceFromMesh(mesh, face, faceIndices), true);
        for (let i = 0; i < 3; i++) assert.ok(faceIndices.GetValue(i) >= 0 && faceIndices.GetValue(i) < mesh.num_points());
      }
      const attribute = decoder.GetAttributeByUniqueId(mesh, extension.attributes.POSITION);
      assert.equal(decoder.GetAttributeFloatForAllPoints(mesh, attribute, positions), true);
      assert.equal(positions.size(), mesh.num_points() * 3);
      for (let i = 0; i < positions.size(); i++) assert.ok(Number.isFinite(positions.GetValue(i)));
      models.push({ ...original, compressed: true,
        sampleDecodedPoints: mesh.num_points(), sampleDecodedTriangles: mesh.num_faces(), sampleDecodedIndicesInRange: true,
        indexAccessorCount, decodedIndexCount, indexAccessorCountMatches: indexAccessorCount === decodedIndexCount,
        ...(indexAccessorCount !== decodedIndexCount ? { originalMetadataNote: 'Original index accessor count records triangle count; the original GLTFLoader Draco path uses the actual decoded indices. Original GLB bytes are unchanged.' } : {}), status: 'passed' });
    } finally {
      if (status) module.destroy(status);
      module.destroy(faceIndices); module.destroy(positions); module.destroy(mesh); module.destroy(decoder); module.destroy(buffer);
    }
  }
  assert.ok(models.length);
  const report = { schemaVersion: 1, decoder: 'unmodified three@0.148.0 bundled glTF Draco WASM', models,
    scope: 'All original GLB buffer-view bounds and absence of external buffers/images; one real compressed primitive per Draco-compressed original GLB decoded using the locally shipped WASM. Uncompressed tutorial GLBs need no Draco decoding. This is not a full decode of every primitive, browser/WebGL observation, mobile performance measurement or visual acceptance.' };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Validated local Draco compatibility for ${models.length} unchanged original GLBs`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
