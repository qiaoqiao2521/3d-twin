import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, CircuitBoard, Download, ExternalLink, FileArchive, FolderTree, RefreshCw } from 'lucide-react';
import { HARDWARE_CATALOG, disposeHardwareFrame, fileCategory, formatBytes, hardwareUrl, validateHardwareAsset, type HardwareAsset, type HardwareId, type HardwareModel, type HardwareRoute, type OriginalFile } from '../utils/hardware';
import type { WorkspaceRoute } from '../utils/workspaceRoutes';
import './hardware.css';

const ModelViewer = lazy(() => import('./HardwareModelViewer'));
const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
function OriginalApp({ id, model }: { id: HardwareId; model: HardwareModel }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState('正在打开原版界面…');
  const src = hardwareUrl(id, model.path, base);
  useLayoutEffect(() => {
    const element = frame.current;
    if (element) element.src = src;
    return () => {
      try { (element?.contentWindow as unknown as { __hardwareSceneDispose?: () => void })?.__hardwareSceneDispose?.(); } catch { /* Unloaded document. */ }
      disposeHardwareFrame(element);
    };
  }, [src]);
  useEffect(() => {
    const change = () => {
      try { (frame.current?.contentWindow as unknown as { __hardwareScenePause?: (hidden: boolean) => void })?.__hardwareScenePause?.(document.hidden); } catch { /* The browser owns suspension for uninstrumented upstream apps. */ }
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return <div className="hardware-original-app">
    <div className="hardware-original-status" role="status">{status}<span>原应用独立运行，返回时销毁当前页面。</span></div>
    <iframe ref={frame} src={src} title={model.label} allow="fullscreen" allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-downloads allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
      onError={() => setStatus('原版页面未能加载，请刷新展示。')}
      onLoad={event => {
        try {
          const doc = event.currentTarget.contentDocument;
          if (doc?.URL === 'about:blank') return;
          const actual = doc && new URL(doc.URL);
          const expected = new URL(src, location.href);
          setStatus(actual?.pathname === expected.pathname && doc?.contentType === 'text/html' ? '原版页面已打开 · 模型加载状态以原应用为准' : '原版页面未找到，请重新构建设备资源。');
        } catch { setStatus('无法检查原版页面，请刷新展示。'); }
      }} />
    <p className="hardware-fine">保留原应用的镜头、装配和操作；在手机上可横向查看宽屏面板。</p>
  </div>;
}

function SourceInfo({ asset }: { asset: HardwareAsset }) {
  return <div className="hardware-about">
    <a className="hardware-download" href={`${base}hardware/THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">宿主查看器与本地解码器的第三方许可 <ExternalLink size={13} /></a>
    <section><h2>已接入的能力</h2><dl className="hardware-capabilities"><div><dt>结构展示</dt><dd>{asset.capabilities.structure}</dd></div><div><dt>运动与交互</dt><dd>{asset.capabilities.motion}</dd></div><div><dt>设备连接</dt><dd>{asset.capabilities.live}</dd></div></dl></section>
    {asset.limitations?.length > 0 && <section><h2>原件与当前实现的边界</h2><ul>{asset.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
    {asset.verificationReports?.length > 0 && <section><h2>转换与精度报告</h2>{asset.verificationReports.map(report => <a key={report.path} className="hardware-download" href={hardwareUrl(asset.id, report.path, base)} target="_blank" rel="noreferrer">{report.label} <ExternalLink size={13} /></a>)}</section>}
    {asset.integrationSource?.length > 0 && <section><h2>当前适配版本的对应源码</h2><p className="hardware-fine">适配源码、固定依赖与构建说明单独保留，配合下方完整原件包可重建当前发布版本。</p>{asset.integrationSource.map(source => <a key={source.path} className="hardware-download" href={hardwareUrl(asset.id, source.path, base)} download><Download size={15} />{source.label} · {source.license}</a>)}</section>}
    <section><h2>上游来源与许可</h2><div className="hardware-source-grid">{asset.sources.map(source => <article className="hardware-source" key={source.id}><h3>{source.id}</h3><p>{source.license}</p><a href={source.repository.replace(/\.git$/, '')} target="_blank" rel="noreferrer">上游仓库 <ExternalLink size={13} /></a><code>{source.revision}</code>{source.tree && <small>Git tree: {source.tree}</small>}{source.scope && <small>归档范围：{source.scope.join(' / ')}</small>}{source.archive && <a className="hardware-download" href={hardwareUrl(asset.id, source.archive, base)} download><Download size={15} />{source.scope ? '完整相关包原件' : '完整原件包'} {source.archiveSize ? `· ${formatBytes(source.archiveSize)}` : ''}</a>}<span>{source.fileCount?.toLocaleString() || '全部'} 个原始文件</span>{source.archiveSha256 && <details><summary>原件包 SHA-256</summary><code>{source.archiveSha256}</code></details>}</article>)}</div></section>
  </div>;
}

function FilePreview({ id, file }: { id: HardwareId; file: OriginalFile }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const ext = file.path.split('.').pop()?.toLowerCase() || '';
  const isText = /^(md|txt|rst|urdf|xacro|xml|mjcf|py|js|jsx|ts|tsx|json|yaml|yml|csv|ini|cfg|scad|c|h|cpp|hpp|sh|cmake|html|css|toml|ino)$/.test(ext) || /(?:^|\/)(?:license|copying|notice|makefile)$/i.test(file.path);
  const isImage = /^(png|jpe?g|webp|gif|svg)$/.test(ext);
  const src = file.url ? hardwareUrl(id, file.url, base) : null;
  useEffect(() => {
    setText(''); setError('');
    if (!src || !isText || file.size > 2 * 1024 ** 2) return;
    const abort = new AbortController();
    fetch(src, { signal: abort.signal }).then(response => { if (!response.ok) throw new Error('原件读取失败'); return response.text(); }).then(value => { if (!abort.signal.aborted) setText(value); }).catch(error => { if (!abort.signal.aborted) setError(String(error.message || error)); });
    return () => abort.abort();
  }, [src, isText, file.size]);
  return <div className="hardware-file-preview"><div className="hardware-file-heading"><strong>{file.path}</strong><span>{file.sourceId} · {formatBytes(file.size)}</span><div>{src && <a className="hardware-download" href={src} download><Download size={15} />下载原文件</a>}{file.archive && <a className="hardware-download" href={hardwareUrl(id, file.archive, base)} download><FileArchive size={15} />下载完整原件包</a>}</div></div>
    {!src ? <p className="hardware-preview-note">此文件完整保存在上方原件包中。下载并解压后，按显示的原始路径查找；项目为主要设计文件、图纸和关节模型另提供直接下载。</p> : isImage ? <img src={src} alt={file.path} /> : ext === 'pdf' ? <iframe title={file.path} src={src} /> : isText && file.size <= 2 * 1024 ** 2 ? <pre>{error || text || '正在读取原文…'}</pre> : <p className="hardware-preview-note">原文件保持原格式，点击下载后使用相应 CAD、表格或开发工具打开。三维展示请切换到“结构与运动”。</p>}
    {file.sha256 && <details className="hardware-fine"><summary>原文件 SHA-256</summary><code>{file.sha256}</code></details>}
  </div>;
}

function OriginalFiles({ asset, selected, navigate }: { asset: HardwareAsset; selected?: string; navigate: (patch: Partial<HardwareRoute>) => void }) {
  const [files, setFiles] = useState<OriginalFile[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [sourceId, setSourceId] = useState('全部');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController(); setError(''); setFiles([]);
    fetch(hardwareUrl(asset.id, asset.filesIndex, base), { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('原件索引未生成，请执行 npm run build:hardware');
      const data = await response.json(); if (data.schemaVersion !== 1 || !Array.isArray(data.files)) throw new Error('原件索引版本不正确');
      if (!abort.signal.aborted) setFiles(data.files);
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [asset]);
  const filtered = files.filter(file => (sourceId === '全部' || file.sourceId === sourceId) && (category === '全部' || fileCategory(file.path) === category) && `${file.sourceId}/${file.path}`.toLowerCase().includes(query.toLowerCase()));
  const selectedFile = files.find(file => `${file.sourceId}:${file.path}` === selected);
  const categories = ['全部', 'CAD', '关节与仿真', '网格', '图纸与物料', '文档', '图片', '许可', '源码与其他'];
  return <div className="hardware-files"><div className="hardware-file-directory"><div className="hardware-file-filters"><input className="hardware-search" aria-label="搜索全部原始文件" placeholder="搜索文件名或原始路径" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /><select aria-label="原件类型" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}>{categories.map(value => <option key={value}>{value}</option>)}</select><select aria-label="原件来源" value={sourceId} onChange={event => { setSourceId(event.target.value); setPage(0); }}><option>全部</option>{asset.sources.map(source => <option key={source.id}>{source.id}</option>)}</select></div>
      <div className="hardware-file-count" role="status">{error || (files.length ? `${filtered.length.toLocaleString()} / ${files.length.toLocaleString()} 个原始文件` : '正在读取完整原件索引…')}</div>
      <div className="hardware-file-list">{filtered.slice(page * 60, (page + 1) * 60).map(file => <button key={`${file.sourceId}:${file.path}`} aria-pressed={file === selectedFile} onClick={() => navigate({ view: 'files', file: `${file.sourceId}:${file.path}` })}><span>{fileCategory(file.path)}</span><strong>{file.path}</strong><small>{formatBytes(file.size)} · {file.url ? '可直接读取' : '完整原件包内'}</small></button>)}</div>
      {filtered.length > 60 && <div className="hardware-pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(filtered.length / 60)}</span><button disabled={(page + 1) * 60 >= filtered.length} onClick={() => setPage(page + 1)}>下一页</button></div>}
    </div>
    {selectedFile ? <FilePreview key={`${asset.id}:${selected}`} id={asset.id} file={selectedFile} /> : <div className="hardware-file-welcome"><FolderTree size={38} /><h2>原始设计，完整留存。</h2><p>选择文件查看原文或下载。完整包包含固定上游版本的所有原始文件；需要一起使用的 CAD 分卷、装配引用和配套零件均保留在包内。</p>{selected && files.length > 0 && <p role="alert">当前深链接中的文件不在此版本原件索引内，请从目录重新选择。</p>}{asset.sources.map(source => source.archive && <a className="hardware-download" key={source.id} href={hardwareUrl(asset.id, source.archive, base)} download><FileArchive size={17} />{source.id} 完整包 {source.archiveSize ? `· ${formatBytes(source.archiveSize)}` : ''}</a>)}</div>}
  </div>;
}

export default function HardwareWorkspace({ route, navigate }: { route: HardwareRoute; navigate: (route: WorkspaceRoute) => void }) {
  const [loadedAsset, setAsset] = useState<HardwareAsset | null>(null);
  const asset = loadedAsset?.id === route.asset ? loadedAsset : null;
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<'all' | 'robot' | 'machine'>('all');
  useEffect(() => {
    setAsset(null); setError(''); if (!route.asset) return;
    const id = route.asset, abort = new AbortController();
    fetch(hardwareUrl(id, 'asset.json', base), { signal: abort.signal }).then(async response => {
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('设备资源尚未生成，请运行 npm run build:hardware 后重试。');
      const value = validateHardwareAsset(await response.json(), id);
      if (!abort.signal.aborted) setAsset(value);
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [route.asset, reload]);
  const refresh = () => { setAsset(null); setError(''); setReload(value => value + 1); };
  const patchRoute = (patch: Partial<HardwareRoute>) => navigate({ ...route, ...patch, workspace: 'hardware' });
  if (!route.asset) return <section className="hardware-library" aria-label="机器人与真实设备目录"><div className="hardware-library-intro"><span className="hardware-eyebrow">机器人与真实设备 / 原始结构学习区</span><h1>看清结构，再研究运动。</h1><p>{HARDWARE_CATALOG.length} 套真实结构，从执行器到机械臂，从桌面平台到工业设备。保留原始零件、装配、图纸和控制资料，让展示与原件可以相互核对。</p><div className="hardware-library-filters">{[['all', '全部设备'], ['robot', '机器人'], ['machine', '机床与设备']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value as typeof filter)}>{label}</button>)}</div></div><div className="hardware-cards">{HARDWARE_CATALOG.filter(entry => filter === 'all' || entry.kind === filter).map((entry, index) => <article className="hardware-card" key={entry.id}><div className={`hardware-card-art ${entry.kind}`} aria-hidden="true">{entry.kind === 'robot' ? <CircuitBoard size={52} strokeWidth={1.2} /> : <Box size={52} strokeWidth={1.2} />}<span>{String(HARDWARE_CATALOG.findIndex(item => item.id === entry.id) + 1).padStart(2, '0')}</span></div><div className="hardware-card-body"><span className="hardware-eyebrow">{entry.category}</span><h2>{entry.title}</h2><p>{entry.description}</p><div className="hardware-card-detail">{entry.detail}</div><div className="hardware-card-actions"><button className="hardware-primary" onClick={() => navigate({ workspace: 'hardware', asset: entry.id, view: 'structure' })}>进入展示 <ArrowRight size={16} /></button><button onClick={() => navigate({ workspace: 'hardware', asset: entry.id, view: 'files' })}>原始文件</button></div></div></article>)}</div><p className="hardware-library-note">CAD 展示、关节运动学和原版应用分别标注。实时控制与物理仿真需要独立系统，本目录不会把预览动作标作真机运行。</p></section>;
  const entry = HARDWARE_CATALOG.find(item => item.id === route.asset)!;
  const model = asset?.models.find(model => model.id === route.model) || asset?.models[0];
  const view = route.view || 'structure';
  return <section className="hardware-session" aria-label={`${entry.title} 设备工作空间`}><header className="hardware-toolbar"><button onClick={() => navigate({ workspace: 'hardware' })}><ArrowLeft size={16} />设备目录</button><strong>{asset?.title || entry.title}</strong><div className="hardware-tabs">{[['structure', '结构与运动'], ['files', '原始文件'], ['about', '来源与能力']].map(([value, label]) => <button key={value} aria-current={view === value ? 'page' : undefined} onClick={() => patchRoute({ view: value as HardwareRoute['view'] })}>{label}</button>)}</div><button onClick={refresh}><RefreshCw size={15} />刷新展示</button></header>
    {error ? <div className="hardware-load-error" role="alert"><h2>设备资源未能打开</h2><p>{error}</p><button onClick={refresh}>重新加载</button></div> : !asset ? <div className="hardware-loading" role="status">正在读取设备与原件清单…</div> : view === 'files' ? <OriginalFiles asset={asset} selected={route.file} navigate={patchRoute} /> : view === 'about' ? <SourceInfo asset={asset} /> : model && <>
      <div className="hardware-model-toolbar"><label>展示内容 <select aria-label="展示内容" value={model.id} onChange={event => patchRoute({ model: event.target.value })}>{asset.models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label><span className="hardware-model-kind">{model.format === 'html' ? '原版应用' : model.format === 'urdf' ? '原件关节运动学' : '原始 CAD / 网格展示'}</span><button onClick={() => patchRoute({ view: 'files', file: `${model.source.id}:${model.source.path}` })}>查阅对应原件</button></div>
      {route.model && !asset.models.some(model => model.id === route.model) && <p className="hardware-fine" role="status">链接指定的模型不在当前版本中，已显示默认原件。</p>}
      <div className="hardware-model-main" key={`${route.asset}:${model.id}:${reload}`}>{model.format === 'html' ? <OriginalApp id={asset.id} model={model} /> : <Suspense fallback={<div className="hardware-loading">正在准备三维查看器…</div>}><ModelViewer assetId={asset.id} model={model} /></Suspense>}</div>
      <details className="hardware-model-notes"><summary>当前展示说明与能力边界</summary><p>{asset.capabilities.motion}</p>{model.limitations?.map((text, index) => <p key={index}>{text}</p>)}<p>{asset.capabilities.live}</p></details>
    </>}
  </section>;
}
