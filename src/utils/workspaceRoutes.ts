export type EngineeringMode = 'cad_hub' | 'sandbox' | 'mars_combat';
export type WorkspaceRoute = { workspace: 'iron' } | { workspace: 'engineering'; mode: EngineeringMode };

/** Existing shared links stay valid; an unqualified visit opens engineering. */
export function resolveWorkspaceLocation(search: string): WorkspaceRoute {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
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
  params.set('mode', route.workspace === 'iron' ? 'iron' : route.mode === 'cad_hub' ? 'hangar' : route.mode);
  return `?${params.toString()}`;
}
