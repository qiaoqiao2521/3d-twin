/* Host-only lifecycle adapter. Original OLSK models and controls are unchanged. */
(() => {
  'use strict';
  if (window.__hardwareLifecycleInstalled) return;
  window.__hardwareLifecycleInstalled = true;
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const frames = new Map();
  const pointers = new Map();
  const contexts = new Set();
  const workers = new Set();
  const getContext = HTMLCanvasElement.prototype.getContext;
  let sequence = 0;
  let hidden = document.hidden;
  let disposed = false;
  let reactRoot = null;
  const NativeWorker = window.Worker;
  if (typeof NativeWorker === 'function') {
    window.Worker = class HardwareDocumentWorker extends NativeWorker {
      constructor(...args) {
        if (disposed) throw new Error('This hardware scene has been disposed');
        super(...args);
        workers.add(this);
      }
      terminate() { workers.delete(this); return super.terminate(); }
    };
  }
  HTMLCanvasElement.prototype.getContext = function (type, ...options) {
    const webgl = /^(webgl2?|experimental-webgl)$/.test(String(type));
    if (disposed && webgl) return null;
    const context = getContext.call(this, type, ...options);
    if (webgl && context) contexts.add(context);
    return context;
  };

  function schedule(id, frame) {
    frame.native = request((time) => {
      if (!frames.has(id)) return;
      frame.native = null;
      if (hidden || disposed) return;
      frames.delete(id);
      frame.callback(time);
    });
  }
  window.requestAnimationFrame = (callback) => {
    const id = ++sequence;
    if (disposed) return id;
    const frame = { callback, native: null };
    frames.set(id, frame);
    if (!hidden) schedule(id, frame);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const frame = frames.get(id);
    if (frame?.native != null) cancel(frame.native);
    frames.delete(id);
  };
  function releaseInput() {
    for (const [id, pointer] of pointers) {
      const target = pointer.target?.isConnected ? pointer.target : document;
      target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: pointer.type }));
      try { if (pointer.target?.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id); } catch { /* detached canvas */ }
    }
    pointers.clear();
    window.dispatchEvent(new Event('blur'));
    if (document.pointerLockElement) document.exitPointerLock();
  }
  const pointerDown = (event) => pointers.set(event.pointerId, { target: event.target, type: event.pointerType });
  const pointerUp = (event) => pointers.delete(event.pointerId);
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('pointerup', pointerUp, true);
  document.addEventListener('pointercancel', pointerUp, true);

  // Contract: true means the host is hidden/paused; false means visible.
  window.__hardwareScenePause = (isHidden) => {
    if (disposed) return;
    hidden = Boolean(isHidden);
    if (hidden) {
      for (const frame of frames.values()) {
        if (frame.native != null) cancel(frame.native);
        frame.native = null;
      }
      releaseInput();
      document.querySelectorAll('audio, video').forEach((media) => media.pause());
    } else {
      for (const [id, frame] of frames) if (frame.native == null) schedule(id, frame);
    }
  };
  window.__hardwareRegisterReactRoot = (root) => {
    if (disposed) { root.unmount(); return false; }
    reactRoot = root;
    return true;
  };
  window.__hardwareSceneDispose = () => {
    if (disposed) return;
    window.__hardwareScenePause(true);
    disposed = true;
    try { reactRoot?.unmount(); }
    catch (error) { console.error('Original OLSK root cleanup failed', error); }
    reactRoot = null;
    for (const worker of workers) worker.terminate();
    workers.clear();
    for (const context of contexts) {
      try { if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already destroyed */ }
    }
    contexts.clear();
    for (const frame of frames.values()) if (frame.native != null) cancel(frame.native);
    frames.clear();
    document.removeEventListener('pointerdown', pointerDown, true);
    document.removeEventListener('pointerup', pointerUp, true);
    document.removeEventListener('pointercancel', pointerUp, true);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('hardware:dispose', onDispose);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
  const onDispose = () => window.__hardwareSceneDispose();
  const onVisibility = () => window.__hardwareScenePause(document.hidden);
  const onPageHide = (event) => event.persisted ? window.__hardwareScenePause(true) : onDispose();
  const onPageShow = () => window.__hardwareScenePause(document.hidden);
  const onMessage = (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === 'hardware:dispose') onDispose();
    if (event.data?.type === 'hardware:pause') window.__hardwareScenePause(Boolean(event.data.hidden));
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('hardware:dispose', onDispose);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
})();
