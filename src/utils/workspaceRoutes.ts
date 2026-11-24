import { isOpenDemoId, type OpenDemoRoute } from './openDemos.ts';
import { isHardwareId, type HardwareRoute } from './hardware.ts';

export type EngineeringMode = 'cad_hub' | 'sandbox' | 'mars_combat';
export type WorkspaceRoute = { workspace: 'iron' } | { workspace: 'warehouse' } | { workspace: 'automotive' } | { workspace: 'engineering'; mode: EngineeringMode } | OpenDemoRoute | HardwareRoute;

/** Existing shared links stay valid; an unqualified visit opens engineering. */
export function resolveWorkspaceLocation(search: string): WorkspaceRoute {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  if (params.get('workspace') === 'hardware' || mode === 'hardware') {
    const asset = params.get('asset');
    if (!isHardwareId(asset)) return { workspace: 'hardware' };
    const view = params.get('view');
    return { workspace: 'hardware', asset, view: view === 'files' || view === 'about' ? view : 'structure',
      ...(params.get('model') ? { model: params.get('model')!.slice(0, 100) } : {}),
      ...(params.get('file') ? { file: params.get('file')!.slice(0, 2000) } : {}) };
  }
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
  for (const key of ['asset', 'view', 'model', 'file']) params.delete(key);
  if (route.workspace === 'hardware') {
    params.delete('mode');
    params.set('workspace', 'hardware');
    if (route.asset) {
      params.set('asset', route.asset);
      params.set('view', route.view || 'structure');
      if (route.model) params.set('model', route.model);
      if (route.file) params.set('file', route.file);
    }
    return `?${params.toString()}`;
  }
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
