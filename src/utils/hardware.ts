export const HARDWARE_CATALOG = [
  { id: 'odri', title: 'ODRI · 执行器与 Solo', kind: 'robot', category: '开放机器人', description: '从电机、同步带到关节与整机，查看原始装配和设计文件。', detail: '执行器 / 单腿 / Solo 四足' },
  { id: 'so101', title: 'SO-101', kind: 'robot', category: '桌面机械臂', description: '保留整机 STEP 与原始关节模型，分别研究机械结构和运动关系。', detail: '整机 CAD / URDF / MJCF' },
  { id: 'thor', title: 'Thor', kind: 'robot', category: '六轴机械臂', description: '查看原装配中的齿轮、带轮、张紧器与传动机构。', detail: 'FreeCAD / STEP / ROS 2' },
  { id: 'parol6', title: 'PAROL6', kind: 'robot', category: '六轴机械臂', description: '官方模型库、末端工具和硬件原件集中在同一个入口。', detail: 'URDF / MJCF / 硬件与装配' },
  { id: 'olsk-small-cnc', title: 'OLSK Small CNC', kind: 'machine', category: '小型数控机床', description: '进入原版三维装配手册，并查阅整机 CAD、物料表和电气图。', detail: '原版装配应用 / 整机设计' },
  { id: 'olsk-large-cnc', title: 'OLSK Large CNC', kind: 'machine', category: '大型数控机床', description: '保留大型机床的原版装配体验及电气、气路和结构设计资料。', detail: '原版装配应用 / 电气与气路' },
  { id: 'voron-2.4', title: 'Voron 2.4', kind: 'machine', category: '3D 打印机', description: '查看原始 CoreXY 整机装配、零件文件与安装手册。', detail: '整机 STEP / Fusion / STL' },
  { id: 'jubilee', title: 'Jubilee', kind: 'machine', category: '自动换工具平台', description: '研究 CoreXY 结构、自动换工具机构及原始机械设计。', detail: 'SolidWorks / STEP / BOM' },
  { id: 'opcua-conveyor', title: 'OPC UA 输送与供料', kind: 'machine', category: '工业实验设备', description: '查看原输送机结构、设计原件及独立的 OPC UA 控制程序。', detail: 'STEP / Fusion / 控制源码' },
] as const;
export type HardwareId = typeof HARDWARE_CATALOG[number]['id'];
export type HardwareRoute = { workspace: 'hardware'; asset?: HardwareId; view?: 'structure' | 'files' | 'about'; model?: string; file?: string };
export interface HardwareSource {
  id: string; repository: string; revision: string; tree?: string; license: string; root?: string;
  archive?: string; archiveSize?: number; archiveSha256?: string; fileCount?: number;
}
export interface HardwareModel {
  id: string; label: string; format: 'gltf' | 'urdf' | 'html'; path: string; unit?: 'm' | 'mm'; up?: 'Y' | 'Z';
  role: 'assembly' | 'kinematic' | 'original-app'; source: { id: string; path: string }; limitations?: string[];
  packages?: Record<string, string>; initialJoints?: Record<string, number>;
}
export interface HardwareAsset {
  schemaVersion: 1; id: HardwareId; title: string; kind: 'machine' | 'robot'; description: string;
  sources: HardwareSource[]; models: HardwareModel[];
  capabilities: { structure: string; motion: string; live: string }; limitations: string[]; filesIndex: string;
  integrationSource?: { path: string; label: string; license: string }[];
  verificationReports?: { path: string; label: string }[];
}
export interface OriginalFile { sourceId: string; path: string; size: number; sha256?: string; url?: string; archive?: string }
export const isHardwareId = (value: string | null | undefined): value is HardwareId => HARDWARE_CATALOG.some(entry => entry.id === value);

/** Only same-asset paths from the checked manifest are usable as executable or downloadable URLs. */
export function hardwareUrl(id: HardwareId, relative: string, base = '/') {
  if (!relative || /^(?:[a-z]+:|\/|\\)/i.test(relative) || relative.includes('\0') || relative.split(/[\\/]/).some(p => p === '..')) throw new Error('原件路径不在当前设备目录内');
  return `${base.replace(/\/?$/, '/')}hardware/${id}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}
export function validateHardwareAsset(value: unknown, expected: HardwareId): HardwareAsset {
  const asset = value as HardwareAsset;
  if (!asset || asset.schemaVersion !== 1 || asset.id !== expected || !Array.isArray(asset.models) || !asset.models.length || !Array.isArray(asset.sources) || !asset.sources.length) throw new Error('设备清单缺失或版本不正确，请重新构建设备资源');
  hardwareUrl(expected, asset.filesIndex);
  for (const source of asset.integrationSource || []) hardwareUrl(expected, source.path);
  for (const report of asset.verificationReports || []) hardwareUrl(expected, report.path);
  for (const model of asset.models) {
    if (!['gltf', 'urdf', 'html'].includes(model.format) || !model.id || !asset.sources.some(s => s.id === model.source?.id)) throw new Error('展示模型缺少有效的原件来源');
    hardwareUrl(expected, model.path);
    for (const dir of Object.values(model.packages || {})) hardwareUrl(expected, dir);
  }
  for (const source of asset.sources) {
    if (!/^[a-f0-9]{40}$/i.test(source.revision)) throw new Error('原件未固定到完整上游版本');
    if (source.archive) hardwareUrl(expected, source.archive);
  }
  return asset;
}
export function fileCategory(path: string): string {
  const name = path.toLowerCase();
  if (/(?:license|copying|notice|dep5)/.test(name)) return '许可';
  if (/\.(?:step|stp|sldprt|sldasm|fcstd|f3d|f3z|iam|ipt|dxf|dwg|iges|igs)(?:\.zip|\.\d+)?$/i.test(name)) return 'CAD';
  if (/\.(?:urdf|xacro|xml|mjcf)$/i.test(name)) return '关节与仿真';
  if (/\.(?:stl|3mf|obj|dae|glb|gltf|ply)$/i.test(name)) return '网格';
  if (/(?:bom|bill.of.materials|wiring|schematic|pneumatic|assembly|manual|instruction)/i.test(name) || /\.(?:pdf|xlsx?|csv)$/i.test(name)) return '图纸与物料';
  if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(name)) return '图片';
  if (/\.(?:md|txt|rst)$/i.test(name)) return '文档';
  return '源码与其他';
}
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
export function disposeHardwareFrame(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  try {
    const doc = frame.contentDocument;
    doc?.querySelectorAll('audio,video').forEach(element => (element as HTMLMediaElement).pause());
    if (doc?.pointerLockElement) doc.exitPointerLock();
    if (doc?.fullscreenElement) void doc.exitFullscreen();
    frame.contentWindow?.postMessage({ type: 'hardware:dispose' }, window.location.origin);
    frame.contentWindow?.dispatchEvent(new Event('hardware:dispose'));
  } catch { /* An unloaded document has no live resources to control. */ }
  frame.src = 'about:blank';
}
