import { ROBOT_PACKS, type ManifestRepo } from './manifestUtils.ts';

export const ROBOTICS_TABS = ['hangar_3d', 'mars2020', 'b737_cfm56', 'b737_bridge', 'urdf_explorer'] as const;
export type RoboticsTab = typeof ROBOTICS_TABS[number];
export interface RoboticsLocation { tab: RoboticsTab; robot: string; repository: string; file: string }

export function normalizeRoboticsLocation(value: Partial<RoboticsLocation>, repos: ManifestRepo[]): RoboticsLocation {
  const repo = repos.find(repo => repo.repository === value.repository) || repos[0];
  const file = value.file || '';
  return {
    tab: ROBOTICS_TABS.includes(value.tab as RoboticsTab) ? value.tab as RoboticsTab : 'hangar_3d',
    robot: ROBOT_PACKS.some(pack => pack.id === value.robot) ? value.robot! : ROBOT_PACKS[0].id,
    repository: repo?.repository || '',
    file: repo && [...repo.kinematicFiles, ...repo.docFiles].includes(file) ? file : repo?.primaryBaselineFile || '',
  };
}

export function readRoboticsLocation(search: string, repos: ManifestRepo[]): RoboticsLocation {
  const params = new URLSearchParams(search);
  return normalizeRoboticsLocation({ tab: params.get('engineeringTab') as RoboticsTab,
    robot: params.get('robot') || '', repository: params.get('baselineRepo') || '', file: params.get('baselineFile') || '' }, repos);
}

/** Only this workbench's query parameters are changed; the parent owns workspace routing. */
export function roboticsLocationSearch(route: RoboticsLocation, search = ''): string {
  const params = new URLSearchParams(search);
  params.set('engineeringTab', route.tab); params.set('robot', route.robot);
  params.set('baselineRepo', route.repository); params.set('baselineFile', route.file);
  return `?${params.toString()}`;
}

/** '+' is a literal path character (unlike a form-query '+'); Vite 5 preserves encoded reserved characters. */
export function roboticsAssetUrl(relative: string): string {
  return '/' + relative.split('/').map(segment => encodeURIComponent(segment).replace(/%2B/gi, '+')).join('/');
}
