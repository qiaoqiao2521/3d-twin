import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import integration from '../../integrations/iron.json';
import { findInspectionNode, getInspectionChildren } from '../shared/inspection/sceneInspection';
import {
  IRON_CHANNEL, IRON_PROTOCOL_VERSION, ironRevisionMatches, isTrustedIronEvent,
  parseIronEnvelope, parseIronState, resolveIronEndpoint,
  type IronCommand, type IronState
} from '../utils/ironBridge';

const ENDPOINT_KEY = 'digital-twin.iron-endpoint.v1';
const env = (import.meta as unknown as { env?: Record<string, string | boolean> }).env || {};
const CAMERA_PRESETS = [
  ['hero_low', '角色全景'], ['highway_chase', '追随'], ['bullet_time_orbit', '环绕'],
  ['battlemask_closeup', '面部'], ['matrix_closeup', '胸部'],
  ['over_shoulder_combat', '越肩'], ['rear_wings', '背部']
] as const;

function savedEndpoint(): string {
  try { return localStorage.getItem(ENDPOINT_KEY) || String(env.VITE_IRON_URL || ''); }
  catch { return String(env.VITE_IRON_URL || ''); }
}

export default function IronWorkspace() {
  const [configuredUrl, setConfiguredUrl] = useState(savedEndpoint);
  const [urlDraft, setUrlDraft] = useState(configuredUrl);
  const [settingsOpen, setSettingsOpen] = useState(!configuredUrl);
  const [configError, setConfigError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [model, setModel] = useState<IronState | null>(null);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const helloId = useRef('');
  const serial = useRef(0);
  const modelRef = useRef<IronState | null>(null);
  const handshakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeRetry = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const expectedRevision = integration.revision as string | null;

  const endpoint = useMemo(() => {
    if (!configuredUrl.trim()) return null;
    try { return resolveIronEndpoint(configuredUrl, window.location.origin); }
    catch { return null; }
  }, [configuredUrl]);
  const standaloneUrl = useMemo(() => {
    if (!endpoint) return '';
    const url = new URL(endpoint.url);
    url.searchParams.delete('embed');
    url.searchParams.delete('parentOrigin');
    return url.href;
  }, [endpoint]);
  const revisionMatches = model && ironRevisionMatches(expectedRevision, model.revision, env.DEV === true);
  const canControl = phase === 'ready' && Boolean(revisionMatches);
  const can = (command: IronCommand) => canControl && Boolean(model?.capabilities.includes(command));

  const stopHandshake = useCallback(() => {
    if (handshakeTimeout.current) clearTimeout(handshakeTimeout.current);
    if (handshakeRetry.current) clearInterval(handshakeRetry.current);
    handshakeTimeout.current = null;
    handshakeRetry.current = null;
  }, []);

  const post = useCallback((type: IronCommand, payload: Record<string, unknown>, id: string) => {
    if (!endpoint || !frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage({ channel: IRON_CHANNEL, version: IRON_PROTOCOL_VERSION, id, type, payload }, endpoint.origin);
  }, [endpoint]);

  const startHandshake = useCallback(() => {
    stopHandshake();
    setPhase('connecting');
    setModel(null);
    modelRef.current = null;
    setError(null);
    setCommandError(null);
    helloId.current = `host-hello-${Date.now()}-${++serial.current}`;
    const sayHello = () => post('hello', { host: 'digital-twin' }, helloId.current);
    sayHello();
    handshakeRetry.current = setInterval(sayHello, 1000);
    handshakeTimeout.current = setTimeout(() => {
      stopHandshake();
      setPhase('error');
      setError('iron 未在 15 秒内完成连接。请检查站点地址、嵌入支持及页面访问权限。');
    }, 15000);
  }, [post, expectedRevision, stopHandshake]);

  useEffect(() => {
    if (!endpoint) return;
    const mountedFrameWindow = frameRef.current?.contentWindow;
    const receive = (event: MessageEvent) => {
      if (!isTrustedIronEvent(event, endpoint.origin, frameRef.current?.contentWindow)) return;
      const message = parseIronEnvelope(event.data);
      if (!message) return;
      if (message.version !== IRON_PROTOCOL_VERSION) {
        stopHandshake();
        setPhase('error');
        setError(`嵌入协议不兼容：本站需要 v${IRON_PROTOCOL_VERSION}，iron 返回 v${message.version}。`);
        return;
      }
      const handshake = message.id === helloId.current;
      const timer = pending.current.get(message.id);
      if (message.type !== 'state' && !handshake && !timer) return;
      if (timer) { clearTimeout(timer); pending.current.delete(message.id); }
      if (message.type === 'error') {
        const reason = typeof message.payload.message === 'string' ? message.payload.message : 'iron 拒绝了这项操作。';
        if (handshake) { stopHandshake(); setPhase('error'); setError(reason); }
        else setCommandError(reason);
        return;
      }
      if (message.type === 'ready' && !handshake) return;
      if (message.type === 'state' && !modelRef.current) return;
      const parsed = parseIronState(message.payload.state || message.payload);
      if (!parsed.state) {
        if (handshake) { stopHandshake(); setPhase('error'); setError(parsed.error); }
        else setCommandError(parsed.error);
        return;
      }
      const next = parsed.state;
      if (next.selectedCharacterId !== modelRef.current?.selectedCharacterId) {
        setGroupId(null); setQuery(''); setVisibleCount(60);
      }
      modelRef.current = next;
      setModel(next);
      setProgress(next.transformProgress);
      if (handshake && message.payload.runtimeReady !== false) { stopHandshake(); setError(null); setPhase('ready'); }
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      stopHandshake();
      for (const timer of pending.current.values()) clearTimeout(timer);
      pending.current.clear();
      mountedFrameWindow?.postMessage({ channel: IRON_CHANNEL, version: IRON_PROTOCOL_VERSION,
        id: `host-leave-${++serial.current}`, type: 'pause', payload: {} }, endpoint.origin);
    };
  }, [endpoint, post, stopHandshake, reloadKey]);

  const send = (type: IronCommand, payload: Record<string, unknown> = {}) => {
    if (!can(type)) return;
    setCommandError(null);
    const id = `host-${Date.now()}-${++serial.current}`;
    const timer = setTimeout(() => {
      pending.current.delete(id);
      setCommandError('操作未收到确认，可刷新结构或重新连接。');
    }, 8000);
    pending.current.set(id, timer);
    post(type, payload, id);
  };
  const commitProgress = () => {
    if (model && Math.abs(progress - model.transformProgress) > 0.0001) send('scrub', { progress });
  };

  const snapshot = model?.inspection;
  const selectedPart = snapshot && model?.selectedPartId ? findInspectionNode(snapshot, model.selectedPartId) : null;
  const currentGroup = snapshot && groupId ? findInspectionNode(snapshot, groupId) : null;
  const listedNodes = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLocaleLowerCase();
    return needle ? snapshot.nodes.filter((node) => node.name.toLocaleLowerCase().includes(needle) || node.id.toLocaleLowerCase().includes(needle))
      : getInspectionChildren(snapshot, groupId);
  }, [snapshot, groupId, query]);

  const saveEndpoint = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const clean = urlDraft.trim();
      if (clean) resolveIronEndpoint(clean, window.location.origin);
      try {
        if (clean) localStorage.setItem(ENDPOINT_KEY, clean); else localStorage.removeItem(ENDPOINT_KEY);
      } catch { /* The current connection still works when local storage is unavailable. */ }
      setConfiguredUrl(clean); setConfigError(null); setError(null); setModel(null);
      setSettingsOpen(!clean); setReloadKey((value) => value + 1);
    } catch (cause) { setConfigError(cause instanceof Error ? cause.message : '站点地址无效。'); }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="iron 虚拟角色工作空间">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-200">虚拟角色</span>
        <span className="text-slate-400">代码生成 · 无实体映射 · 尺寸未标定</span>
        <div className="ml-auto flex gap-3">
          {endpoint && <a href={standaloneUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">独立打开 iron ↗</a>}
          <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="text-slate-300 hover:text-white">连接设置</button>
        </div>
      </div>
      {(settingsOpen || !endpoint) && <form onSubmit={saveEndpoint} className="shrink-0 border-b border-white/10 bg-slate-900/60 p-3">
        <label htmlFor="iron-endpoint" className="mb-2 block text-xs font-medium">iron 站点地址</label>
        <div className="flex flex-wrap gap-2">
          <input id="iron-endpoint" type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="填写你已部署或本地运行的 iron 地址" className="min-w-0 flex-1 basis-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
          <button type="submit" className="rounded-lg bg-cyan-500/20 px-4 py-2 text-xs text-cyan-100">保存并连接</button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">地址仅保存在当前浏览器。iron 保持独立运行，连接后可在这里检查角色结构与变形。</p>
        {configError && <p role="alert" className="mt-2 text-xs text-red-300">{configError}</p>}
      </form>}
      {!endpoint ? <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-slate-900/50 p-6">
          <h1 className="text-xl font-semibold">为 iron 留出独立工作空间</h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">尚未配置连接。填写 iron 的运行地址后，角色、原有外形与专属动作仍由 iron 提供；这里增加结构浏览、部件选择和隔离检查。</p>
          <p className="mt-3 text-xs text-amber-200/80">虚拟模型不会被视为已有实体、制造文件或实机状态。</p>
        </div>
      </div> : <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[42%] min-h-0 shrink-0 flex-col overflow-y-auto border-b border-white/10 bg-[#111821] md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span role="status" className={phase === 'ready' ? 'text-emerald-300' : 'text-slate-400'}>{phase === 'ready' ? '已连接' : phase === 'error' ? '连接未完成' : '正在连接…'}</span>
              <button type="button" onClick={() => { setPhase('connecting'); setModel(null); modelRef.current = null; setReloadKey((value) => value + 1); }} className="text-slate-400 hover:text-white">重新连接</button>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-950/40 p-2 text-xs leading-5 text-red-200">{error}</p>}
            {model && !revisionMatches && <p role="alert" className="rounded-lg bg-amber-950/40 p-2 text-xs leading-5 text-amber-200">来源修订未匹配，当前仅查看。请使用已锁定版本的 iron，再重新连接。</p>}
            <div className="space-y-1 break-all text-[10px] text-slate-500">
              <p>锁定修订：{expectedRevision?.slice(0, 12) || '开发环境未锁定'}</p>
              <p>运行修订：{model?.revision?.slice(0, 12) || '未报告'}</p>
            </div>
            <label className="block text-xs text-slate-300">角色
              <select aria-label="iron 角色" disabled={!can('select-character')} value={model?.selectedCharacterId || ''}
                onChange={(event) => send('select-character', { characterId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm disabled:opacity-40">
                {!model && <option value="">等待角色目录</option>}
                {model?.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-300">变形进度 <span className="float-right text-slate-500">{Math.round(progress * 100)}%</span>
              <input type="range" aria-label="iron 变形进度" min="0" max="1" step="0.01" value={progress} disabled={!can('scrub')}
                onChange={(event) => setProgress(Number(event.target.value))} onPointerUp={commitProgress} onKeyUp={commitProgress} onBlur={commitProgress}
                className="mt-2 w-full accent-amber-400 disabled:opacity-40" />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={!can(model?.paused ? 'resume' : 'pause')} onClick={() => send(model?.paused ? 'resume' : 'pause')}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40">{model?.paused ? '继续预览' : '暂停预览'}</button>
              <button type="button" disabled={!can('inspect')} onClick={() => send('inspect')}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40">刷新结构</button>
            </div>
            <label className="block text-xs text-slate-300">镜头
              <select aria-label="iron 镜头" value={model?.cameraPreset || 'hero_low'} disabled={!can('set-camera')}
                onChange={(event) => send('set-camera', { preset: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs disabled:opacity-40">
                {CAMERA_PRESETS.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
            {commandError && <p role="alert" className="text-xs leading-5 text-red-300">{commandError}</p>}
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex justify-between text-xs"><h2 className="font-medium">程序结构树</h2><span className="text-slate-500">{snapshot?.nodes.length || 0} 节点</span></div>
            <input aria-label="查找 iron 部件" placeholder="按名称或 ID 查找" value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleCount(60); }}
              className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs" />
            {!query && <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <button type="button" onClick={() => { setGroupId(null); setVisibleCount(60); }}>全部</button>
              {currentGroup && <><span>/</span><button type="button" onClick={() => { setGroupId(currentGroup.parentId); setVisibleCount(60); }}>上一层</button><span className="truncate">{currentGroup.name}</span></>}
            </div>}
            <div role="list" aria-label="iron 结构节点" className="space-y-0.5">
              {listedNodes.slice(0, visibleCount).map((node) => <button key={node.id} type="button" role="listitem" title={node.id}
                disabled={node.kind === 'part' && !can('select-part')}
                onClick={() => { if (node.kind === 'part') send('select-part', { partId: node.id }); else { setGroupId(node.id); setQuery(''); setVisibleCount(60); } }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs disabled:opacity-50 ${node.id === model?.selectedPartId ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300 hover:bg-white/5'}`}>
                <span aria-hidden="true" className="text-slate-500">{node.kind === 'part' ? '·' : '▸'}</span><span className="truncate">{node.name}</span>
              </button>)}
              {listedNodes.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 60)} className="py-2 text-xs text-cyan-300">显示更多（剩余 {listedNodes.length - visibleCount}）</button>}
              {snapshot && listedNodes.length === 0 && <p className="py-2 text-xs text-slate-500">没有匹配的节点。</p>}
            </div>
            <p className="mt-3 truncate text-xs text-slate-400">{selectedPart ? `已选：${selectedPart.name}` : '选择一个部件进行检查'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={!selectedPart || !can('isolate-part')} onClick={() => selectedPart && send('isolate-part', { partId: selectedPart.id })}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40">隔离部件</button>
              <button type="button" disabled={!can('reset-inspection')} onClick={() => send('reset-inspection')}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-40">恢复显示</button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">这里的层级描述程序蓝图与角色部件，不代表制造装配表或实体关节。</p>
          </div>
        </aside>
        <div className="relative min-h-0 flex-1 bg-[#080c13]">
          <iframe key={`${endpoint.url}:${reloadKey}`} ref={frameRef} title="iron 独立虚拟角色预览" src={endpoint.url}
            onLoad={startHandshake} onError={() => { stopHandshake(); setPhase('error'); setError('iron 页面加载失败。'); }}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-popups-to-escape-sandbox" allow="fullscreen" referrerPolicy="no-referrer"
            className="h-full w-full border-0" />
        </div>
      </div>}
    </section>
  );
}
