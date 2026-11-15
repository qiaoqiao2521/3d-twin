import React from 'react';
import { Aperture, Camera, CheckCircle2 } from 'lucide-react';

interface PathTracingHudBarProps {
  pathTracingEnabled: boolean;
  spp: number;
  maxSpp?: number;
  bvhMeshCount: number;
  emissiveLightCount: number;
  isExporting4K?: boolean;
  onTogglePathTracing: () => void;
  onExport4K: () => void;
  compact?: boolean;
  inlineDock?: boolean;
}

export const PathTracingHudBar: React.FC<PathTracingHudBarProps> = ({
  pathTracingEnabled,
  spp,
  maxSpp = 256,
  bvhMeshCount,
  emissiveLightCount,
  isExporting4K = false,
  onTogglePathTracing,
  onExport4K,
  compact = false,
  inlineDock = false
}) => {
  const pct = Math.min(100, Math.round((spp / Math.max(1, maxSpp)) * 100));
  const converged = pathTracingEnabled && spp >= maxSpp;

  return (
    <div
      data-testid="hybrid-raytracing-hud"
      className={
        inlineDock
          ? 'pointer-events-auto flex items-center gap-1.5 shrink-0'
          : `pointer-events-auto flex items-center gap-2 bg-[#12141a]/[0.82] border rounded-xl px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.5)] ${
              pathTracingEnabled ? 'border-[#00e5ff]/60' : 'border-white/[0.08]'
            }`
      }
    >
      {/* Gear 1 / Gear 2 Mode Toggle [R] with embedded SPP progress when inlineDock */}
      <button
        type="button"
        data-testid="toggle-pathtracing-btn"
        aria-pressed={pathTracingEnabled}
        onClick={(e) => {
          e.currentTarget.blur();
          onTogglePathTracing();
        }}
        className={`relative overflow-hidden px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
          pathTracingEnabled
            ? 'bg-cyan-500/[0.14] border-[#00e5ff]/75 text-cyan-100 font-semibold'
            : 'bg-[#161922]/90 hover:border-white/20 hover:text-white text-slate-200 border-white/[0.08]'
        }`}
        title="切换渐进式蒙特卡洛路径追踪采样检视 (快捷键 R)；默认常驻 60fps 实时 GTAO + SSR 物理材质管线"
      >
        <Aperture className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
        <span className="tabular-nums">
          {inlineDock
            ? pathTracingEnabled
              ? converged
                ? '路径追踪 · 256SPP'
                : `路径追踪 · ${pct}%`
              : '路径追踪 [R]'
            : '路径追踪 [R]'}
        </span>
        {inlineDock && pathTracingEnabled && (
          <span
            data-testid="pathtracing-spp-status"
            style={{
              transform: `scaleX(${Math.max(0.05, spp / Math.max(1, maxSpp))})`,
              transformOrigin: 'left'
            }}
            className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] bg-[#00e5ff] transition-transform duration-75"
          />
        )}
      </button>

      {/* Live Progressive SPP Accumulation Progress Bar (standalone HUD bar mode) */}
      {!inlineDock && pathTracingEnabled ? (
        <div className="flex items-center gap-2 min-w-[120px]" data-testid="pathtracing-spp-status">
          <div className="flex-1 min-w-[86px]">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
              <span className="text-cyan-300 font-semibold">
                SPP {spp}/{maxSpp}
              </span>
              <span className={converged ? 'text-cyan-200 font-bold' : 'text-slate-300'}>
                {converged ? 'DONE' : `${pct}%`}
              </span>
            </div>
            <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-0.5 border border-white/10">
              <div
                style={{ transform: `scaleX(${Math.max(0.03, spp / maxSpp)})`, transformOrigin: 'left' }}
                className="h-full w-full transition-transform duration-75 bg-[#00e5ff]"
              />
            </div>
          </div>
          {!compact && (
            <span className="hidden 2xl:inline text-[10px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
              BLAS:{bvhMeshCount} · EMIT:{emissiveLightCount}
            </span>
          )}
        </div>
      ) : (
        !compact &&
        !inlineDock && (
          <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-mono text-slate-300 whitespace-nowrap px-1">
            <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" strokeWidth={1.5} />
            <span>GTAO + 实时 SSR (BLAS:{bvhMeshCount})</span>
          </div>
        )
      )}

      {/* 4K Render Export Button */}
      {!inlineDock && (
        <button
          type="button"
          data-testid="export-4k-raytraced-btn"
          disabled={isExporting4K}
          onClick={(e) => {
            e.currentTarget.blur();
            onExport4K();
          }}
          className="px-2 py-1 rounded-md bg-[#161922] hover:border-cyan-400/50 border border-white/[0.08] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
          title="以 3840×2160 (4K UHD) 超采样导出当前检视帧 (.png)"
        >
          <Camera className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
          <span>{isExporting4K ? '合成4K...' : '导出 4K'}</span>
        </button>
      )}
    </div>
  );
};
