import { loadAtlasData, resolveSelection, relationsForPart, selectorMatches } from './contracts.js';
const views={
 vehicle:{eyebrow:'整车结构',title:'拆开一辆车，看看每个部件',description:'切换车型、选择部件，或拖动爆炸滑块展开整车。',availability:'本地部署',label:'整车与零件',source:'Auto Atlas',url:new URL('./auto-atlas/index.html', location.href).href,reference:'https://github.com/ahnuchen/auto-atlas',foot:'模型提供外观及车身部件，内部机械结构以原模型内容为准。'},
 engine:{eyebrow:'发动机运转',title:'走进发动机，看见机械的节奏',description:'剖开 V8 发动机，观察活塞、曲轴和四冲程。',availability:'本地部署',label:'独立发动机示意',source:'V8 Engine Explorer',url:new URL('./v8/integrated.html', location.href).href,reference:'https://github.com/ssabeeth/v8-engine-explorer',foot:'这是独立的 V8 示意模型，与整车视图不是同一辆车。'},
 systems:{eyebrow:'汽车系统',title:'从动力到车轮，逐个系统了解',description:'查看发动机、传动、制动与其他系统的结构和说明。',availability:'在线参考',label:'系统结构百科',source:'Car Anatomy',url:'https://www.underthehood.online/explore/',reference:'https://www.underthehood.online/about/',foot:'第三方在线页面，内容与界面由原作者提供；需要联网。'}
};
const channel = 'car-atlas-v1';
const set = (id, value) => document.getElementById(id).textContent = value;
const status = message => set('atlas-status', message);
let currentView = 'vehicle', vehicleState = null, engineState = null, selectedConcept = null;
let data = { parts: [], systems: [], models: [], bindings: [], relations: [], warnings: [] };
const lifecycle = {};
let configuredVehicle = null;
function frameFor(key) { return document.querySelector(`#${key}-slot iframe`); }
function send(key, type, payload = {}) {
  const frame = frameFor(key);
  if (frame) frame.contentWindow.postMessage({ channel, type, payload }, new URL(views[key].url).origin);
}
function mount(key) {
  const slot = document.getElementById(key + '-slot');
  if (slot.firstElementChild) return;
  const frame = document.createElement('iframe'); frame.id = key + '-view'; frame.name = key + '-view'; frame.title = views[key].label; frame.src = views[key].url;
  frame.addEventListener('load', () => { send(key, 'host.hello'); send(key, 'host.active', { active: key === currentView && !document.hidden }); });
  slot.append(frame);
}
function syncLifecycle() {
  for (const key of ['vehicle', 'engine']) send(key, 'host.active', { active: key === currentView && !document.hidden });
  // The external site has no agreed bridge: unload it rather than assume postMessage can stop it.
  if (currentView !== 'systems' || document.hidden) document.getElementById('systems-slot').replaceChildren();
  else mount('systems');
}
function selectView(key) {
  const v = views[key]; if (!v) return;
  currentView = key;
  document.querySelectorAll('.nav-item').forEach(button => {
    const selected = button.dataset.view === key;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.frame-slot').forEach(slot => slot.classList.toggle('active', slot.id === key + '-slot'));
  mount(key); syncLifecycle();
  set('eyebrow', v.eyebrow); set('heading', v.title); set('description', v.description);
  set('availability', v.availability); set('stage-label', v.label); set('stage-source', v.source); set('footnote', v.foot);
  document.getElementById('open-source').href = v.url; document.getElementById('reference').href = v.reference;
  document.getElementById('controller-panel').hidden = key !== 'engine';
  status(key === 'systems' ? '在线参考；离开后释放该页面，返回时重新加载。' : key === 'engine' ? '使用统一控制或发动机原控制面板。' : '选择真实零件，或从目录查看结构与原理。');
  if (key === 'engine' && engineState) renderController(engineState);
}
function validVehicle() {
  return vehicleState && !vehicleState.loading && !vehicleState.error && vehicleState.runtime?.loadedModelId === vehicleState.modelId;
}
function configureVehicleBindings() {
  if (!validVehicle() || !data.bindings.length || configuredVehicle === vehicleState.modelId) return;
  configuredVehicle = vehicleState.modelId;
  const rules = data.bindings.filter(b => b.modelId === configuredVehicle).map(binding => ({
    paths: (vehicleState.parts || []).filter(part => binding.selectors.some(selector => selectorMatches(selector, part.sourcePath))).map(part => part.sourcePath),
    explode: binding.explode,
  })).filter(rule => rule.paths.length);
  send('vehicle', 'vehicle.bindings', { modelId: configuredVehicle, rules });
}
function pathsForPart(partId) {
  if (!validVehicle()) return [];
  const bindings = data.bindings.filter(b => b.modelId === vehicleState.modelId && b.partIds.includes(partId));
  return (vehicleState.parts || []).filter(p => bindings.some(b => b.selectors.some(s => selectorMatches(s, p.sourcePath)))).map(p => p.sourcePath);
}
function relationButton(relation) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = relation.label || relation.target?.name || '查看关联';
  button.dataset.relation = relation.id;
  button.title = relation.description || ({ principle: '通用原理，非实车配套', matched: '已确认配套', external: '第三方在线参考' }[relation.kind]);
  button.addEventListener('click', () => {
    const key = relation.target?.viewId;
    if (!views[key]) { status('关联视图暂未接入，保留当前观察。'); return; }
    selectView(key); status(relation.description || relation.kind);
  });
  return button;
}
function showConcept(partId, isolate = false) {
  const part = data.parts.find(p => p.id === partId); if (!part) return;
  selectedConcept = partId;
  set('selection-label', part.name);
  const paths = pathsForPart(partId);
  const membership = part.systems.map(id => data.systems.find(s => s.id === id)?.name).filter(Boolean).join('、');
  set('selection-detail', `${part.description || ''} ${membership ? `所属：${membership}。` : ''}${paths.length ? `当前车型匹配 ${paths.length} 个网格。` : '当前车型尚无已核实的对应网格。'}`);
  const actions = document.getElementById('relation-actions'); actions.replaceChildren();
  for (const relation of relationsForPart(partId, data, vehicleState?.modelId)) actions.append(relationButton(relation));
  if (paths.length) {
    const button = document.createElement('button'); button.textContent = '在整车中单独查看'; button.type = 'button';
    button.addEventListener('click', () => { selectView('vehicle'); send('vehicle', 'vehicle.filter', { paths }); }); actions.append(button);
  }
  if (isolate && paths.length) send('vehicle', 'vehicle.filter', { paths });
  renderCatalog();
}
function renderSelection() {
  if (!validVehicle()) {
    set('selection-label', vehicleState?.error ? '车型加载未完成' : '等待车型加载');
    set('selection-detail', vehicleState?.error ? String(vehicleState.error) : '加载完成后显示该车型的真实部件。');
    document.getElementById('relation-actions').replaceChildren(); return;
  }
  const selection = vehicleState.selected;
  if (!selection) { if (selectedConcept) showConcept(selectedConcept); else { set('selection-label', '选择模型零件或目录部件'); set('selection-detail', `已加载 ${vehicleState.parts?.length || 0} 个模型网格，未知节点保留原名。`); } return; }
  const result = resolveSelection({ modelId: vehicleState.modelId, selection, data });
  set('selection-label', result.label);
  set('selection-detail', result.matched ? `${result.parts.map(p => p.description || '').join(' ')}${result.granularity === 'merged_unseparable' ? ' 此网格不能按目录部件独立拆分。' : ''}` : '当前节点尚未绑定目录，保留原始名称与原有操作。');
  const actions = document.getElementById('relation-actions'); actions.replaceChildren();
  for (const relation of result.relations) actions.append(relationButton(relation));
}
function renderCatalog() {
  const mode = document.getElementById('catalog-mode').value;
  const system = document.getElementById('system-filter').value;
  document.getElementById('system-filter').hidden = mode !== 'systems';
  const term = document.getElementById('catalog-search').value.trim().toLowerCase();
  const container = document.getElementById('catalog-list'); container.replaceChildren();
  for (const part of data.parts.filter(p => (!term || `${p.name} ${p.id}`.toLowerCase().includes(term)) && (mode !== 'systems' || !system || p.systems.includes(system)))) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-part'; button.dataset.part = part.id;
    button.setAttribute('aria-current', String(selectedConcept === part.id));
    const label = document.createElement('span'); label.textContent = part.name; button.append(label);
    if (mode === 'structure' && part.structuralParent) {
      const parent = document.createElement('small'); parent.textContent = `装配于 ${data.parts.find(p => p.id === part.structuralParent)?.name || part.structuralParent}`; button.append(parent);
    }
    button.addEventListener('click', () => showConcept(part.id)); container.append(button);
  }
  if (!container.childElementCount) container.textContent = '没有匹配的目录部件。';
}
let controlSchemaKey = '';
function renderController(snapshot) {
  if (!Array.isArray(snapshot.paramsSchema)) return;
  set('controller-summary', snapshot.active ? (snapshot.playing ? '正在播放' : '已暂停') : '后台已挂起');
  const controls = document.getElementById('controller-controls');
  const schemaKey = JSON.stringify(snapshot.paramsSchema);
  if (schemaKey !== controlSchemaKey) {
    controls.replaceChildren(); controlSchemaKey = schemaKey;
    for (const parameter of snapshot.paramsSchema) {
      if (!parameter.key || !['range', 'enum', 'boolean'].includes(parameter.type)) continue;
      const label = document.createElement('label'); label.textContent = parameter.label;
      let input;
      if (parameter.type === 'enum') {
        input = document.createElement('select');
        for (const option of parameter.options || []) { const item = document.createElement('option'); item.value = option.value; item.textContent = option.label; input.append(item); }
      } else { input = document.createElement('input'); input.type = parameter.type === 'boolean' ? 'checkbox' : 'range'; }
      input.dataset.param = parameter.key; input.setAttribute('aria-label', parameter.label);
      if (parameter.type === 'range') { input.min = parameter.min; input.max = parameter.max; input.step = parameter.step || 1; }
      const output = document.createElement('output'); output.dataset.value = parameter.key;
      input.addEventListener('input', () => { output.textContent = parameter.type === 'range' ? `${input.value} ${parameter.unit || ''}` : ''; });
      input.addEventListener('change', () => send('engine', 'controller.param', { key: parameter.key, value: parameter.type === 'boolean' ? input.checked : parameter.type === 'range' ? Number(input.value) : input.value }));
      label.append(input, output); controls.append(label);
    }
  }
  for (const parameter of snapshot.paramsSchema) {
    const input = [...controls.querySelectorAll('[data-param]')].find(i => i.dataset.param === parameter.key);
    const output = [...controls.querySelectorAll('output')].find(i => i.dataset.value === parameter.key);
    const value = snapshot.values?.[parameter.key];
    if (!input || value === undefined || document.activeElement === input) continue;
    if (parameter.type === 'boolean') input.checked = value; else input.value = value;
    if (output) output.textContent = parameter.type === 'range' ? `${Math.round(value)} ${parameter.unit || ''}` : '';
  }
  if (document.activeElement !== document.getElementById('transport-speed')) document.getElementById('transport-speed').value = String(snapshot.speed || 1);
}
addEventListener('message', event => {
  if (event.data?.channel !== channel) return;
  const key = ['vehicle', 'engine'].find(key => frameFor(key)?.contentWindow === event.source && event.origin === new URL(views[key].url).origin);
  if (!key) return;
  const { type, payload } = event.data;
  if (typeof type !== 'string') return;
  if (!payload || typeof payload !== 'object') return;
  if (type === `${key}.ready`) { send(key, 'host.active', { active: key === currentView && !document.hidden }); }
  if (key === 'vehicle' && ['vehicle.ready', 'vehicle.state'].includes(type)) {
    vehicleState = payload;
    if (payload.loading || payload.error) configuredVehicle = null;
    configureVehicleBindings(); lifecycle.vehicle = payload.runtime;
    document.getElementById('vehicle-slot').dataset.runtime = JSON.stringify(payload.runtime || {});
    document.getElementById('filter-reset').hidden = !payload.filtered;
    renderSelection();
  }
  if (key === 'engine' && ['engine.ready', 'engine.state'].includes(type)) {
    engineState = payload; lifecycle.engine = { active: payload.active, renderedFrames: payload.renderedFrames, values: payload.values, playing: payload.playing, mode: payload.mode };
    document.getElementById('engine-slot').dataset.runtime = JSON.stringify(lifecycle.engine);
    renderController(payload);
  }
  if (type.endsWith('.warning')) status(String(payload.message || '部分功能暂不可用，仍可观察原视图。'));
});
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
document.querySelectorAll('[data-transport]').forEach(button => button.addEventListener('click', () => send('engine', 'controller.transport', { action: button.dataset.transport })));
document.getElementById('transport-speed').addEventListener('change', event => send('engine', 'controller.transport', { action: 'setSpeed', value: Number(event.target.value) }));
document.getElementById('filter-reset').addEventListener('click', () => send('vehicle', 'vehicle.filter', { paths: null }));
for (const id of ['catalog-search', 'system-filter', 'catalog-mode']) document.getElementById(id).addEventListener(id === 'catalog-search' ? 'input' : 'change', renderCatalog);
const focusButton = document.getElementById('focus');
focusButton.addEventListener('click', () => { const enabled = document.querySelector('.app').classList.toggle('focus'); focusButton.textContent = enabled ? '退出放大' : '放大观察'; focusButton.setAttribute('aria-pressed', String(enabled)); });
document.addEventListener('visibilitychange', syncLifecycle);
// Handshake the eagerly loaded vehicle iframe, including the cached-load case.
frameFor('vehicle').addEventListener('load', () => { send('vehicle', 'host.hello'); syncLifecycle(); });
send('vehicle', 'host.hello');
data = await loadAtlasData('./data/');
for (const system of data.systems) { const option = document.createElement('option'); option.value = system.id; option.textContent = system.name; document.getElementById('system-filter').append(option); }
configureVehicleBindings(); renderCatalog(); renderSelection(); status(data.warnings.length ? '部分目录数据暂不可用，其他视图仍可使用。' : '目录已加载；选择模型零件或从目录进入原理。');
