import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, safeRelative } from './hardware/common.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hardwareIds = ['odri', 'so101', 'thor', 'parol6', 'olsk-small-cnc', 'olsk-large-cnc', 'voron-2.4', 'jubilee', 'opcua-conveyor'];
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
export async function readGlb(file) {
  const fd = await fs.open(file, 'r');
  try {
    const header = Buffer.alloc(20); await fd.read(header, 0, 20, 0);
    assert.equal(header.toString('utf8', 0, 4), 'glTF', `${file}: GLB magic`);
    assert.equal(header.readUInt32LE(4), 2, `${file}: GLB version`);
    assert.equal(header.readUInt32LE(8), (await fd.stat()).size, `${file}: complete GLB bytes`);
    assert.equal(header.readUInt32LE(16), 0x4e4f534a, `${file}: JSON chunk`);
    const buffer = Buffer.alloc(header.readUInt32LE(12)); await fd.read(buffer, 0, buffer.length, 20);
    return JSON.parse(buffer.toString('utf8'));
  } finally { await fd.close(); }
}
async function filesBelow(root, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(root, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Published asset must be a regular file: ${name}`);
  }
  return result;
}
async function httpHash(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url}: HTTP status`);
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size, type: response.headers.get('content-type') };
}
function verifyGlbStructure(gltf, label) {
  assert.ok(gltf.nodes?.length && gltf.meshes?.length, `${label}: original parts must exist`);
  assert.ok(gltf.scenes?.length, `${label}: scene hierarchy must exist`);
  let primitives = 0;
  for (const node of gltf.nodes) {
    if (node.mesh != null) assert.ok(gltf.meshes[node.mesh], `${label}: missing mesh`);
    for (const child of node.children || []) assert.ok(gltf.nodes[child], `${label}: missing child`);
    for (const key of ['matrix', 'translation', 'rotation', 'scale']) if (node[key]) assert.ok(node[key].every(Number.isFinite), `${label}: finite transform`);
  }
  function visit(index, ancestors = new Set()) {
    assert.ok(gltf.nodes[index], `${label}: missing root`); assert.ok(!ancestors.has(index), `${label}: cyclic hierarchy`);
    const next = new Set(ancestors).add(index); for (const child of gltf.nodes[index].children || []) visit(child, next);
  }
  for (const scene of gltf.scenes) for (const index of scene.nodes || []) visit(index);
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(gltf.accessors?.[primitive.attributes.POSITION], `${label}: missing positions`); primitives++;
    for (const index of Object.values(primitive.attributes)) assert.ok(gltf.accessors[index], `${label}: missing vertex data`);
  }
  for (const view of gltf.bufferViews || []) assert.ok((view.byteOffset || 0) + view.byteLength <= gltf.buffers[view.buffer].byteLength, `${label}: buffer range`);
  for (const buffer of gltf.buffers || []) assert.ok(!buffer.uri || buffer.uri.startsWith('data:'), `${label}: GLB must close its binary resources`);
  for (const image of gltf.images || []) assert.ok(image.bufferView != null || image.uri?.startsWith('data:'), `${label}: embedded texture closure`);
  return { nodes: gltf.nodes.length, meshes: gltf.meshes.length, primitives };
}
async function verifyUrdf(file, assetDir, model) {
  const xml = await fs.readFile(file, 'utf8');
  assert.ok(/<robot\b/.test(xml), `${file}: actual URDF document`);
  assert.ok(!/\$\{|\$\(find\b|<xacro:/.test(xml), `${file}: Xacro must be expanded before browser loading`);
  const resources = [];
  for (const match of xml.matchAll(/<(?:mesh|texture)\b[^>]*\bfilename\s*=\s*["']([^"']+)["']/g)) {
    const original = match[1]; let target;
    if (original.startsWith('package://')) {
      const [pkg, ...parts] = original.slice(10).split('/');
      assert.ok(model.packages?.[pkg], `${file}: package ${pkg} has an explicit original root`);
      target = path.resolve(assetDir, safeRelative(model.packages[pkg]), ...parts);
    } else target = path.resolve(path.dirname(file), original);
    assert.ok(target.startsWith(`${path.resolve(assetDir)}${path.sep}`), `${file}: mesh stays inside published originals`);
    assert.ok((await fs.stat(target)).size > 0, `${file}: missing original mesh ${original}`);
    const prefix = (await fs.readFile(target)).subarray(0, 100).toString();
    assert.ok(!prefix.startsWith('version https://git-lfs.github.com/spec/'), `${file}: LFS pointers are not models`);
    resources.push(path.relative(assetDir, target));
  }
  assert.ok(resources.length > 0, `${file}: original mesh references are required`);
  return { referencedResources: resources.length, movableJoints: [...xml.matchAll(/<joint\b[^>]*\btype=["'](revolute|prismatic|continuous)["']/g)].length };
}

export async function verifyHardware({ root = path.join(repo, 'public'), ids, origin } = {}) {
  const robotPins = await readJson(path.join(repo, 'integrations/hardware/robots/sources.json'));
  const devicePins = await readJson(path.join(repo, 'integrations/hardware/devices/sources.json'));
  const pins = new Map([...robotPins, ...devicePins.sources].map(source => [source.id, source]));
  const selection = ids || hardwareIds;
  for (const id of selection) assert.ok(hardwareIds.includes(id), `Unknown hardware id ${id}`);
  const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), root: path.basename(root), http: Boolean(origin), visualAcceptance: false, host: {}, assets: [] };
  const hostManifest = await readJson(path.join(root, 'hardware/HOST-RESOURCES.json'));
  assert.equal(hostManifest.schemaVersion, 1, 'Host resource manifest version');
  assert.equal(hostManifest.decoderSource, 'three@0.170.0/examples/jsm/libs/draco/gltf', 'Pinned host decoder source');
  assert.equal(hostManifest.decoderFiles.length, 3, 'Complete local Draco decoder resources');
  const hostFiles = ['hardware/HOST-RESOURCES.json', 'hardware/THIRD_PARTY_NOTICES.txt', 'draco/LICENSE.txt'];
  for (const decoder of hostManifest.decoderFiles) {
    const target = path.join(root, safeRelative(decoder.path));
    assert.equal((await fs.stat(target)).size, decoder.size, `Host decoder size ${decoder.path}`);
    assert.equal(await sha256(target), decoder.sha256, `Host decoder bytes ${decoder.path}`);
    hostFiles.push(decoder.path);
  }
  const notices = await fs.readFile(path.join(root, 'hardware/THIRD_PARTY_NOTICES.txt'), 'utf8');
  for (const name of ['react@', 'react-dom@', 'three@', 'urdf-loader@', 'meshoptimizer@', 'lucide-react@', 'Draco browser glTF codec']) assert.ok(notices.includes(name), `Host runtime notice ${name}`);
  assert.ok((await fs.readFile(path.join(root, 'draco/LICENSE.txt'), 'utf8')).includes('Apache License'), 'Original Draco license retained');
  let hostHttpBytes = 0;
  if (origin) for (const relative of hostFiles) {
    const result = await httpHash(`${origin}/${relative}`);
    assert.equal(result.sha256, await sha256(path.join(root, relative)), `Host HTTP resource ${relative}`);
    if (relative.endsWith('.wasm')) assert.ok(result.type?.includes('application/wasm'), 'Draco WASM HTTP content type');
    hostHttpBytes += result.size;
  }
  report.host = { decoderSource: hostManifest.decoderSource, resources: hostFiles.length, httpRequests: origin ? hostFiles.length : 0, httpBytes: hostHttpBytes };
  for (const id of selection) {
    const directory = path.join(root, 'hardware', id);
    const asset = await readJson(path.join(directory, 'asset.json'));
    assert.equal(asset.schemaVersion, 1); assert.equal(asset.id, id);
    assert.ok(asset.models?.length, `${id}: working local display required`);
    const index = await readJson(path.join(directory, safeRelative(asset.filesIndex)));
    assert.equal(index.schemaVersion, 1); assert.ok(index.files?.length, `${id}: complete originals index`);
    const urls = new Map();
    for (const report of asset.verificationReports || []) {
      assert.ok(report.label, `${id}: precision/conversion report label`);
      assert.ok((await fs.stat(path.join(directory, safeRelative(report.path)))).size > 0, `${id}: precision/conversion report is locally available`);
    }
    for (const adaptation of asset.integrationSource || []) {
      assert.ok(adaptation.license && adaptation.label, `${id}: corresponding source has license and label`);
      assert.ok((await fs.stat(path.join(directory, safeRelative(adaptation.path)))).size > 0, `${id}: corresponding adapted source is downloadable`);
    }
    for (const source of asset.sources) {
      const pin = pins.get(source.id); assert.ok(pin, `${id}: known frozen source ${source.id}`);
      assert.equal(source.revision, pin.revision, `${id}: fixed revision`);
      if (pin.tree) assert.equal(source.tree, pin.tree, `${id}: fixed source tree`);
      assert.ok(typeof source.license === 'string' && source.license.trim().length >= 3, `${id}: per-source licensing`);
      assert.ok(source.archive, `${id}: complete local original archive required`);
      const archive = path.join(directory, safeRelative(source.archive));
      const digest = await sha256(archive); assert.equal(digest, source.archiveSha256, `${id}: intact complete original archive`);
      urls.set(source.archive, digest);
      const members = index.files.filter(file => file.sourceId === source.id);
      assert.equal(members.length, source.fileCount, `${id}: complete per-source original index`);
      assert.ok(members.some(file => /license|copying|\.reuse\/dep5/i.test(file.path)), `${id}: original licensing retained`);
    }
    for (const file of index.files) {
      safeRelative(file.path); assert.ok(asset.sources.some(source => source.id === file.sourceId), `${id}: original source exists`);
      assert.ok(file.url || file.archive, `${id}: every indexed original can be downloaded`);
      if (file.archive) assert.ok(urls.has(file.archive), `${id}: indexed original points to a real complete archive`);
      if (file.url) {
        const target = path.join(directory, safeRelative(file.url)); const stat = await fs.stat(target);
        assert.equal(stat.size, file.size, `${id}: original size ${file.path}`);
        const digest = await sha256(target); if (file.sha256) assert.equal(digest, file.sha256, `${id}: original bytes ${file.path}`);
        urls.set(file.url, digest);
      }
    }
    const models = [];
    for (const model of asset.models) {
      const target = path.join(directory, safeRelative(model.path));
      assert.ok((await fs.stat(target)).size > 0, `${id}: local display model exists`);
      assert.ok(index.files.some(file => file.sourceId === model.source?.id && file.path === model.source.path), `${id}: display traces to an indexed original`);
      let details;
      if (model.format === 'gltf') details = verifyGlbStructure(await readGlb(target), `${id}/${model.id}`);
      else if (model.format === 'urdf') details = await verifyUrdf(target, directory, model);
      else if (model.format === 'html') {
        const html = await fs.readFile(target, 'utf8'); assert.ok(/<html\b/i.test(html), `${id}: original application HTML`);
        for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
          assert.ok(!/^https?:|^\/\//.test(match[1]), `${id}: executable dependencies must be local`);
          const pathname = decodeURIComponent(match[1].split('?')[0]);
          const referenced = pathname.startsWith('/') ? path.join(root, pathname) : path.resolve(path.dirname(target), pathname);
          assert.ok((await fs.stat(referenced)).size > 0, `${id}: original app script closure`);
        }
        details = { independentApplication: true };
      } else throw new Error(`${id}: unsupported model format ${model.format}`);
      models.push({ id: model.id, format: model.format, ...details });
    }
    // Verify HTTP payloads for every published original and application dependency,
    // including large archives, with streaming hashes instead of buffering them.
    let httpRequests = 0, httpBytes = 0;
    if (origin) {
      for (const relative of await filesBelow(directory)) {
        const expected = urls.get(relative) || await sha256(path.join(directory, relative));
        const url = `${origin}/hardware/${id}/${relative.split('/').map(encodeURIComponent).join('/')}`;
        const result = await httpHash(url);
        assert.equal(result.sha256, expected, `${id}: actual HTTP resource ${relative}`);
        httpRequests++; httpBytes += result.size;
      }
      for (const view of ['structure', 'files', 'about']) {
        const response = await fetch(`${origin}/?workspace=hardware&asset=${id}&view=${view}`);
        assert.equal(response.status, 200); assert.ok((await response.text()).includes('<div id="root">'), `${id}: deep-link host`);
        httpRequests++;
      }
      const missing = await fetch(`${origin}/hardware/${id}/missing-original.glb`); assert.equal(missing.status, 404, `${id}: no HTML fallback for missing originals`);
      httpRequests++;
    }
    const row = { id, sources: asset.sources.length, originalFiles: index.files.length, directlyAvailableFiles: index.files.filter(file => file.url).length, httpRequests, httpBytes, models };
    report.assets.push(row); console.log(`${id}: ${row.originalFiles} originals, ${models.length} local displays; source/resource${origin ? '/HTTP' : ''} checks passed`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let preview;
  try {
    const root = path.join(repo, process.argv.includes('--dist') ? 'dist' : 'public');
    let origin = process.argv.find(value => value.startsWith('--base='))?.slice(7);
    if (process.argv.includes('--serve')) {
      assert.ok(process.argv.includes('--dist'), '--serve requires production --dist');
      const { preview: start } = await import('vite');
      preview = await start({ configFile: path.join(repo, 'vite.config.ts'), preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
      origin = `http://127.0.0.1:${preview.httpServer.address().port}`;
    }
    const report = await verifyHardware({ root, origin });
    const output = process.argv.find(value => value.startsWith('--report='))?.slice(9);
    if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.assets.length} hardware entries verified. WebGL, touch and visual acceptance are separate checks.`);
  } finally { if (preview) await new Promise(resolve => preview.httpServer.close(resolve)); }
}
