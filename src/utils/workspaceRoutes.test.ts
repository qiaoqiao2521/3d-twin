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
