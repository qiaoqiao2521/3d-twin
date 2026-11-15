import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Film, Play, Pause, ChevronRight, X } from 'lucide-react';

interface DissectionControlsPopoverProps {
  explosionInputId: string;
  clipInputId: string;
  explosion: number;
  onChangeExplosion: (next: number) => void;
  autoDisassembly: boolean;
  onToggleAutoDisassembly: () => void;
  autoDisassemblyBtnTestId?: string;
  clipRatio: number;
  onChangeClipRatio: (next: number) => void;
  autoSectionScan: boolean;
  onToggleAutoSectionScan: () => void;
  onOpenChange?: (open: boolean) => void;
}

export const DissectionControlsPopover: React.FC<DissectionControlsPopoverProps> = ({
  explosionInputId,
  clipInputId,
  explosion,
  onChangeExplosion,
  autoDisassembly,
  onToggleAutoDisassembly,
  autoDisassemblyBtnTestId,
  clipRatio,
  onChangeClipRatio,
  autoSectionScan,
  onToggleAutoSectionScan,
  onOpenChange
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const updateOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') {
        updateOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isDissectActive =
    explosion > 0.01 || autoDisassembly || clipRatio < 0.985 || autoSectionScan;

  const summaryBadge =
    explosion > 0.01 || autoDisassembly
      ? `${Math.round(explosion * 100)}%`
      : clipRatio < 0.985 || autoSectionScan
        ? '剖切'
        : null;

  return (
    <div ref={rootRef} className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        data-testid="dissection-controls-popover-btn"
        aria-expanded={open}
        onClick={(e) => {
          e.currentTarget.blur();
          updateOpen(!open);
        }}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
          open || isDissectActive
            ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
            : 'bg-[#161922]/90 border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
        }`}
        title="正交爆炸拆解与光学激光剖切控制（水平内联展开，零遮挡）"
      >
        <Sliders className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
        <span>拆解剖切</span>
        {summaryBadge && !open && (
          <span className="text-[10px] font-mono tabular-nums text-cyan-300">{summaryBadge}</span>
        )}
        <ChevronRight
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          data-testid="dissection-controls-popover-panel"
          className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-[#161922] border border-[#00e5ff]/40 shrink-0 whitespace-nowrap"
        >
          {/* 1. Inline Orthogonal Explosion */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={explosionInputId} className="text-[11px] text-slate-300 font-medium">
              爆炸
            </label>
            <input
              id={explosionInputId}
              aria-label="正交爆炸拆解"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explosion}
              onChange={(e) => onChangeExplosion(parseFloat(e.target.value))}
              className="w-20 accent-[#00e5ff] h-1.5 cursor-pointer"
            />
            <span className="w-8 text-right font-mono tabular-nums text-cyan-300 text-[11px]">
              {Math.round(explosion * 100)}%
            </span>
            <button
              type="button"
              data-testid={autoDisassemblyBtnTestId}
              onClick={onToggleAutoDisassembly}
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono border flex items-center gap-1 transition cursor-pointer shrink-0 ${
                autoDisassembly
                  ? 'bg-cyan-500/[0.18] border-[#00e5ff]/75 text-cyan-100 font-semibold'
                  : 'bg-[#0e1117] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white'
              }`}
            >
              <Film className="w-3 h-3 text-cyan-300" strokeWidth={1.5} />
              <span>{autoDisassembly ? '停止' : '演示'}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-white/[0.10]" />

          {/* 2. Inline Optical Laser Section Cut */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={clipInputId} className="text-[11px] text-slate-300 font-medium">
              剖切
            </label>
            <input
              id={clipInputId}
              aria-label="光学剖切面"
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={clipRatio}
              onChange={(e) => onChangeClipRatio(parseFloat(e.target.value))}
              className="w-20 accent-[#00e5ff] h-1.5 cursor-pointer"
            />
            <span className="w-8 text-right font-mono tabular-nums text-cyan-300 text-[11px]">
              {Math.round(clipRatio * 100)}%
            </span>
            <button
              type="button"
              onClick={onToggleAutoSectionScan}
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono border flex items-center gap-1 transition cursor-pointer shrink-0 ${
                autoSectionScan
                  ? 'bg-cyan-500/[0.18] border-[#00e5ff]/75 text-cyan-100 font-semibold'
                  : 'bg-[#0e1117] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white'
              }`}
            >
              {autoSectionScan ? (
                <Pause className="w-3 h-3 text-cyan-300" strokeWidth={1.5} />
              ) : (
                <Play className="w-3 h-3 text-cyan-300" strokeWidth={1.5} />
              )}
              <span>{autoSectionScan ? '停止' : '扫描'}</span>
            </button>
          </div>

          <button
            type="button"
            aria-label="收起拆解剖切控制"
            onClick={() => updateOpen(false)}
            className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
};
