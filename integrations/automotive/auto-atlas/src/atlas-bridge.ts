const hostOrigin = window.location.origin;
const channel = 'car-atlas-v1';
export function connectAtlasBridge(handlers: {
  active(value: boolean): void;
  state(): unknown;
  filter(paths: string[] | null): void;
  bindings(modelId: string, rules: unknown[]): void;
}) {
  const publish = (type: string, payload: unknown) => {
    if (window.parent !== window) window.parent.postMessage({ channel, type, payload }, hostOrigin);
  };
  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== hostOrigin || event.data?.channel !== channel) return;
    const { type, payload } = event.data;
    if (type === 'host.active' && typeof payload?.active === 'boolean') handlers.active(payload.active);
    else if (type === 'vehicle.filter' && (payload?.paths === null || (Array.isArray(payload?.paths) && payload.paths.every((path: unknown) => typeof path === 'string')))) handlers.filter(payload.paths);
    else if (type === 'vehicle.bindings' && typeof payload?.modelId === 'string' && Array.isArray(payload?.rules)) handlers.bindings(payload.modelId, payload.rules);
    else if (type !== 'host.hello' && type !== 'host.snapshot') return;
    publish('vehicle.state', handlers.state());
  };
  window.addEventListener('message', receive);
  publish('vehicle.ready', handlers.state());
  return { publish, dispose() { window.removeEventListener('message', receive); } };
}
