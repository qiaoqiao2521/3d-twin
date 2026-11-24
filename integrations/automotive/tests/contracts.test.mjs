import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAtlasData, resolveSelection, relationsForPart, selectorMatches, loadAtlasData } from '../../../public/twins/automotive/contracts.js';

async function fixture() {
  const entries = await Promise.all(['catalog', 'models', 'bindings', 'relations'].map(async name => [name, JSON.parse(await readFile(new URL(`../../../public/twins/automotive/data/${name}.json`, import.meta.url), 'utf8'))]));
  return Object.fromEntries(entries);
}
const quiet = { warn() {} };

test('shipped source data is usable without warnings', async () => {
  const data = normalizeAtlasData(await fixture(), quiet);
  assert.deepEqual(data.warnings, []);
  assert.equal(data.parts.length, 23);
  assert.ok(data.bindings.some(row => row.selectors.length > 1));
  assert.ok(data.parts.find(row => row.id === 'engine.spark_plug').systems.includes('electrical.ignition'));
  assert.equal(data.parts.find(row => row.id === 'engine.spark_plug').structuralParent, 'engine.assembly');
});

test('real material-split body meshes resolve to the same knowledge part', async () => {
  const data = normalizeAtlasData(await fixture(), quiet);
  for (const sourcePath of ['BMW_E30_M3_BODY_0/Object_4', 'BMW_E30_M3_BODY_0/Object_5']) {
    const result = resolveSelection({ modelId: 'bmw-m3-e30', selection: { id: 'random-runtime-uuid', sourcePath }, data });
    assert.equal(result.matched, true);
    assert.deepEqual(result.partIds, ['body.assembly']);
    assert.equal(result.label, '车身总成');
  }
});

test('unmapped raw part named engine is never treated as a verified engine binding', async () => {
  const data = normalizeAtlasData(await fixture(), quiet);
  const selection = { sourcePath: 'unknown/path', name: { zh: 'engine 假想网格' } };
  const result = resolveSelection({ modelId: 'bmw-m3-e30', selection, data });
  assert.equal(result.matched, false);
  assert.equal(result.label, 'engine 假想网格');
  assert.deepEqual(result.relations, []);
  assert.equal(result.rawSelection, selection);
  assert.equal(data.bindings.some(row => row.partIds.includes('engine.assembly')), false);
  assert.equal(relationsForPart('engine.assembly', data)[0].kind, 'principle');
});

test('bad items warn independently while structural cycles recover as roots', async () => {
  const input = await fixture();
  input.catalog.parts.push({ id: 'bad' }, { id: 'vehicle.assembly', name: 'Duplicate', systems: [] });
  input.catalog.parts.find(row => row.id === 'vehicle.assembly').structuralParent = 'body.assembly';
  input.catalog.parts.find(row => row.id === 'engine.piston').systems.push('unknown.system');
  input.bindings.bindings.push({ id: 'bad-binding', modelId: 'not-a-model', partIds: ['body.assembly'], selectors: [], granularity: 'exact' });
  const data = normalizeAtlasData(input, quiet);
  assert.ok(data.warnings.length >= 4);
  assert.equal(data.parts.find(row => row.id === 'vehicle.assembly').structuralParent, null);
  assert.equal(data.parts.filter(row => row.id === 'vehicle.assembly').length, 1);
  assert.equal(data.parts.some(row => row.id === 'bad'), false);
  assert.equal(data.bindings.some(row => row.id === 'bad-binding'), false);
  assert.ok(data.bindings.length > 0);
});

test('N:1 geometry binds all declared parts and cannot claim independent explosion', async () => {
  const input = await fixture();
  input.bindings.bindings.push({ id: 'merged-test', modelId: 'bmw-m3-e30', partIds: ['wheel.rim', 'brake.disc'], selectors: [{ type: 'path', value: 'merged/mesh', match: 'exact' }], granularity: 'merged_unseparable', explode: { mode: 'vector', coordinateSpace: 'model', direction: [1, 0, 0], distance: 0.3, distanceUnit: 'relative_model_max_extent' } });
  const data = normalizeAtlasData(input, quiet);
  const result = resolveSelection({ modelId: 'bmw-m3-e30', selection: { sourcePath: 'merged/mesh' }, data });
  assert.deepEqual(result.partIds, ['wheel.rim', 'brake.disc']);
  assert.equal(result.granularity, 'merged_unseparable');
  assert.equal(result.bindings[0].explode.mode, 'disabled');
});

test('explosion vector stays model-relative, normalizes direction and degrades invalid optional values', async () => {
  const input = await fixture();
  const binding = input.bindings.bindings.find(row => row.partIds.includes('wheel.tire'));
  binding.explode = { mode: 'vector', coordinateSpace: 'model', direction: [0, 4, 0], distance: 0.2, distanceUnit: 'relative_model_max_extent' };
  let data = normalizeAtlasData(input, quiet);
  assert.deepEqual(data.bindings.find(row => row.id === binding.id).explode.direction, [0, 1, 0]);
  binding.explode.direction = [0, 0, 0];
  data = normalizeAtlasData(input, quiet);
  assert.equal(data.bindings.find(row => row.id === binding.id).explode.mode, 'inherit');
  assert.ok(data.warnings.some(line => line.includes('explosion vector')));
});

test('subtree selectors match segments instead of accidental prefix names', () => {
  const selector = { type: 'path', value: 'Door_FL', match: 'subtree' };
  assert.equal(selectorMatches(selector, 'Door_FL'), true);
  assert.equal(selectorMatches(selector, 'Door_FL/Glass'), true);
  assert.equal(selectorMatches(selector, 'Door_FL_2/Glass'), false);
});

test('all three relation kinds route only explicit catalog bindings', async () => {
  const input = await fixture();
  input.bindings.bindings.push({ id: 'synthetic-explicit-engine', modelId: 'bmw-m3-e30', partIds: ['engine.assembly'], selectors: [{ type: 'path', value: 'fixture-only-engine' }], granularity: 'exact' });
  for (const kind of ['matched', 'external']) input.relations.relations.push({ id: 'fixture-' + kind, fromPartId: 'engine.assembly', targetModelId: 'v8-engine-explorer', kind });
  const data = normalizeAtlasData(input, quiet);
  const result = resolveSelection({ modelId: 'bmw-m3-e30', selection: { sourcePath: 'fixture-only-engine' }, data });
  assert.deepEqual(new Set(result.relations.map(row => row.kind)), new Set(['matched', 'principle', 'external']));
});

test('missing JSON file preserves other sources and warns', async () => {
  const input = await fixture();
  const warnings = [];
  const data = await loadAtlasData('/data/', { warn: value => warnings.push(value), fetch: async url => {
    const name = url.split('/').pop().replace('.json', '');
    if (name === 'bindings') return { ok: false, status: 503 };
    return { ok: true, json: async () => input[name] };
  } });
  assert.ok(data.parts.length > 0);
  assert.deepEqual(data.bindings, []);
  assert.ok(warnings.some(line => line.includes('bindings.json')));
  assert.ok(data.warnings.some(line => line.includes('bindings.json')), 'UI can report partial loading instead of complete success');
});
