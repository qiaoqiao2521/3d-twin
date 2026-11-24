import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { publishSource, sha256 } from '../../scripts/hardware/common.mjs';
import { originalPublicAssets } from '../../scripts/public-assets-plugin.mjs';

test('a partial extraction still publishes the complete upstream original archive and full member index', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hardware-originals-'));
  try {
    const original = path.join(temp, 'upstream'); await fs.mkdir(path.join(original, 'CAD'), { recursive: true });
    await fs.writeFile(path.join(original, 'LICENSE'), 'Original license\n');
    await fs.writeFile(path.join(original, 'CAD', 'native.step'), 'ISO-10303-21; original\n');
    await fs.writeFile(path.join(original, 'CAD', 'private-format.f3d.001'), Buffer.from([0, 1, 2, 3]));
    const archive = path.join(temp, 'source.tar.gz'); execFileSync('tar', ['-czf', archive, '-C', temp, 'upstream']);
    const before = await sha256(path.join(original, 'CAD', 'native.step'));
    const assetDir = path.join(temp, 'public');
    const output = await publishSource({ assetDir, sourceRoot: original, archivePath: archive, paths: ['LICENSE', 'CAD/native.step'], source: { id: 'fixture', repository: 'https://github.com/example/original', revision: 'a'.repeat(40), license: 'BSD-3-Clause' } });
    assert.equal(output.files.length, 3); assert.equal(output.source.fileCount, 3);
    assert.equal(output.files.filter(file => file.url).length, 2);
    assert.ok(output.files.every(file => file.archive === output.source.archive));
    assert.equal(output.files.find(file => file.path.endsWith('.001')).url, undefined);
    assert.equal(await sha256(path.join(assetDir, 'originals/fixture/CAD/native.step')), before);
    assert.equal(await sha256(path.join(original, 'CAD/native.step')), before);
    assert.equal(await sha256(path.join(assetDir, output.source.archive)), await sha256(archive));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('actual HTTP serves encoded plus, question-mark and Unicode filenames with range support', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hardware-http-'));
  let server;
  try {
    const original = 'R1_C++ 整机#1?.xml', content = Buffer.from('<robot name="原始结构"/>');
    await fs.mkdir(path.join(temp, 'baselines'), { recursive: true });
    await fs.writeFile(path.join(temp, 'baselines', original), content);
    let middleware;
    const plugin = originalPublicAssets(); plugin.configResolved({ root: temp, base: '/', publicDir: temp, build: { outDir: 'dist' } });
    plugin.configureServer({ middlewares: { use(value) { middleware = value; } } });
    server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 200; response.end('SPA'); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = `${origin}/baselines/${encodeURIComponent(original)}`;
    const response = await fetch(url); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/xml'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
    const range = await fetch(url, { headers: { Range: 'bytes=0-5' } }); assert.equal(range.status, 206); assert.deepEqual(Buffer.from(await range.arrayBuffer()), content.subarray(0, 6));
    const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), content.length);
    const missing = await fetch(`${origin}/baselines/missing.xml`); assert.equal(missing.status, 404); assert.notEqual(await missing.text(), 'SPA');
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); }
});

test('production originals are ordinary output files and missing model resources return 404', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hardware-public-'));
  try {
    const publicDir = path.join(temp, 'public'), output = path.join(temp, 'dist');
    await fs.mkdir(path.join(publicDir, 'hardware', 'thor'), { recursive: true });
    await fs.writeFile(path.join(publicDir, 'hardware', 'thor', 'source.bin'), Buffer.from([12, 18, 25]));
    const plugin = originalPublicAssets(); plugin.configResolved({ root: temp, base: '/', publicDir, build: { outDir: 'dist' } }); await plugin.writeBundle();
    const published = path.join(output, 'hardware', 'thor', 'source.bin');
    assert.equal((await fs.lstat(published)).isFile(), true); assert.equal((await fs.lstat(published)).isSymbolicLink(), false);
    assert.equal(await sha256(published), await sha256(path.join(publicDir, 'hardware', 'thor', 'source.bin')));
    let middleware; plugin.configurePreviewServer({ middlewares: { use(value) { middleware = value; } } });
    let continued = false; await middleware({ url: '/?workspace=hardware&asset=thor' }, {}, () => { continued = true; }); assert.equal(continued, true);
    const response = { statusCode: 200, setHeader() {}, end(value) { this.body = value; } };
    await middleware({ url: '/hardware/thor/missing.glb' }, response, () => assert.fail('Missing model must not become SPA HTML'));
    assert.equal(response.statusCode, 404); assert.equal(response.body, 'Original asset not found');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
