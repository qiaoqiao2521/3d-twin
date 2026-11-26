import test from 'node:test';
import assert from 'node:assert/strict';
import { HARDWARE_CATALOG, hardwareUrl, validateHardwareAsset, fileCategory, disposeHardwareFrame } from './hardware.ts';
import { resolveWorkspaceLocation, workspaceSearch } from './workspaceRoutes.ts';

test('all catalog assets have refreshable structure, original-file and provenance routes', () => {
  assert.deepEqual(HARDWARE_CATALOG.map(entry => entry.id), ['odri', 'so101', 'thor', 'parol6', 'olsk-small-cnc', 'olsk-large-cnc', 'voron-2.4', 'jubilee', 'opcua-conveyor', 'motoman-weld']);
  for (const entry of HARDWARE_CATALOG) for (const view of ['structure', 'files', 'about'] as const) {
    const route = { workspace: 'hardware', asset: entry.id, view, model: 'original', file: 'source:CAD/整机.step' } as const;
    const url = workspaceSearch(route, '?mode=sandbox&autostart=1&robot=unitree_g1');
    assert.deepEqual(resolveWorkspaceLocation(url), route);
    assert.equal(new URLSearchParams(url).has('autostart'), false);
    assert.equal(new URLSearchParams(url).get('robot'), 'unitree_g1');
    const directory = workspaceSearch({ workspace: 'hardware' }, url);
    assert.deepEqual(resolveWorkspaceLocation(directory), { workspace: 'hardware' });
    assert.equal(new URLSearchParams(directory).has('file'), false);
    for (const workspace of ['warehouse', 'automotive', 'iron'] as const) {
      const back = workspaceSearch({ workspace }, url);
      assert.deepEqual(resolveWorkspaceLocation(back), { workspace });
      for (const key of ['asset', 'view', 'model', 'file']) assert.equal(new URLSearchParams(back).has(key), false);
    }
  }
});

test('external URLs, traversal and unknown assets cannot become hardware iframe destinations', () => {
  for (const relative of ['https://example.com/app', '//example.com/a', '../a', 'originals/../../a', '\\evil', 'file:/tmp/a']) assert.throws(() => hardwareUrl('thor', relative));
  assert.equal(hardwareUrl('so101', 'originals/SO101/整机 1.step', '/app/'), '/app/hardware/so101/originals/SO101/%E6%95%B4%E6%9C%BA%201.step');
  assert.deepEqual(resolveWorkspaceLocation('?workspace=hardware&asset=../../escape&view=files'), { workspace: 'hardware' });
  assert.deepEqual(resolveWorkspaceLocation('?workspace=hardware&asset=thor&view=external'), { workspace: 'hardware', asset: 'thor', view: 'structure' });
});

test('a display without a pinned source or with a broken origin is rejected', () => {
  const asset = { schemaVersion: 1, id: 'thor', filesIndex: 'originals.json', sources: [{ id: 'thor', revision: 'a'.repeat(40) }], models: [{ id: 'whole', format: 'gltf', path: 'models/whole.glb', source: { id: 'thor', path: 'whole.step' } }] };
  assert.equal(validateHardwareAsset(asset, 'thor'), asset);
  assert.throws(() => validateHardwareAsset({ ...asset, id: 'so101' }, 'thor'));
  assert.throws(() => validateHardwareAsset({ ...asset, sources: [{ id: 'thor', revision: 'main' }] }, 'thor'));
  assert.throws(() => validateHardwareAsset({ ...asset, models: [{ ...asset.models[0], source: { id: 'other' } }] }, 'thor'));
  assert.throws(() => validateHardwareAsset({ ...asset, models: [{ ...asset.models[0], path: '../index.html' }] }, 'thor'));
});

test('native CAD, split CAD archives, joint originals and design licenses remain discoverable', () => {
  assert.equal(fileCategory('CAD/large.f3d.001'), 'CAD');
  assert.equal(fileCategory('CAD/assembly_STEP.step.zip'), 'CAD');
  assert.equal(fileCategory('freecad-src/Assembly.FCStd'), 'CAD');
  assert.equal(fileCategory('models/robot.urdf.xacro'), '关节与仿真');
  assert.equal(fileCategory('.reuse/dep5'), '许可');
  assert.equal(fileCategory('OLSK_Large_CNC_PneumaticsSchematic_V3.pdf'), '图纸与物料');
});

test('leaving a preserved application pauses media, releases locks and discards its document', () => {
  const calls: string[] = [];
  const oldWindow = globalThis.window;
  (globalThis as unknown as { window: unknown }).window = { location: { origin: 'https://local.invalid' } };
  const frame = { src: 'original.html', contentDocument: { querySelectorAll: () => [{ pause: () => calls.push('pause') }], pointerLockElement: {}, exitPointerLock: () => calls.push('unlock'), fullscreenElement: {}, exitFullscreen: () => calls.push('fullscreen') }, contentWindow: { postMessage: () => calls.push('message'), dispatchEvent: () => calls.push('dispose') } };
  try { disposeHardwareFrame(frame as unknown as HTMLIFrameElement); assert.equal(frame.src, 'about:blank'); assert.deepEqual(calls, ['pause', 'unlock', 'fullscreen', 'message', 'dispose']); }
  finally { (globalThis as unknown as { window: unknown }).window = oldWindow; }
});
