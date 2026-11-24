import assert from 'node:assert/strict';
import test from 'node:test';
import { disposeWarehouseFrame, installWarehouseLifecycle, WAREHOUSE_DISPOSE_EVENT } from './lifecycle.ts';

function fixture() {
  const calls: string[] = [];
  const scope = new EventTarget() as EventTarget & { document: unknown };
  scope.document = {
    querySelectorAll(selector: string) {
      return selector === 'audio, video'
        ? [{ pause: () => calls.push('pause-media') }]
        : [{ getContext: () => ({ getExtension: () => ({ loseContext: () => calls.push('release-webgl') }) }) }];
    },
    pointerLockElement: {},
    exitPointerLock: () => calls.push('release-pointer-lock'),
    fullscreenElement: {},
    exitFullscreen: async () => { calls.push('exit-fullscreen'); }
  };
  return { calls, scope: scope as unknown as Window };
}

test('leaving calls original Vue cleanup once, releases input and media, then loses WebGL context', () => {
  const { calls, scope } = fixture();
  const dispose = installWarehouseLifecycle({ unmount: () => calls.push('original-unmount') }, scope);
  scope.dispatchEvent(new Event(WAREHOUSE_DISPOSE_EVENT));
  scope.dispatchEvent(new Event('pagehide'));
  dispose();
  assert.deepEqual(calls, ['pause-media', 'release-pointer-lock', 'exit-fullscreen', 'original-unmount', 'release-webgl']);
});

test('standalone back/forward cache keeps the scene mounted until an actual exit', () => {
  const { calls, scope } = fixture();
  installWarehouseLifecycle({ unmount: () => calls.push('original-unmount') }, scope);
  const cached = new Event('pagehide');
  Object.defineProperty(cached, 'persisted', { value: true });
  scope.dispatchEvent(cached);
  assert.deepEqual(calls, []);
  scope.dispatchEvent(new Event('pagehide'));
  assert.ok(calls.includes('original-unmount'));
});

test('a failed original unmount still relinquishes the graphics context', () => {
  const { calls, scope } = fixture();
  const dispose = installWarehouseLifecycle({ unmount: () => { throw new Error('unmount failed'); } }, scope);
  assert.throws(dispose, /unmount failed/);
  assert.equal(calls.at(-1), 'release-webgl');
  dispose();
});

test('frame is disposed synchronously before navigation and redirected/error frames still unload', () => {
  const calls: string[] = [];
  const frame = {
    contentWindow: { dispatchEvent: (event: Event) => { calls.push(event.type); } },
    set src(value: string) { calls.push(value); }
  };
  disposeWarehouseFrame(frame as unknown as HTMLIFrameElement);
  assert.deepEqual(calls, [WAREHOUSE_DISPOSE_EVENT, 'about:blank']);
  const redirected = {
    get contentWindow() { throw new Error('cross-origin'); },
    set src(value: string) { calls.push(value); }
  };
  disposeWarehouseFrame(redirected as unknown as HTMLIFrameElement);
  assert.equal(calls.at(-1), 'about:blank');
  disposeWarehouseFrame(null);
});
