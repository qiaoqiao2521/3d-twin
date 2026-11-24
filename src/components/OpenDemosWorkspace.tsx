import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Factory, Layers3, RefreshCw, Warehouse } from 'lucide-react';
import { OPEN_DEMOS, disposeOpenDemoFrame, openDemoEntry, readOpenDemoStatus, type OpenDemoId, type OpenDemoRoute, type OpenDemoSource } from '../utils/openDemos';
import type { WorkspaceRoute } from '../utils/workspaceRoutes';
import './openDemos.css';

const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const statusLabels: Record<string, string> = {
  scripted: '预设流程演示', connecting: '正在连接数据源', online: 'BACKEND · 后端实时模拟', local: 'LOCAL · 本地实时引擎',
  CONNECTING: '正在准备数据', LIVE: 'LIVE · 后端实时模拟', RECONNECTING: '正在重连 · 最近状态', STALE: 'STALE · 实时数据已过期',
  LOCAL_DEMO: 'LOCAL DEMO · 原版确定性回放', SCHEMA_MISMATCH: '后端数据版本不匹配', ERROR: '数据加载失败',
};

function OriginalFrame({ id, source, onState }: { id: OpenDemoId; source: OpenDemoSource; onState: (state: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = openDemoEntry(id, source, env.BASE_URL || '/');
  const callback = useRef(onState);
  callback.current = onState;
  useLayoutEffect(() => {
    const current = frame.current;
    if (current && current.getAttribute('src') !== src) current.src = src;
    return () => disposeOpenDemoFrame(current);
  }, [src]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const status = readOpenDemoStatus(event.data, id);
      if (status) callback.current(status);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id]);
  return <iframe ref={frame} src={src} title={`${OPEN_DEMOS.find((demo) => demo.id === id)?.name} 原版场景`}
    className="open-demo-frame" allow="fullscreen" allowFullScreen
    sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads allow-popups allow-popups-to-escape-sandbox"
    onError={() => callback.current('load-error')}
    onLoad={(event) => {
      try {
        const doc = event.currentTarget.contentDocument;
        if (doc?.URL === 'about:blank') return;
        const expected = new URL(src, location.href);
        const actual = doc && new URL(doc.URL);
        if (actual?.origin !== expected.origin || actual.pathname !== expected.pathname || doc?.querySelector('meta[name="open-demo-id"]')?.getAttribute('content') !== id) {
          callback.current('load-error');
        } else callback.current('document-loaded');
      } catch { callback.current('load-error'); }
    }} />;
}

export default function OpenDemosWorkspace({ route, navigate }: { route: OpenDemoRoute; navigate: (route: WorkspaceRoute) => void }) {
  const demo = OPEN_DEMOS.find((entry) => entry.id === route.demo);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState('opening');
  const [loaded, setLoaded] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const source = route.source || 'local';
  useEffect(() => { setState('opening'); setLoaded(false); }, [route.demo, source, reload]);
  useEffect(() => {
    if (!demo || loaded) return;
    const timeout = window.setTimeout(() => setState('load-error'), 45_000);
    return () => window.clearTimeout(timeout);
  }, [demo, loaded, reload, source]);
  function receiveState(next: string) {
    if (next === 'document-loaded') { setLoaded(true); return; }
    setState(next);
  }

  if (!demo) return <section className="open-demo-library" aria-label="开源仓储与工厂场景目录">
    <div className="open-demo-library-intro">
      <span className="open-demo-eyebrow">仓储与工厂 / 原版体验</span>
      <h1>走进流程，观察运行。</h1>
      <p>在同一个工作台进入独立场景；每个场景保留原来的模型、镜头、操作和计算方式。</p>
      <button type="button" className="open-demo-existing" onClick={() => navigate({ workspace: 'warehouse' })}>
        <Warehouse size={18} /> Smart Warehouse 原智慧仓储 <ArrowRight size={16} />
      </button>
    </div>
    <div className="open-demo-cards">
      {OPEN_DEMOS.map((entry, index) => {
        const Icon = index === 0 ? Box : index === 1 ? Layers3 : Factory;
        return <article className="open-demo-card" key={entry.id}>
          <div className={`open-demo-card-art scene-${entry.id}`} aria-hidden="true"><Icon size={64} strokeWidth={1} /><span>0{index + 1}</span></div>
          <div className="open-demo-card-body">
            <span className="open-demo-eyebrow">{entry.eyebrow}</span><h2>{entry.name}</h2>
            <p>{entry.description}</p><div className="open-demo-capability">{entry.capability}</div>
            <p className="open-demo-device">{entry.desktop ? '原作是宽屏控制台，手机可横向查看完整面板。' : '支持触屏浏览；手机使用原作的平衡画质。'}</p>
            <div className="open-demo-card-actions">
              <button type="button" className="open-demo-primary" onClick={() => navigate({ workspace: 'open-demos', demo: entry.id, source: 'local' })}>{entry.localLabel}<ArrowRight size={16} /></button>
              {entry.desktop && <button type="button" onClick={() => navigate({ workspace: 'open-demos', demo: entry.id, source: 'live' })}>连接本机后端</button>}
            </div>
          </div>
        </article>;
      })}
    </div>
    <p className="open-demo-library-note">这里的仓库、工厂与业务数据均为模拟。后端连接状态会在场景中明确显示，离线回放和实时计算分别标注。</p>
  </section>;

  const fallback = source === 'live' && (state === 'local' || state === 'LOCAL_DEMO');
  return <section className="open-demo-session" aria-label={`${demo.name} 工作空间`}>
    <div className="open-demo-toolbar">
      <button type="button" onClick={() => navigate({ workspace: 'open-demos' })}><ArrowLeft size={16} />场景目录</button>
      <div className="open-demo-title"><strong>{demo.name}</strong><span role="status">{statusLabels[state] || (state === 'load-error' ? '场景未能打开' : '正在打开原版场景…')}</span></div>
      {demo.desktop && <div className="open-demo-mode" aria-label="数据来源">
        <button type="button" aria-pressed={source === 'local'} onClick={() => source !== 'local' && navigate({ workspace: 'open-demos', demo: demo.id, source: 'local' })}>{demo.id === 'waretwin' ? '本地引擎' : '原版回放'}</button>
        <button type="button" aria-pressed={source === 'live'} onClick={() => source !== 'live' && navigate({ workspace: 'open-demos', demo: demo.id, source: 'live' })}>后端实时</button>
      </div>}
      <button type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} />刷新场景</button>
    </div>
    {fallback && <div className="open-demo-service-note" role="status">本机后端尚未连接，当前运行{demo.id === 'waretwin' ? '原版浏览器实时引擎' : '原版 Local Demo 回放'}。<details><summary>本机启动方法</summary><code>npm run start:{demo.id}</code><span>在项目根目录的另一终端启动，准备完成后切换到“后端实时”或刷新场景。</span></details></div>}
    <div className={`open-demo-viewport ${demo.desktop ? 'wide-console' : ''}`} ref={viewport}>
      <OriginalFrame key={`${demo.id}:${source}:${reload}`} id={demo.id} source={source} onState={receiveState} />
    </div>
    {demo.desktop && <div className="open-demo-mobile-pan"><span>完整控制台</span>{[['左侧', 0], ['场景', 0.5], ['右侧', 1]].map(([label, fraction]) =>
      <button key={label} type="button" onClick={() => { if (viewport.current) viewport.current.scrollTo({ left: (viewport.current.scrollWidth - viewport.current.clientWidth) * Number(fraction), behavior: 'smooth' }); }}>{label}</button>)}</div>}
    {state === 'load-error' && <div className="open-demo-error" role="alert"><h2>原版场景暂未打开</h2><p>可重新加载，或返回目录选择其他场景。</p><button type="button" onClick={() => setReload((value) => value + 1)}>重新加载</button><button type="button" onClick={() => navigate({ workspace: 'open-demos' })}>返回目录</button></div>}
  </section>;
}
