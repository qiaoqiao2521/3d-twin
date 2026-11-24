import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, 'integrations/smart-warehouse');
const gitHash = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

export async function verifyWarehouseSources() {
  const manifest = JSON.parse(await readFile(resolve(sourceRoot, 'upstream-manifest.json'), 'utf8'));
  const source = JSON.parse(await readFile(resolve(sourceRoot, 'source.json'), 'utf8'));
  assert.equal(source.revision, manifest.revision, 'Source revision must match the integrity manifest');
  assert.equal(source.repository, manifest.repository, 'Source repository must match the integrity manifest');
  for (const [name, hash] of Object.entries(manifest.files)) {
    const bytes = await readFile(resolve(sourceRoot, 'upstream', name));
    assert.equal(gitHash(bytes), hash, `Frozen upstream file changed: ${name}`);
  }
  console.log(`Smart Warehouse: ${Object.keys(manifest.files).length} original files match ${manifest.revision}`);
  return manifest;
}

export function inspectWarehouseGlb(bytes) {
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF', 'Model must be a GLB, not an HTML fallback');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'Complete GLB length');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'First GLB chunk is JSON');
  const jsonLength = bytes.readUInt32LE(12);
  const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.ok(model.scenes?.length && model.nodes?.length && model.meshes?.length, 'Original scene hierarchy exists');
  for (const asset of [...(model.buffers || []), ...(model.images || [])]) {
    assert.ok(!asset.uri || asset.uri.startsWith('data:'), 'The bundled model must not silently depend on a remote resource');
  }
  return { nodes: model.nodes.length, meshes: model.meshes.length, materials: model.materials?.length || 0 };
}

export async function verifyWarehouseBuild(output = resolve(root, 'dist/integrations/smart-warehouse')) {
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  assert.match(html, /id="app"/, 'Original Vue mount point');
  assert.doesNotMatch(html, /id="root"/, 'Host SPA fallback must not pass as the scene');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)(?:[^"\s]*)"/g)].map((match) => match[1]);
  assert.ok(assets.some((name) => name.endsWith('.js')), 'Scene entry is local and relative');
  for (const asset of assets) await readFile(resolve(output, asset));
  const model = await readFile(resolve(output, 'smart_warehouse.glb'));
  const original = await readFile(resolve(sourceRoot, 'upstream/public/smart_warehouse.glb'));
  assert.equal(gitHash(model), gitHash(original), 'Built GLB must be the complete original model');
  const summary = inspectWarehouseGlb(model);
  assert.equal(await readFile(resolve(output, 'LICENSE.txt'), 'utf8'), await readFile(resolve(sourceRoot, 'upstream/LICENSE'), 'utf8'));
  assert.equal(await readFile(resolve(output, 'source.json'), 'utf8'), await readFile(resolve(sourceRoot, 'source.json'), 'utf8'));
  console.log(`Smart Warehouse build: ${assets.length} local bundles; ${model.length} model bytes; ${JSON.stringify(summary)}`);
}

export async function verifyWarehouseHttp(base) {
  const baseUrl = new URL(base);
  const sceneUrl = new URL('integrations/smart-warehouse/index.html', baseUrl);
  for (const path of ['', '?mode=warehouse']) {
    const response = await fetch(new URL(path, baseUrl));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="root"/, `Host route ${path}`);
  }
  const page = await fetch(sceneUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /id="app"/);
  assert.doesNotMatch(html, /id="root"/);
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)(?:[^"\s]*)"/g)].map((match) => match[1]);
  assert.ok(assets.some((path) => path.endsWith('.js')));
  for (const path of assets) {
    const response = await fetch(new URL(path, sceneUrl));
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/, path);
  }
  const glb = await fetch(new URL('smart_warehouse.glb?v=2.3.0', sceneUrl));
  assert.equal(glb.status, 200);
  const bytes = Buffer.from(await glb.arrayBuffer());
  inspectWarehouseGlb(bytes);
  assert.equal(gitHash(bytes), gitHash(await readFile(resolve(sourceRoot, 'upstream/public/smart_warehouse.glb'))));
  for (const [served, source] of [['LICENSE.txt', 'upstream/LICENSE'], ['source.json', 'source.json']]) {
    const response = await fetch(new URL(served, sceneUrl));
    assert.equal(response.status, 200, served);
    assert.equal(await response.text(), await readFile(resolve(sourceRoot, source), 'utf8'));
  }
  console.log(`Smart Warehouse HTTP: host, deep link, original page, ${assets.length} bundles, model, license and provenance passed at ${baseUrl}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await verifyWarehouseSources();
  if (process.argv.includes('--dist')) await verifyWarehouseBuild();
  const http = process.argv.indexOf('--http');
  if (http >= 0) {
    assert.ok(process.argv[http + 1], '--http requires a base URL including any deployment subdirectory');
    await verifyWarehouseHttp(process.argv[http + 1]);
  }
  if (process.argv.includes('--serve')) {
    const { preview } = await import('vite');
    const server = await preview({ preview: { host: '127.0.0.1', port: 4174, strictPort: true } });
    try {
      await verifyWarehouseHttp('http://127.0.0.1:4174/');
    } finally {
      await new Promise((done, reject) => server.httpServer.close((error) => error ? reject(error) : done()));
    }
  }
}
