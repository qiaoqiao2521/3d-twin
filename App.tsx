import React, { lazy, Suspense, useEffect, useState } from 'react';
import { resolveWorkspaceLocation, workspaceSearch, type WorkspaceRoute } from './src/utils/workspaceRoutes';

const TwinWorkbench = lazy(() => import('./src/components/TwinWorkbench'));
const IronWorkspace = lazy(() => import('./src/components/IronWorkspace'));
const WarehouseWorkspace = lazy(() => import('./src/components/WarehouseWorkspace'));

export default function App() {
  const [route, setRoute] = useState<WorkspaceRoute>(() => resolveWorkspaceLocation(window.location.search));
  useEffect(() => {
    const onPopState = () => setRoute(resolveWorkspaceLocation(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: WorkspaceRoute) => {
    const search = workspaceSearch(next, window.location.search);
    window.history.pushState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    setRoute(next);
  };
  const engineering = route.workspace === 'engineering';

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-[#0d1017] text-slate-100 overflow-hidden">
      <header className="shrink-0 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#10151d] px-3 py-2">
        <span className="mr-2 shrink-0 whitespace-nowrap text-sm font-semibold tracking-wide">3D 孪生</span>
        <nav aria-label="工作空间" className="order-last flex w-full min-w-0 flex-wrap gap-1 rounded-lg bg-black/20 p-1 sm:order-none sm:w-auto">
          <button type="button" onClick={() => navigate({ workspace: 'engineering', mode: 'cad_hub' })}
            aria-current={engineering ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:flex-none ${engineering ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:text-white'}`}>
            现实工程
          </button>
          <button type="button" onClick={() => navigate({ workspace: 'iron' })}
            aria-current={route.workspace === 'iron' ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:flex-none ${route.workspace === 'iron' ? 'bg-amber-500/15 text-amber-200' : 'text-slate-400 hover:text-white'}`}>
            iron · 虚拟角色
          </button>
          <button type="button" onClick={() => navigate({ workspace: 'warehouse' })}
            aria-current={route.workspace === 'warehouse' ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:flex-none ${route.workspace === 'warehouse' ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400 hover:text-white'}`}>
            智慧仓储
          </button>
        </nav>
        <details className="relative ml-auto shrink-0 text-xs">
          <summary className="cursor-pointer rounded-md px-2 py-1.5 text-slate-400 hover:text-white">实验</summary>
          <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900 p-1.5 shadow-xl">
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
              onClick={(event) => { navigate({ workspace: 'engineering', mode: 'sandbox' }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
              动作沙盒
            </button>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
              onClick={(event) => { navigate({ workspace: 'engineering', mode: 'mars_combat' }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
              赤星战区
            </button>
          </div>
        </details>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-sm text-slate-400">正在打开工作空间…</div>}>
          {route.workspace === 'engineering'
            ? <TwinWorkbench key={route.mode} initialMode={route.mode} />
            : route.workspace === 'warehouse' ? <WarehouseWorkspace /> : <IronWorkspace />}
        </Suspense>
      </main>
    </div>
  );
}
