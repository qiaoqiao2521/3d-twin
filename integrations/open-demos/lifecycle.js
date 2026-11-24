/* Host adapter. Loaded before the original app; no simulation/render code changes. */
(() => {
  const id = document.querySelector('meta[name="open-demo-id"]')?.content;
  let unmount = null;
  let disposed = false;
  let status = '';
  const audio = new Set();
  const workers = new Set();
  const sockets = new Set();
  function track(name, resources) {
    const Original = window[name];
    if (typeof Original !== 'function') return;
    window[name] = new Proxy(Original, {
      construct(target, args, newTarget) {
        const instance = Reflect.construct(target, args, newTarget);
        resources.add(instance);
        if (name === 'WebSocket') instance.addEventListener('close', () => resources.delete(instance), { once: true });
        return instance;
      }
    });
  }
  track('AudioContext', audio);
  track('webkitAudioContext', audio);
  track('Worker', workers);
  track('WebSocket', sockets);
  function report(next) {
    if (disposed || status === next) return;
    status = next;
    window.parent.postMessage({ type: 'open-demo:status', id, status }, location.origin);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('open-demo:dispose', dispose);
    window.removeEventListener('pagehide', pagehide);
    const canvases = [...document.querySelectorAll('canvas')];
    try { unmount?.(); } catch (error) { console.warn('Original scene unmount failed', error); }
    window.dispatchEvent(new Event('blur'));
    document.activeElement?.blur?.();
    for (const media of document.querySelectorAll('audio, video')) media.pause();
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    for (const socket of sockets) { try { socket.close(1000, 'Scene closed'); } catch {} }
    for (const worker of workers) worker.terminate();
    for (const context of audio) { if (context.state !== 'closed') void context.close().catch(() => {}); }
    for (const canvas of canvases) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    sockets.clear(); workers.clear(); audio.clear();
  }
  function pagehide(event) { if (!event.persisted) dispose(); }
  window.__openDemoHost = { register: (cleanup) => { unmount = cleanup; }, report };
  window.addEventListener('open-demo:dispose', dispose);
  window.addEventListener('pagehide', pagehide);
  report(id === 'warehouse-journey' ? 'scripted' : 'connecting');
})();
