import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { preview as startPreview } from 'vite';
import { root, demoById, locations } from './open-demos.mjs';

// One process owns its test servers and proxy, including isolated loopback environments.
const children = [];
let preview;
async function unusedPort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done)); return port;
}
async function health(url, child) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Original backend stopped with ${child.exitCode}`);
    try { const result = await fetch(url); if (result.ok) return result.json(); } catch {}
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Original backend did not become ready: ${url}`);
}
try {
  for (const id of ['waretwin', 'rftwin']) {
    const demo = demoById(id); const port = await unusedPort();
    process.env[demo.backend.portEnv] = String(port);
    const child = spawn(process.execPath, [join(root, 'scripts/start-open-demo.mjs'), id], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TWIN_DB: join(locations(demo).cache, 'data/http-validation.db') },
    });
    let logs = '';
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    children.push({ child, logs: () => logs });
    const ready = await health(`http://127.0.0.1:${port}/api/health`, child);
    assert.ok(ready.ok === true || ready.status === 'ok', id);
  }
  preview = await startPreview({ configFile: join(root, 'vite.config.ts'), preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  const origin = `http://127.0.0.1:${preview.httpServer.address().port}`;
  const python = join(locations(demoById('waretwin')).cache, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const check = spawn(python, [join(root, 'scripts/verify-open-demo-backends.py'), origin], { cwd: root, stdio: 'inherit' });
  const [code] = await once(check, 'exit');
  assert.equal(code, 0, 'Original backends must pass through the same production HTTP/WebSocket proxy as the UI');
} catch (error) {
  for (const entry of children) console.error(entry.logs());
  console.error(error); process.exitCode = 1;
} finally {
  for (const { child } of children) if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.all(children.map(({ child }) => child.exitCode === null ? once(child, 'exit') : Promise.resolve()));
  if (preview) await new Promise((done) => preview.httpServer.close(done));
}
