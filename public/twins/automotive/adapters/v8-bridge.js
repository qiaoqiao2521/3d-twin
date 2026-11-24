// Runs inside the original V8 ES module after its native APIs are initialized.
const atlasHost = window.location.origin;
const atlasChannel = 'car-atlas-v1';
let atlasActive = true, atlasFrames = 0, atlasRate = 1;
const atlasParams = [
  { key: 'rpm', label: '发动机转速', type: 'range', min: 300, max: 9000, step: 100, unit: 'rpm' },
  { key: 'theta', label: '曲轴角度', type: 'range', min: 0, max: 720, step: 1, unit: '°', hint: '拖动时暂停播放，便于观察相位' },
  { key: 'slow', label: '慢动作', type: 'boolean' },
  { key: 'cut', label: '显示剖面', type: 'boolean' },
  { key: 'explode', label: '展开部件', type: 'boolean' },
  { key: 'quality', label: '画质', type: 'enum', options: [{ value: 'performance', label: '性能' }, { value: 'balanced', label: '均衡' }, { value: 'high', label: '高' }] },
];
function atlasSnapshot() {
  return { controllerId: 'v8', paramsSchema: atlasParams, transport: ['play', 'pause', 'reset', 'setSpeed'],
    values: { rpm: state.rpm, theta: ((state.theta % 720) + 720) % 720, slow: state.slow, cut: state.cut, explode: state.explode, quality: state.quality },
    mode: TOUR.active ? 'tour' : state.learning ? 'learning' : 'manual', playing: state.playing, speed: atlasRate, active: atlasActive, renderedFrames: atlasFrames };
}
function atlasPublish(type, payload = atlasSnapshot()) {
  if (parent !== window) parent.postMessage({ channel: atlasChannel, type, payload }, atlasHost);
}
function atlasFrame(ts) { if (!atlasActive) return; atlasFrames++; frame(ts, Math.min(clock.getDelta(), 0.05) * atlasRate); }
function atlasSetActive(active) {
  if (active !== atlasActive) {
    atlasActive = active;
    if (active) { clock.getDelta(); AUDIO.prevT = null; renderer.setAnimationLoop(atlasFrame); if (AUDIO.ctx && AUDIO.on) AUDIO.ctx.resume().catch(e => console.warn('Audio resume', e)); }
    else { renderer.setAnimationLoop(null); if (AUDIO.ctx) AUDIO.ctx.suspend().catch(e => console.warn('Audio suspend', e)); }
  }
}
function atlasSetParam(key, value) {
  const definition = atlasParams.find(p => p.key === key);
  if (!definition) return false;
  if (definition.type === 'range' && (typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max)) return false;
  if (definition.type === 'boolean' && typeof value !== 'boolean') return false;
  if (definition.type === 'enum' && !definition.options.some(o => o.value === value)) return false;
  if (key === 'rpm') { if (TOUR.active) stopTour(); if (state.learning) stopLearning(); setRpm(value); }
  if (key === 'theta') { if (TOUR.active) stopTour(); if (state.learning) stopLearning(); setPlaying(false); setTheta(value); }
  if (key === 'slow') setSlow(value);
  if (key === 'cut') setCut(value, state.cutMode);
  if (key === 'explode') setExplode(value);
  if (key === 'quality') setQuality(value);
  return true;
}
addEventListener('message', event => {
  if (event.source !== parent || event.origin !== atlasHost || event.data?.channel !== atlasChannel) return;
  const { type, payload } = event.data;
  if (type === 'host.active' && typeof payload?.active === 'boolean') atlasSetActive(payload.active);
  else if (type === 'controller.param') { if (!atlasSetParam(payload?.key, payload?.value)) atlasPublish('controller.warning', { message: '参数无效，保留当前设置。' }); }
  else if (type === 'controller.transport') {
    if (payload?.action === 'play' || payload?.action === 'pause') { if (TOUR.active) stopTour(); if (state.learning) stopLearning(); setPlaying(payload.action === 'play'); }
    else if (payload?.action === 'reset') { if (TOUR.active) stopTour(); if (state.learning) stopLearning(); setPlaying(false); setTheta(0); }
    else if (payload?.action === 'setSpeed' && typeof payload.value === 'number' && Number.isFinite(payload.value) && payload.value > 0 && payload.value <= 4) atlasRate = payload.value;
    else atlasPublish('controller.warning', { message: '不支持的播放操作。' });
  } else if (type !== 'host.hello' && type !== 'host.snapshot') return;
  atlasPublish('engine.state');
});
document.addEventListener('visibilitychange', () => { if (!atlasActive && AUDIO.ctx) AUDIO.ctx.suspend().catch(e => console.warn('Audio suspend', e)); });
document.addEventListener('change', () => atlasPublish('engine.state'));
document.addEventListener('click', () => queueMicrotask(() => atlasPublish('engine.state')));
renderer.setAnimationLoop(atlasFrame);
atlasPublish('engine.ready');
