import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { disposeWarehouseFrame } from '../../integrations/smart-warehouse/lifecycle';

const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const entry = `${env.BASE_URL || '/'}integrations/smart-warehouse/index.html`;

function WarehouseFrame({ onLoad, onError }: {
  onLoad: (event: React.SyntheticEvent<HTMLIFrameElement>) => void;
  onError: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useLayoutEffect(() => {
    const current = frame.current;
    // StrictMode rehearses mount/cleanup in development. Restore the entry
    // after that rehearsal instead of leaving a permanently blank frame.
    if (current && current.getAttribute('src') !== entry) current.src = entry;
    return () => disposeWarehouseFrame(current);
  }, []);
  return <iframe ref={frame} title="智慧仓储原场景" src={entry}
    className="h-full w-full border-0" allow="fullscreen" allowFullScreen
    sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
    onLoad={onLoad} onError={onError} />;
}

/** Keep the original Vue scene in its own document and release it when leaving. */
export default function WarehouseWorkspace() {
  const [reloadKey, setReloadKey] = useState(0);
  const [pageState, setPageState] = useState<'opening' | 'loaded' | 'error'>('opening');

  useEffect(() => {
    if (pageState !== 'opening') return;
    const timer = window.setTimeout(() => setPageState('error'), 20_000);
    return () => window.clearTimeout(timer);
  }, [pageState, reloadKey]);

  function retry() {
    setPageState('opening');
    setReloadKey((value) => value + 1);
  }

  function checkLoadedPage(event: React.SyntheticEvent<HTMLIFrameElement>) {
    try {
      const document = event.currentTarget.contentDocument;
      // A same-origin SPA fallback also fires load. Only the original Vue app
      // counts as opened; model loading/errors remain in its own visible UI.
      if (document?.URL === 'about:blank') return;
      const expected = new URL(entry, window.location.href);
      const actual = document && new URL(document.URL);
      const isWarehouse = actual?.origin === expected.origin && actual.pathname === expected.pathname &&
        Boolean(document?.querySelector('.smart-warehouse-app .canvas-container'));
      setPageState(isWarehouse ? 'loaded' : 'error');
    } catch {
      setPageState('error');
    }
  }

  return (
    <section aria-label="智慧仓储工作空间" className="flex h-full min-h-0 flex-col bg-[#080d17]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-slate-400">
        <span>原场景 · 物流循环演示</span>
        <a href={entry} target="_blank" rel="noopener noreferrer"
          className="rounded px-2 py-1 text-emerald-200 hover:bg-white/5">独立打开仓储</a>
      </div>
      <div className="relative min-h-0 flex-1">
        <WarehouseFrame key={reloadKey} onLoad={checkLoadedPage} onError={() => setPageState('error')} />
        {pageState === 'opening' && <div role="status" className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded bg-slate-950/90 px-3 py-2 text-xs text-slate-300">正在打开仓储场景…</div>}
        {pageState === 'error' && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#080d17]/95 p-6 text-center">
          <p className="text-sm text-slate-200">仓储页面暂时没有打开，请重试。</p>
          <div className="flex gap-3">
            <button type="button" onClick={retry} className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm text-emerald-200">重新加载</button>
            <a href={entry} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/5 px-4 py-2 text-sm">独立打开</a>
          </div>
        </div>}
      </div>
    </section>
  );
}
