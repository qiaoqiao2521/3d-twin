import { isOpenDemoId, type OpenDemoRoute } from './openDemos.ts';

export type EngineeringMode = 'cad_hub' | 'sandbox' | 'mars_combat';
export type WorkspaceRoute = { workspace: 'iron' } | { workspace: 'warehouse' } | { workspace: 'automotive' } | { workspace: 'engineering'; mode: EngineeringMode } | OpenDemoRoute;

/** Existing shared links stay valid; an unqualified visit opens engineering. */
export function resolveWorkspaceLocation(search: string): WorkspaceRoute {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  if (params.get('workspace') === 'open-demos' || mode === 'open-demos') {
    const demo = params.get('demo');
    return isOpenDemoId(demo)
      ? { workspace: 'open-demos', demo, source: demo !== 'warehouse-journey' && params.get('source') === 'live' ? 'live' : 'local' }
      : { workspace: 'open-demos' };
  }
  if (mode === 'warehouse' || params.get('workspace') === 'warehouse') return { workspace: 'warehouse' };
  if (mode === 'automotive' || params.get('workspace') === 'automotive') return { workspace: 'automotive' };
  if (mode === 'iron' || params.get('workspace') === 'iron') return { workspace: 'iron' };
  if (params.get('sandbox') === '1' || mode === 'sandbox') return { workspace: 'engineering', mode: 'sandbox' };
  if (mode === 'mars_combat') return { workspace: 'engineering', mode: 'mars_combat' };
  return { workspace: 'engineering', mode: 'cad_hub' };
}

export function workspaceSearch(route: WorkspaceRoute, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch);
  params.delete('workspace');
  params.delete('sandbox');
  params.delete('autostart');
  params.delete('demo');
  params.delete('source');
  if (route.workspace === 'open-demos') {
    params.delete('mode');
    params.set('workspace', 'open-demos');
    if (route.demo) {
      params.set('demo', route.demo);
      params.set('source', route.demo === 'warehouse-journey' ? 'local' : route.source || 'local');
    }
    return `?${params.toString()}`;
  }
  params.set('mode', route.workspace !== 'engineering' ? route.workspace : route.mode === 'cad_hub' ? 'hangar' : route.mode);
  return `?${params.toString()}`;
}
