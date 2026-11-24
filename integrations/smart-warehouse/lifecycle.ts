/** Deployment adapter only. The frozen Vue app retains its own scene teardown. */
export const WAREHOUSE_DISPOSE_EVENT = 'smart-warehouse:dispose';

export function installWarehouseLifecycle(app: { unmount(): void }, scope: Window = window) {
  let disposed = false;
  const pagehide = (event: PageTransitionEvent) => {
    // A page in the back/forward cache is suspended by the browser and must stay
    // mounted so the standalone entry can be restored by browser history.
    if (!event.persisted) dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scope.removeEventListener(WAREHOUSE_DISPOSE_EVENT, dispose);
    scope.removeEventListener('pagehide', pagehide);
    const document = scope.document;
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.canvas-container canvas')];
    for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) media.pause();
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    try {
      // Calls the original onUnmounted hooks: abort model loading, cancel RAF,
      // remove input handlers, stop the HUD clock and dispose scene resources.
      app.unmount();
    } finally {
      for (const canvas of canvases) {
        const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
        context?.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }
  };
  scope.addEventListener(WAREHOUSE_DISPOSE_EVENT, dispose);
  scope.addEventListener('pagehide', pagehide);
  return dispose;
}

/** Run while the same-origin iframe is still attached, including reloads. */
export function disposeWarehouseFrame(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  try {
    frame.contentWindow?.dispatchEvent(new Event(WAREHOUSE_DISPOSE_EVENT));
  } catch {
    // An error page or a redirected document may be cross-origin. Navigating
    // away still terminates that document; never try to inspect its contents.
  } finally {
    frame.src = 'about:blank';
  }
}
