/** Human-editable atlas data. Invalid optional entries never disable the viewer. */
const list = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const text = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => [...new Set(values)];
const labelOf = value => typeof value === 'string' ? value : value?.zh || value?.en || '';
const finiteVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function normalizeAtlasData(input = {}, { warn = message => console.warn(message) } = {}) {
  const warnings = [];
  const warning = message => { const line = `WARNING: ${message}`; warnings.push(line); warn(line); };
  const collect = (rows, validate, label) => {
    const ids = new Set();
    return rows.flatMap((row, index) => {
      if (!row || !text(row.id) || ids.has(row.id)) { warning(`${label}[${index}] has a missing or duplicate id; skipped.`); return []; }
      const result = validate(row);
      if (!result) { warning(`${label} ${row.id} is invalid; skipped.`); return []; }
      ids.add(row.id);
      return [result];
    });
  };
  const systems = collect(list(input.catalog, 'systems'), row => labelOf(row.name) ? { ...row } : null, 'system');
  const systemIds = new Set(systems.map(row => row.id));
  const parts = collect(list(input.catalog, 'parts'), row => {
    if (!labelOf(row.name) || !Array.isArray(row.systems)) return null;
    const tags = unique(row.systems.filter(id => systemIds.has(id)));
    if (tags.length !== row.systems.length) warning(`part ${row.id} has unknown or repeated system tags; those tags were removed.`);
    return { ...row, structuralParent: text(row.structuralParent) ? row.structuralParent : null, systems: tags };
  }, 'part');
  const partById = new Map(parts.map(row => [row.id, row]));
  for (const part of parts) {
    if (part.structuralParent && !partById.has(part.structuralParent)) {
      warning(`part ${part.id} has an unknown structural parent; treated as a root.`);
      part.structuralParent = null;
    }
    const seen = new Set([part.id]);
    let cursor = partById.get(part.structuralParent);
    while (cursor) {
      if (seen.has(cursor.id)) { warning(`part ${part.id} has a structural cycle; parent removed.`); part.structuralParent = null; break; }
      seen.add(cursor.id);
      cursor = partById.get(cursor.structuralParent);
    }
  }
  const models = collect(list(input.models, 'models'), row => {
    if (!labelOf(row.name)) return null;
    for (const field of ['codeLicense', 'assetLicense', 'brandPresence', 'status']) {
      if (!row[field]) warning(`model ${row.id} ${field} is unknown.`);
    }
    return { ...row, codeLicense: row.codeLicense || { label: '未提供', status: 'unknown' }, assetLicense: row.assetLicense || { label: '未提供', status: 'unknown' }, brandPresence: row.brandPresence || 'unknown', status: row.status || 'requires_review' };
  }, 'model');
  const modelIds = new Set(models.map(row => row.id));
  const bindings = collect(list(input.bindings, 'bindings'), row => {
    if (!modelIds.has(row.modelId) || !Array.isArray(row.partIds) || !row.partIds.length || !['exact', 'merged_unseparable'].includes(row.granularity)) return null;
    const partIds = unique(row.partIds.filter(id => partById.has(id)));
    // Dropping one member of an N:1 binding could falsely imply separability.
    if (partIds.length !== row.partIds.length) return null;
    const selectors = list(row.selectors).filter(selector => selector?.type === 'path' && text(selector.value) && ['exact', 'subtree'].includes(selector.match || 'exact')).map(selector => ({ ...selector, match: selector.match || 'exact' }));
    if (!selectors.length) return null;
    if (selectors.length !== row.selectors.length) warning(`binding ${row.id} has invalid selectors; those selectors were skipped.`);
    let explode = row.explode || { mode: 'inherit' };
    if (row.granularity === 'merged_unseparable') explode = { mode: 'disabled' };
    else if (explode.mode === 'vector') {
      const norm = finiteVector(explode.direction) ? Math.hypot(...explode.direction) : 0;
      if (!norm || !Number.isFinite(explode.distance) || explode.distance < 0 || explode.coordinateSpace !== 'model' || explode.distanceUnit !== 'relative_model_max_extent') {
        warning(`binding ${row.id} has an invalid model-space explosion vector; existing viewer behavior retained.`);
        explode = { mode: 'inherit' };
      } else explode = { ...explode, direction: explode.direction.map(value => value / norm) };
    } else if (!['inherit', 'disabled'].includes(explode.mode)) { warning(`binding ${row.id} has an unknown explosion mode; existing viewer behavior retained.`); explode = { mode: 'inherit' }; }
    return { ...row, selectors, partIds, explode };
  }, 'binding');
  const relations = collect(list(input.relations, 'relations'), row => {
    if (!['matched', 'principle', 'external'].includes(row.kind) || !partById.has(row.fromPartId) || !modelIds.has(row.targetModelId) || (row.fromModelId && !modelIds.has(row.fromModelId))) return null;
    return { ...row };
  }, 'relation');
  return { systems, parts, models, bindings, relations, warnings };
}

export function selectorMatches(selector, sourcePath) {
  if (!text(sourcePath) || selector?.type !== 'path' || !text(selector.value)) return false;
  return sourcePath === selector.value || (selector.match === 'subtree' && sourcePath.startsWith(selector.value + '/'));
}

export function relationsForPart(partId, data, modelId) {
  return (data?.relations || []).filter(row => row.fromPartId === partId && (!row.fromModelId || row.fromModelId === modelId)).map(row => ({ ...row, target: data.models.find(model => model.id === row.targetModelId) }));
}

/** Runtime mesh UUIDs are deliberately ignored: only explicit stable paths bind. */
export function resolveSelection({ modelId, selection, data }) {
  const rawSelection = selection || null;
  const bindings = (data?.bindings || []).filter(row => row.modelId === modelId && row.selectors.some(selector => selectorMatches(selector, selection?.sourcePath)));
  const partIds = unique(bindings.flatMap(row => row.partIds));
  const parts = (data?.parts || []).filter(row => partIds.includes(row.id));
  const relations = unique(partIds.flatMap(id => relationsForPart(id, data, modelId).map(row => row.id))).map(id => {
    const relation = data.relations.find(row => row.id === id);
    return { ...relation, target: data.models.find(model => model.id === relation.targetModelId) };
  });
  return {
    matched: bindings.length > 0,
    rawSelection,
    bindings,
    parts,
    partIds,
    relations,
    granularity: bindings.some(row => row.granularity === 'merged_unseparable') ? 'merged_unseparable' : bindings.length ? 'exact' : 'unmapped',
    label: parts.map(row => labelOf(row.name)).join('、') || labelOf(selection?.name) || selection?.sourcePath || '未选择部件',
  };
}

export async function loadAtlasData(base = './data/', { fetch: fetcher = globalThis.fetch, warn = message => console.warn(message) } = {}) {
  const names = ['catalog', 'models', 'bindings', 'relations'];
  const input = {};
  const loadWarnings = [];
  await Promise.all(names.map(async name => {
    try {
      const response = await fetcher(`${base}${name}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      input[name] = await response.json();
    } catch (error) {
      const message = `WARNING: ${name}.json could not load: ${error.message}; other data remains available.`;
      loadWarnings.push(message); warn(message);
    }
  }));
  const data = normalizeAtlasData(input, { warn });
  data.warnings.unshift(...loadWarnings);
  return data;
}
