export const OPEN_DEMO_IDS = ['warehouse-journey', 'waretwin', 'rftwin'] as const;
export type OpenDemoId = typeof OPEN_DEMO_IDS[number];
export type OpenDemoSource = 'local' | 'live';
export type OpenDemoRoute = { workspace: 'open-demos'; demo?: OpenDemoId; source?: OpenDemoSource };

export function isOpenDemoId(value: unknown): value is OpenDemoId {
  return typeof value === 'string' && OPEN_DEMO_IDS.includes(value as OpenDemoId);
}

export const OPEN_DEMOS = [
  { id: 'warehouse-journey', name: 'Warehouse Journey 3D', eyebrow: '包裹的一次旅程',
    description: '从收货、存储、质检到打包出库，保留原作完整园区、仓内作业和跟随镜头。',
    capability: '预设流程 · 模拟业务数据', localLabel: '进入原版流程', desktop: false,
    original: 'https://warehouse.demo.hiobuy.com', repository: 'https://github.com/hiobuy/warehouse-journey-3d' },
  { id: 'waretwin', name: 'WareTwin', eyebrow: '仓储运营控制台',
    description: '原双层仓库、AMR 调度、任务、异常与交通面板；本地引擎实时计算，也可连接独立后端。',
    capability: '本地实时引擎 / 后端实时模拟', localLabel: '运行本地引擎', desktop: true,
    original: 'https://ware-twin.vercel.app', repository: 'https://github.com/WayneChou-bot/WareTwin' },
  { id: 'rftwin', name: 'RFTwin', eyebrow: '机器人工厂',
    description: '原四工艺单元、12 台机械臂与 AMR 工厂。离线提供原 Local Demo 回放，实时派工和故障注入由 Python 后端计算。',
    capability: 'Local Demo 回放 / 后端实时模拟', localLabel: '进入原版回放', desktop: true,
    original: 'https://rf-twin.vercel.app', repository: 'https://github.com/WayneChou-bot/RFTwin' },
] as const;

export function openDemoEntry(id: OpenDemoId, source: OpenDemoSource = 'local', base = '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}open-demos/${id}/index.html?source=${id === 'warehouse-journey' ? 'local' : source}`;
}

export function disposeOpenDemoFrame(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  try { frame.contentWindow?.dispatchEvent(new Event('open-demo:dispose')); }
  catch { /* Navigation still terminates an unavailable or cross-origin document. */ }
  finally { frame.src = 'about:blank'; }
}

export function readOpenDemoStatus(data: unknown, id: OpenDemoId): string | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  const allowed = ['scripted', 'connecting', 'online', 'local', 'CONNECTING', 'LIVE', 'RECONNECTING', 'STALE', 'LOCAL_DEMO', 'SCHEMA_MISMATCH', 'ERROR'];
  return message.type === 'open-demo:status' && message.id === id && typeof message.status === 'string' && allowed.includes(message.status)
    ? message.status : null;
}
