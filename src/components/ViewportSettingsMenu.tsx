import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Camera,
  Video,
  Crosshair,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  X
} from 'lucide-react';
import { HANGAR_CAMERA_PRESETS, HangarCameraPresetId } from '../utils/ccdIkSolver';
import { DirectorCameraMode, getDirectorModeLabel } from '../utils/signatureShowcaseEngine';

interface ViewportSettingsMenuProps {
  activePreset: HangarCameraPresetId | null;
  onSelectPreset: (preset: HangarCameraPresetId | null) => void;
  directorCamMode: DirectorCameraMode;
  onCycleDirectorCam: () => void;
  showProbes: boolean;
  onToggleProbes: () => void;
  audioSynthEnabled: boolean;
  onToggleAudioSynth?: () => void;
  zenMode: boolean;
  onToggleZenMode?: () => void;
  isExporting4K?: boolean;
  onExport4K?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export const ViewportSettingsMenu: React.FC<ViewportSettingsMenuProps> = ({
  activePreset,
  onSelectPreset,
  directorCamMode,
  onCycleDirectorCam,
  showProbes,
  onToggleProbes,
  audioSynthEnabled,
  onToggleAudioSynth,
  zenMode,
  onToggleZenMode,
  isExporting4K = false,
  onExport4K,
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
    const onPointerDown = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        updateOpen(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') {
        updateOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeBadgeCount =
    (activePreset ? 1 : 0) +
    (directorCamMode !== 'off' ? 1 : 0) +
    (showProbes ? 1 : 0) +
    (audioSynthEnabled ? 1 : 0);

  const toggleRowClass = (active: boolean) =>
    `w-full px-2.5 py-1.5 rounded-lg text-xs border flex items-center justify-between gap-2 transition cursor-pointer ${
      active
        ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-medium'
        : 'bg-[#161922]/90 border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white'
    }`;

  return (
    <div ref={rootRef} className="relative pointer-events-auto">
      <button
        type="button"
        data-testid="viewport-settings-btn"
        aria-label="打开视口与镜头设置"
        aria-expanded={open}
        onClick={(e) => {
          e.currentTarget.blur();
          updateOpen(!open);
        }}
        className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.45)] transition cursor-pointer whitespace-nowrap ${
          open || activeBadgeCount > 0
            ? 'bg-[#12141a]/[0.90] border-[#00e5ff]/65 text-cyan-100'
            : 'bg-[#12141a]/[0.82] border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
        }`}
        title="视角预设、3D 遥测探针、物理声效与全屏设置"
      >
        <Settings className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
        <span>设置</span>
        {activeBadgeCount > 0 && (
          <span className="text-[10px] font-mono tabular-nums text-cyan-300">
            ({activeBadgeCount})
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="viewport-settings-panel"
          className="absolute top-full right-0 mt-2 w-72 bg-[#12141a]/[0.96] border border-white/[0.10] rounded-xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_rgba(0,0,0,0.65)] z-50 space-y-3"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
            <span className="text-xs font-semibold text-slate-100">视口与镜头设置</span>
            <button
              type="button"
              aria-label="关闭视口设置"
              onClick={() => updateOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* 1. Engineering Camera Presets & Director Camera */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                <span>工程机位预设</span>
              </span>
              {activePreset && (
                <button
                  type="button"
                  onClick={() => onSelectPreset(null)}
                  className="text-[11px] text-cyan-300 hover:underline cursor-pointer"
                >
                  解锁自由视角
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {HANGAR_CAMERA_PRESETS.map((p) => {
                const active = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`cam-preset-${p.id}`}
                    onClick={() => onSelectPreset(active ? null : p.id)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-mono border transition cursor-pointer truncate ${
                      active
                        ? 'bg-cyan-500/[0.16] border-[#00e5ff]/75 text-cyan-100 font-semibold'
                        : 'bg-[#161922]/90 border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white'
                    }`}
                    title={p.label}
                  >
                    {p.shortEn}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="director-cam-cycle-btn"
              onClick={onCycleDirectorCam}
              className={toggleRowClass(directorCamMode !== 'off')}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Video className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                <span>
                  {directorCamMode === 'off'
                    ? '电影导演运镜 [K]'
                    : `运镜: ${getDirectorModeLabel(directorCamMode)}`}
                </span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {directorCamMode === 'off' ? '关' : '运行中'}
              </span>
            </button>
          </div>

          {/* 2. Viewport Overlays, Audio & Export */}
          <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
            <div className="text-[11px] text-slate-400">界面叠加与声效</div>

            <button
              type="button"
              data-testid="settings-toggle-probes-btn"
              onClick={onToggleProbes}
              className={toggleRowClass(showProbes)}
            >
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                <span>3D 空间遥测探针</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {showProbes ? '开启' : '关闭'}
              </span>
            </button>

            {onToggleAudioSynth && (
              <button
                type="button"
                data-testid="header-audio-synth-btn"
                onClick={onToggleAudioSynth}
                className={toggleRowClass(audioSynthEnabled)}
              >
                <span className="flex items-center gap-1.5">
                  {audioSynthEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                  )}
                  <span>程序化物理声效</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {audioSynthEnabled ? '开启' : '静音'}
                </span>
              </button>
            )}

            {onToggleZenMode && (
              <button
                type="button"
                data-testid="header-zen-mode-btn"
                onClick={() => {
                  onToggleZenMode();
                  updateOpen(false);
                }}
                className={toggleRowClass(zenMode)}
              >
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-300 shrink-0" strokeWidth={1.5} />
                  <span>纯净全屏检视 [H]</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">切换</span>
              </button>
            )}

            {onExport4K && (
              <button
                type="button"
                disabled={isExporting4K}
                onClick={onExport4K}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs border bg-[#161922]/90 border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                  <span>{isExporting4K ? '正在渲染 4K...' : '导出 4K 离线帧'}</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">PNG</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
