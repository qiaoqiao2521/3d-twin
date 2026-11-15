import React from 'react';
import { PartBlueprintMetadata } from '../utils/cadDisassemblyEngine';
import { Search, ArrowUpRight, EyeOff, RotateCcw, X, Layers } from 'lucide-react';

export interface BlueprintAxisScreenLabels {
  xScreen: [number, number] | null;
  yScreen: [number, number] | null;
  zScreen: [number, number] | null;
}

interface PartBlueprintCapsuleProps {
  metadata: PartBlueprintMetadata | null;
  anchorScreen: [number, number] | null;
  viewportWidth: number;
  viewportHeight: number;
  isIsolated: boolean;
  isPeeled: boolean;
  peeledCount: number;
  hiddenCount: number;
  axisLabels?: BlueprintAxisScreenLabels;
  onToggleIsolate: () => void;
  onTogglePeel: () => void;
  onHidePart: () => void;
  onResetAllParts: () => void;
  onCloseSelection: () => void;
}

export const PartBlueprintCapsule: React.FC<PartBlueprintCapsuleProps> = ({
  metadata,
  anchorScreen,
  viewportWidth,
  viewportHeight,
  isIsolated,
  isPeeled,
  peeledCount,
  hiddenCount,
  axisLabels,
  onToggleIsolate,
  onTogglePeel,
  onHidePart,
  onResetAllParts,
  onCloseSelection
}) => {
  const hasAnyModifiedParts = isIsolated || peeledCount > 0 || hiddenCount > 0;

  // Strictly dock Single-Part Precision Capsule in the left safe zone (x=16px, below top-left compact bar)
  // so it NEVER collides with the right-side 实验设置 (VisualLabPopoverButton) drawer or bottom dock!
  const capsuleLeft = 16;
  const capsuleTop = isIsolated ? 92 : 68;

  return (
    <>
      {/* 3D Caliper Axis Floating Dimension Callouts when Isolate Blueprint is Active */}
      {isIsolated && metadata && axisLabels && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20" aria-hidden="true">
          {axisLabels.xScreen && (
            <div
              style={{
                transform: `translate3d(${Math.round(axisLabels.xScreen[0] - 42)}px, ${Math.round(axisLabels.xScreen[1] - 11)}px, 0)`
              }}
              className="absolute top-0 left-0 px-1.5 py-0.5 rounded bg-slate-950/95 border border-amber-400/80 text-[10px] font-mono font-bold tabular-nums text-amber-300 shadow-lg"
            >
              L {metadata.dimensionsMm[0]} mm
            </div>
          )}
          {axisLabels.yScreen && (
            <div
              style={{
                transform: `translate3d(${Math.round(axisLabels.yScreen[0] + 6)}px, ${Math.round(axisLabels.yScreen[1] - 11)}px, 0)`
              }}
              className="absolute top-0 left-0 px-1.5 py-0.5 rounded bg-slate-950/95 border border-sky-400/80 text-[10px] font-mono font-bold tabular-nums text-sky-300 shadow-lg"
            >
              H {metadata.dimensionsMm[1]} mm
            </div>
          )}
          {axisLabels.zScreen && (
            <div
              style={{
                transform: `translate3d(${Math.round(axisLabels.zScreen[0] - 42)}px, ${Math.round(axisLabels.zScreen[1] + 4)}px, 0)`
              }}
              className="absolute top-0 left-0 px-1.5 py-0.5 rounded bg-slate-950/95 border border-emerald-400/80 text-[10px] font-mono font-bold tabular-nums text-emerald-300 shadow-lg"
            >
              W {metadata.dimensionsMm[2]} mm
            </div>
          )}
        </div>
      )}

      {/* Global [↺ 全部零件一键归位] Quick Strip when any parts are peeled, hidden, or isolated */}
      {hasAnyModifiedParts && (
        <div
          data-testid="reset-all-parts-strip"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-950/95 border border-amber-400/60 rounded-xl px-3 py-1 shadow-2xl"
        >
          <span className="text-[11px] font-mono text-amber-200">
            {isIsolated ? '独立蓝图台模式' : `已抽离 ${peeledCount} 件 · 已隐藏 ${hiddenCount} 件`}
          </span>
          <button
            onClick={onResetAllParts}
            className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>全部零件一键归位</span>
          </button>
        </div>
      )}

      {/* Surgical Single-Part Precision Capsule (`单件精密操作胶囊` — Left Safe Zone Dock) */}
      {metadata && (
        <div
          data-testid="part-blueprint-capsule"
          style={{
            transform: `translate3d(${capsuleLeft}px, ${capsuleTop}px, 0)`
          }}
          className="absolute top-0 left-0 z-30 w-[336px] bg-slate-950/95 border border-sky-400/65 rounded-xl p-2.5 shadow-2xl space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-sky-300">
                <Layers className="w-3 h-3 shrink-0" />
                <span className="truncate">{metadata.subAssemblyLabel}</span>
                <span className="px-1 rounded bg-sky-500/20 text-sky-200">{metadata.layer}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-100 truncate mt-0.5" title={metadata.partName}>
                {metadata.partName}
              </div>
            </div>
            <button
              onClick={onCloseSelection}
              aria-label="关闭单件操作胶囊"
              className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3 Surgical Part Action Buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={onToggleIsolate}
              className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold border flex items-center justify-center gap-1 transition cursor-pointer ${
                isIsolated
                  ? 'bg-sky-500 text-slate-950 border-sky-300 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-sky-200 border-sky-500/40'
              }`}
            >
              <Search className="w-3 h-3 shrink-0" />
              <span>{isIsolated ? '退出蓝图' : '独立蓝图检视'}</span>
            </button>

            <button
              onClick={onTogglePeel}
              className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold border flex items-center justify-center gap-1 transition cursor-pointer ${
                isPeeled
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-200 border-amber-500/40'
              }`}
            >
              <ArrowUpRight className="w-3 h-3 shrink-0" />
              <span>{isPeeled ? '收回抽离' : '轴向抽离剥开'}</span>
            </button>

            <button
              onClick={onHidePart}
              className="py-1.5 px-1.5 rounded-lg text-[10px] font-semibold border bg-slate-900 hover:bg-rose-950/60 text-rose-200 border-rose-500/40 flex items-center justify-center gap-1 transition cursor-pointer"
            >
              <EyeOff className="w-3 h-3 shrink-0" />
              <span>隐藏外甲</span>
            </button>
          </div>

          {/* Detailed CAD Engineering Blueprint Specification Sheet */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 border-t border-slate-800 text-[10px] font-mono tabular-nums">
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-slate-400">CAD 包围盒尺寸</span>
              <span className="text-amber-300 font-bold">
                {metadata.dimensionsMm[0]} × {metadata.dimensionsMm[2]} × {metadata.dimensionsMm[1]} mm
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">真实面数</span>
              <span className="text-sky-300 font-semibold">{metadata.tris.toLocaleString()} Tris</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">网格顶点</span>
              <span className="text-slate-200">{metadata.vertices.toLocaleString()} Verts</span>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <span className="text-slate-400 shrink-0">URDF 连杆</span>
              <span className="text-emerald-300 truncate">{metadata.urdfLinkName}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <span className="text-slate-400 shrink-0">运动轴 / 约束</span>
              <span className="text-slate-200 truncate">
                {metadata.urdfJointType} · Axis {metadata.urdfAxisText}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
