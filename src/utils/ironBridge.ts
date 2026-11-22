import { validateInspectionSnapshot, type SceneInspectionSnapshot } from '../shared/inspection/sceneInspection.ts';

export const IRON_CHANNEL = 'iron.embed';
export const IRON_PROTOCOL_VERSION = 1;
export const IRON_COMMANDS = [
  'hello', 'select-character', 'scrub', 'set-camera', 'inspect', 'select-part',
  'isolate-part', 'reset-inspection', 'pause', 'resume'
] as const;
export type IronCommand = typeof IRON_COMMANDS[number];
export type IronResponseType = 'ready' | 'state' | 'result' | 'error';

export interface IronEnvelope {
  channel: typeof IRON_CHANNEL;
  version: number;
  id: string;
  type: IronResponseType;
  payload: Record<string, unknown>;
}

export interface IronState {
  revision: string | null;
  characters: { id: string; name: string }[];
  selectedCharacterId: string;
  transformProgress: number;
  capabilities: string[];
  provenance: { kind: 'virtual'; geometry: 'procedural'; physicalTwin: false };
  paused: boolean;
  selectedPartId: string | null;
  isolatedPartId: string | null;
  cameraPreset?: string;
  inspection: SceneInspectionSnapshot;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const shortString = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;

export function resolveIronEndpoint(input: string, parentOrigin: string): { url: string; origin: string } {
  const url = new URL(input.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('请使用不含账户凭据的 http 或 https 地址。');
  }
  if (new URL(parentOrigin).origin !== parentOrigin) throw new Error('宿主来源无效。');
  url.hash = '';
  url.searchParams.set('embed', '1');
  url.searchParams.set('parentOrigin', parentOrigin);
  return { url: url.href, origin: url.origin };
}

export function isTrustedIronEvent(
  event: { origin: string; source: unknown },
  expectedOrigin: string,
  expectedSource: unknown
): boolean {
  return expectedSource !== null && expectedSource !== undefined &&
    event.origin === expectedOrigin && event.source === expectedSource;
}

export function parseIronEnvelope(input: unknown): IronEnvelope | null {
  if (!record(input) || input.channel !== IRON_CHANNEL || !Number.isInteger(input.version) ||
    !shortString(input.id) || !['ready', 'state', 'result', 'error'].includes(String(input.type)) || !record(input.payload)) return null;
  return input as unknown as IronEnvelope;
}

/** The host accepts only explicitly virtual, versioned inspection data. */
export function parseIronState(input: unknown): { state: IronState | null; error: string | null } {
  const invalid = (error: string) => ({ state: null, error });
  if (!record(input)) return invalid('角色状态不是对象。');
  if (input.revision !== null && (typeof input.revision !== 'string' || !/^[a-f0-9]{40}$/i.test(input.revision))) {
    return invalid('来源修订格式无效。');
  }
  if (!Array.isArray(input.characters) || input.characters.length === 0 || input.characters.length > 1000 ||
    !input.characters.every((item) => record(item) && shortString(item.id) && shortString(item.name))) {
    return invalid('角色目录格式无效。');
  }
  const characters = input.characters as { id: string; name: string }[];
  if (new Set(characters.map((item) => item.id)).size !== characters.length ||
    !characters.some((item) => item.id === input.selectedCharacterId)) return invalid('角色 ID 缺失或重复。');
  if (typeof input.transformProgress !== 'number' || !Number.isFinite(input.transformProgress) ||
    input.transformProgress < 0 || input.transformProgress > 1) return invalid('变形进度超出范围。');
  if (!Array.isArray(input.capabilities) || input.capabilities.length > 50 || !input.capabilities.every(shortString) ||
    typeof input.paused !== 'boolean') return invalid('能力或播放状态无效。');
  const provenance = input.provenance;
  if (!record(provenance) || provenance.kind !== 'virtual' || provenance.geometry !== 'procedural' || provenance.physicalTwin !== false) {
    return invalid('iron 必须声明为程序生成的虚拟角色。');
  }
  const report = validateInspectionSnapshot(input.inspection);
  if (!report.valid) return invalid(`结构数据无效：${report.issues.find((issue) => issue.severity === 'error')?.message || '检查失败'}`);
  const inspection = input.inspection as SceneInspectionSnapshot;
  if (inspection.objectId !== `iron:${input.selectedCharacterId}`) return invalid('结构对象与当前角色不一致。');
  if (inspection.source.reality !== 'virtual' || inspection.source.geometry !== 'procedural' ||
    inspection.source.physicalEvidence !== 'none' || inspection.source.revision !== input.revision) {
    return invalid('结构来源与虚拟角色身份不一致。');
  }
  for (const field of ['selectedPartId', 'isolatedPartId'] as const) {
    if (input[field] !== null && (!shortString(input[field]) || !inspection.nodes.some((node) => node.id === input[field] && node.kind === 'part'))) {
      return invalid('选中或隔离部件引用无效。');
    }
  }
  return { state: input as unknown as IronState, error: null };
}

export function ironRevisionMatches(expected: string | null, actual: string | null, development = false): boolean {
  return expected !== null ? expected === actual : development;
}
