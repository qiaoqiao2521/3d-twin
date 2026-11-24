import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./adapters/host-lifecycle.js', import.meta.url), 'utf8');

function fixture(initiallyHidden = false) {
  class Target {
    listeners = new Map();
    isConnected = true;
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatchEvent(event) { if (!event.target) event.target = this; for (const listener of [...this.listeners.get(event.type) || []]) listener(event); return true; }
  }
  class FakeEvent { constructor(type, detail = {}) { this.type = type; Object.assign(this, detail); } }
  const window = new Target();
  const document = new Target();
  const pending = new Map();
  let next = 100, mediaPauses = 0, pointerExits = 0, contextLosses = 0, workerTerminations = 0;
  window.parent = {};
  window.Worker = class { terminate() { workerTerminations++; } };
  window.requestAnimationFrame = callback => { const id = next++; pending.set(id, callback); return id; };
  window.cancelAnimationFrame = id => pending.delete(id);
  document.hidden = initiallyHidden;
  document.querySelectorAll = () => [{ pause() { mediaPauses++; } }];
  document.exitPointerLock = () => { pointerExits++; document.pointerLockElement = null; };
  class Canvas { getContext() { return { isContextLost: () => false, getExtension: name => name === 'WEBGL_lose_context' ? { loseContext() { contextLosses++; } } : null }; } }
  vm.runInNewContext(source, { window, document, HTMLCanvasElement: Canvas, location: { origin: 'https://twin.example' }, Event: FakeEvent, PointerEvent: FakeEvent, console });
  return { window, document, Canvas, Target, FakeEvent, pending,
    flush() { const calls = [...pending.values()]; pending.clear(); calls.forEach(callback => callback(123)); },
    stats: () => ({ mediaPauses, pointerExits, contextLosses, workerTerminations }) };
}

test('hidden and bfcache preserve pending frames, release pointer capture, and resume once', () => {
  const f = fixture(true);
  let frames = 0, unmounts = 0, captureReleases = 0, cancellations = 0;
  f.window.__hardwareRegisterReactRoot({ unmount() { unmounts++; } });
  f.window.requestAnimationFrame(() => frames++);
  assert.equal(f.pending.size, 0);
  f.document.hidden = false;
  f.window.__hardwareScenePause(false);
  assert.equal(f.pending.size, 1);
  const target = new f.Target();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = () => captureReleases++;
  f.document.dispatchEvent(new f.FakeEvent('pointerdown', { pointerId: 7, pointerType: 'touch', target }));
  target.isConnected = false;
  f.document.addEventListener('pointercancel', () => cancellations++);
  f.document.pointerLockElement = target;
  f.window.dispatchEvent(new f.FakeEvent('pagehide', { persisted: true }));
  assert.equal(f.pending.size, 0);
  assert.equal(captureReleases, 1);
  assert.equal(cancellations, 1);
  assert.equal(f.stats().pointerExits, 1);
  assert.equal(unmounts, 0);
  f.window.dispatchEvent(new f.FakeEvent('pageshow', { persisted: true }));
  f.window.__hardwareScenePause(false);
  assert.equal(f.pending.size, 1);
  f.flush();
  assert.equal(frames, 1);
});

test('only direct same-origin parent messages dispose; original React root unmounts once', () => {
  const f = fixture();
  let unmounts = 0, frames = 0;
  f.window.__hardwareRegisterReactRoot({ unmount() { unmounts++; } });
  new f.Canvas().getContext('webgl2');
  new f.window.Worker('draco-decoder.js');
  new f.window.Worker('second-decoder.js');
  f.window.requestAnimationFrame(() => frames++);
  for (const [origin, source] of [['https://other.example', f.window.parent], ['https://twin.example', {}]]) {
    f.window.dispatchEvent(new f.FakeEvent('message', { origin, source, data: { type: 'hardware:dispose' } }));
  }
  assert.equal(unmounts, 0);
  f.window.dispatchEvent(new f.FakeEvent('message', { origin: 'https://twin.example', source: f.window.parent, data: { type: 'hardware:dispose' } }));
  f.window.__hardwareSceneDispose();
  f.window.__hardwareScenePause(false);
  f.flush();
  assert.equal(unmounts, 1);
  assert.equal(frames, 0);
  assert.equal(f.stats().contextLosses, 1);
  assert.equal(f.stats().workerTerminations, 2);
  assert.throws(() => new f.window.Worker('late-decoder.js'), /disposed/);
  assert.equal(new f.Canvas().getContext('webgl'), null);
  f.window.requestAnimationFrame(() => frames++);
  assert.equal(f.pending.size, 0);
});

test('dispose before lazy application registration refuses a later render', () => {
  const f = fixture();
  let unmounts = 0;
  f.window.dispatchEvent(new f.FakeEvent('pagehide', { persisted: false }));
  assert.equal(f.window.__hardwareRegisterReactRoot({ unmount() { unmounts++; } }), false);
  assert.equal(unmounts, 1);
  assert.equal(f.pending.size, 0);
});
