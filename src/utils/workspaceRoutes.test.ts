import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceLocation, workspaceSearch } from './workspaceRoutes.ts';

test('engineering is the default and existing hangar and sandbox links still resolve', () => {
  assert.deepEqual(resolveWorkspaceLocation(''), { workspace: 'engineering', mode: 'cad_hub' });
  assert.deepEqual(resolveWorkspaceLocation('?mode=hangar'), { workspace: 'engineering', mode: 'cad_hub' });
  assert.deepEqual(resolveWorkspaceLocation('?sandbox=1&actor=sar'), { workspace: 'engineering', mode: 'sandbox' });
  assert.deepEqual(resolveWorkspaceLocation('?mode=mars_combat'), { workspace: 'engineering', mode: 'mars_combat' });
  assert.deepEqual(resolveWorkspaceLocation('?mode=typo'), { workspace: 'engineering', mode: 'cad_hub' });
});

test('iron is explicit and switching workspaces cannot retain a stale sandbox or autoplay flag', () => {
  assert.deepEqual(resolveWorkspaceLocation('?workspace=iron'), { workspace: 'iron' });
  assert.deepEqual(resolveWorkspaceLocation('?mode=iron&sandbox=1'), { workspace: 'iron' });
  const next = workspaceSearch({ workspace: 'engineering', mode: 'cad_hub' }, '?workspace=iron&sandbox=1&autostart=1&actor=sar');
  assert.deepEqual(resolveWorkspaceLocation(next), { workspace: 'engineering', mode: 'cad_hub' });
  assert.equal(new URLSearchParams(next).get('actor'), 'sar');
  assert.equal(new URLSearchParams(next).has('autostart'), false);
});

test('warehouse opens directly and remains distinct from iron and engineering on return', () => {
  assert.deepEqual(resolveWorkspaceLocation('?mode=warehouse'), { workspace: 'warehouse' });
  assert.deepEqual(resolveWorkspaceLocation('?workspace=warehouse'), { workspace: 'warehouse' });
  const warehouse = workspaceSearch({ workspace: 'warehouse' }, '?workspace=iron&sandbox=1&autostart=1');
  assert.deepEqual(resolveWorkspaceLocation(warehouse), { workspace: 'warehouse' });
  assert.equal(new URLSearchParams(warehouse).has('sandbox'), false);
  assert.equal(new URLSearchParams(warehouse).has('autostart'), false);
  const iron = workspaceSearch({ workspace: 'iron' }, warehouse);
  assert.deepEqual(resolveWorkspaceLocation(iron), { workspace: 'iron' });
  const engineering = workspaceSearch({ workspace: 'engineering', mode: 'cad_hub' }, warehouse);
  assert.deepEqual(resolveWorkspaceLocation(engineering), { workspace: 'engineering', mode: 'cad_hub' });
});

test('automotive workspace supports direct links and navigation without stale sandbox flags', () => {
  assert.deepEqual(resolveWorkspaceLocation('?mode=automotive'), { workspace: 'automotive' });
  assert.deepEqual(resolveWorkspaceLocation('?workspace=automotive'), { workspace: 'automotive' });
  const next = workspaceSearch({ workspace: 'automotive' }, '?sandbox=1&autostart=1');
  assert.deepEqual(resolveWorkspaceLocation(next), { workspace: 'automotive' });
  assert.equal(new URLSearchParams(next).has('sandbox'), false);
  assert.equal(new URLSearchParams(next).has('autostart'), false);
});

test('every original warehouse demo has refreshable local and live links and returns through the directory', () => {
  for (const demo of ['warehouse-journey', 'waretwin', 'rftwin'] as const) {
    for (const source of ['local', 'live'] as const) {
      const route = { workspace: 'open-demos', demo, source } as const;
      const url = workspaceSearch(route, '?mode=warehouse&autostart=1&actor=sar');
      assert.deepEqual(resolveWorkspaceLocation(url), { ...route, source: demo === 'warehouse-journey' ? 'local' : source });
      assert.equal(new URLSearchParams(url).get('actor'), 'sar');
      const directory = workspaceSearch({ workspace: 'open-demos' }, url);
      assert.deepEqual(resolveWorkspaceLocation(directory), { workspace: 'open-demos' });
      assert.equal(new URLSearchParams(directory).has('demo'), false);
      assert.equal(new URLSearchParams(directory).has('source'), false);
      for (const workspace of ['warehouse', 'automotive'] as const) {
        const original = workspaceSearch({ workspace }, url);
        assert.deepEqual(resolveWorkspaceLocation(original), { workspace });
        assert.equal(new URLSearchParams(original).has('demo'), false);
        assert.equal(new URLSearchParams(original).has('source'), false);
        assert.deepEqual(resolveWorkspaceLocation(workspaceSearch(route, original)), {
          ...route, source: demo === 'warehouse-journey' ? 'local' : source,
        });
      }
    }
  }
});

test('demo URLs cannot supply arbitrary iframe destinations or unknown runtime modes', () => {
  assert.deepEqual(resolveWorkspaceLocation('?workspace=open-demos&demo=https://example.com'), { workspace: 'open-demos' });
  assert.deepEqual(resolveWorkspaceLocation('?workspace=open-demos&demo=../../other'), { workspace: 'open-demos' });
  assert.deepEqual(resolveWorkspaceLocation('?workspace=open-demos&demo=rftwin&source=anything'), { workspace: 'open-demos', demo: 'rftwin', source: 'local' });
});
