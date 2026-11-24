import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalog, digest, locations, root, verifySource } from './open-demos.mjs';

const dist = process.argv.includes('--dist');
const base = join(root, dist ? 'dist' : 'public');
let preview;
let origin;
if (process.argv.includes('--serve')) {
  if (!dist) throw new Error('--serve verifies the actual production preview; pass --dist after npm run build.');
  const { preview: start } = await import('vite');
  preview = await start({ configFile: join(root, 'vite.config.ts'), preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  origin = `http://127.0.0.1:${preview.httpServer.address().port}`;
}
try {
  let count = 0;
  for (const demo of catalog) {
    await verifySource(demo);
    assert.equal(digest(await readFile(join(root, 'integrations/open-demos/licenses', `${demo.id}-MIT.txt`))),
      digest(await readFile(join(locations(demo).source, 'LICENSE'))), `${demo.name}: checked-in license must be the unchanged original`);
    const directory = join(base, 'open-demos', demo.id);
    const manifest = JSON.parse(await readFile(join(directory, 'ASSET-MANIFEST.json'), 'utf8'));
    assert.equal(manifest.revision, demo.revision);
    assert.ok(manifest.resources.length > 5, `${demo.name} must contain the original application, not a link page`);
    const source = JSON.parse(await readFile(join(directory, 'SOURCE.json'), 'utf8'));
    assert.equal(source.tree, demo.tree);
    for (const resource of manifest.resources) {
      assert.ok(!resource.path.includes('..'));
      const bytes = await readFile(join(directory, resource.path));
      assert.equal(bytes.length, resource.bytes, resource.path);
      assert.equal(digest(bytes), resource.sha256, resource.path);
      if (origin) {
        const url = `${origin}/open-demos/${demo.id}/${resource.path.split('/').map(encodeURIComponent).join('/')}`;
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        assert.equal(digest(Buffer.from(await response.arrayBuffer())), resource.sha256, `${url}: no SPA fallback or missing resource`);
      }
      count++;
    }
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    assert.ok(html.includes(`name="open-demo-id" content="${demo.id}"`));
    assert.ok(html.includes('host-lifecycle.js'));
    if (demo.id === 'warehouse-journey') {
      assert.ok(html.includes('/open-demos/warehouse-journey/_next/'));
      assert.ok(manifest.resources.some((r) => r.path === 'fonts/OFL-Manrope.txt'));
    }
    if (demo.id === 'waretwin') assert.ok(manifest.resources.some((r) => r.path === 'fonts/inter-OFL.txt'));
    if (demo.id === 'rftwin') {
      for (const name of ['manifest.json', 'initial_snapshot.json', 'snapshots.ndjson', 'events.ndjson', 'amr_patches.ndjson', 'panels.json']) {
        assert.ok(manifest.resources.some((r) => r.path === `demo/${name}`), `Missing original replay: ${name}`);
      }
    }
    if (origin) {
      for (const source of ['local', 'live']) {
        const route = `${origin}/?workspace=open-demos&demo=${demo.id}&source=${source}`;
        const response = await fetch(route);
        assert.equal(response.status, 200, route);
        assert.ok((await response.text()).includes('<div id="root">'), route);
      }
    }
    console.log(`${demo.name}: frozen source, license, original resources and ${origin ? 'HTTP' : 'filesystem'} hashes passed`);
  }
  if (origin) {
    for (const route of ['/?workspace=open-demos', '/?mode=warehouse', '/?mode=automotive', '/?mode=iron', '/?mode=hangar']) {
      const response = await fetch(origin + route); assert.equal(response.status, 200, route);
    }
  }
  console.log(`${catalog.length} complete original demos; ${count} resources verified. This is not a visual/WebGL acceptance result.`);
} finally { if (preview) await new Promise((done) => preview.httpServer.close(done)); }
