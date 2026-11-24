import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { adaptRftwinReplayBanner, demoById, locations } from '../../scripts/open-demos.mjs';
import { OPEN_DEMO_IDS, openDemoEntry, readOpenDemoStatus, disposeOpenDemoFrame } from '../../src/utils/openDemos.ts';

test('catalog and route IDs agree and preserve local deployment paths', async () => {
  const catalog = JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog.map((entry) => entry.id), [...OPEN_DEMO_IDS]);
  assert.equal(openDemoEntry('rftwin', 'live', '/host/'), '/host/open-demos/rftwin/index.html?source=live');
  assert.equal(openDemoEntry('warehouse-journey', 'live'), '/open-demos/warehouse-journey/index.html?source=local');
  for (const entry of catalog) assert.match(entry.revision, /^[a-f0-9]{40}$/);
});

test('source status only accepts the selected original app and its real state vocabulary', () => {
  assert.equal(readOpenDemoStatus({ type: 'open-demo:status', id: 'rftwin', status: 'LOCAL_DEMO' }, 'rftwin'), 'LOCAL_DEMO');
  assert.equal(readOpenDemoStatus({ type: 'open-demo:status', id: 'rftwin', status: 'LIVE' }, 'waretwin'), null);
  assert.equal(readOpenDemoStatus({ type: 'open-demo:status', id: 'rftwin', status: 'fully-verified' }, 'rftwin'), null);
  assert.equal(readOpenDemoStatus(null, 'rftwin'), null);
});

test('leaving a frame dispatches teardown before document removal, even when its document becomes inaccessible', () => {
  const events = [];
  const frame = { src: 'original', contentWindow: { dispatchEvent: (event) => { events.push([event.type, frame.src]); } } };
  disposeOpenDemoFrame(frame);
  assert.deepEqual(events, [['open-demo:dispose', 'original']]);
  assert.equal(frame.src, 'about:blank');
  const redirected = { src: 'original', get contentWindow() { throw new Error('cross-origin'); } };
  disposeOpenDemoFrame(redirected);
  assert.equal(redirected.src, 'about:blank');
});

test('lifecycle closes workers, sockets and audio, releases capture and WebGL once, and preserves bfcache', async () => {
  const calls = [];
  const listeners = new Map();
  class Socket {
    addEventListener() {}
    close() { calls.push('socket'); }
  }
  class Worker { terminate() { calls.push('worker'); } }
  class Audio {
    state = 'running';
    close() { this.state = 'closed'; calls.push('audio'); return Promise.resolve(); }
  }
  const document = {
    querySelector: () => ({ content: 'rftwin' }),
    querySelectorAll: (selector) => selector === 'canvas' ? [{ getContext: () => ({ getExtension: () => ({ loseContext: () => calls.push('webgl') }) }) }]
      : [{ pause: () => calls.push('media') }],
    activeElement: { blur: () => calls.push('input') }, pointerLockElement: {}, fullscreenElement: {},
    exitPointerLock: () => calls.push('pointer-lock'),
    exitFullscreen: () => { calls.push('fullscreen'); return Promise.resolve(); },
  };
  const window = {
    WebSocket: Socket, Worker, AudioContext: Audio,
    parent: { postMessage: () => {} },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: (event) => calls.push(event.type),
  };
  vm.runInNewContext(await readFile(new URL('./lifecycle.js', import.meta.url), 'utf8'), { window, document, location: { origin: 'http://localhost' }, Event, console });
  new window.WebSocket(); new window.Worker(); new window.AudioContext();
  window.__openDemoHost.register(() => calls.push('unmount'));
  listeners.get('pagehide')({ persisted: true });
  assert.deepEqual(calls, []);
  const dispose = listeners.get('open-demo:dispose'); dispose(); dispose();
  for (const resource of ['unmount', 'input', 'media', 'socket', 'worker', 'audio', 'pointer-lock', 'fullscreen', 'webgl']) {
    assert.equal(calls.filter((call) => call === resource).length, 1, resource);
  }
  assert.ok(calls.indexOf('unmount') < calls.indexOf('webgl'));
  assert.equal(listeners.size, 0);
});

test('explicit RFTwin replay selects fixture mode before panels mount and never starts a late unmounted player', async () => {
  const code = ts.transpileModule(await readFile(new URL('./rftwin-start.ts.txt', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^import .*;$/gm, '').replace('export function start', 'function start');
  const evaluate = new Function('useTwin', 'startOriginal', 'loadDemo', 'startDemo', 'stopDemo', 'location', `${code}\nreturn start;`);
  const states = []; let connected = 0; let played = 0; let stopped = 0; let loaded;
  const store = { setState: (state) => states.push(state) };
  const start = evaluate(store, () => { connected++; return () => {}; }, () => new Promise((done) => { loaded = done; }), () => { played++; }, () => { stopped++; }, { search: '?source=local' });
  assert.equal(states[0].mode, 'LOCAL_DEMO', 'panel effects must select the original fixture API before App starts');
  const cleanup = start(); cleanup(); loaded(true); await Promise.resolve();
  assert.equal(connected, 0); assert.equal(played, 0); assert.equal(stopped, 1);
  const live = evaluate(store, () => { connected++; return () => {}; }, () => Promise.resolve(true), () => { played++; }, () => {}, { search: '?source=live' });
  live(); assert.equal(connected, 1); assert.equal(played, 0);
});

test('RFTwin English and Chinese explicit-local banners never claim reconnection, while live fallback keeps the original messages', async () => {
  const original = await readFile(`${locations(demoById('rftwin')).source}/frontend/src/i18n/index.ts`, 'utf8');
  const values = (code) => [...code.matchAll(/"conn.demo": (.+),$/gm)].map((match) => match[1]);
  const sourceValues = values(original);
  const adaptedValues = values(adaptRftwinReplayBanner(original));
  assert.equal(sourceValues.length, 2); assert.equal(adaptedValues.length, 2);
  for (let index = 0; index < adaptedValues.length; index++) {
    const read = new Function('location', `return ${adaptedValues[index]};`);
    const expected = JSON.parse(sourceValues[index]);
    assert.equal(read({ search: '?source=live' }), expected);
    assert.equal(read({ search: '' }), expected);
    const local = read({ search: '?source=local' });
    assert.match(local, index === 0 ? /does not connect to the live backend/ : /不會連接即時後端/);
    assert.doesNotMatch(local, /reconnecting in the background|背景持續嘗試重新連線/);
  }
  assert.throws(() => adaptRftwinReplayBanner('changed upstream translations'), /banner changed/);
});
