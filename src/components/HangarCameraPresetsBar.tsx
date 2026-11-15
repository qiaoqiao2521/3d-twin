import React from 'react';
import { Camera, Compass, Unlock } from 'lucide-react';
import { HANGAR_CAMERA_PRESETS, HangarCameraPresetId } from '../utils/ccdIkSolver';
import { DirectorCameraMode, getDirectorModeLabel } from '../utils/signatureShowcaseEngine';

interface HangarCameraPresetsBarProps {
  activePreset: HangarCameraPresetId | null;
  onSelectPreset: (preset: HangarCameraPresetId | null) => void;
  directorCamMode?: DirectorCameraMode;
  onCycleDirectorCam?: () => void;
}

export const HangarCameraPresetsBar: React.FC<HangarCameraPresetsBarProps> = ({
  activePreset,
  onSelectPreset,
  directorCamMode = 'off',
  onCycleDirectorCam
}) => {
  return (
    <div
      data-testid="hangar-camera-presets-bar"
      className="pointer-events-auto flex items-center gap-1 bg-[#12141a]/[0.80] border border-white/[0.08] rounded-xl px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center gap-1 px-1 text-[10px] font-mono text-slate-400 select-none whitespace-nowrap">
        <Camera className="w-3 h-3 text-slate-400 shrink-0" strokeWidth={1.5} />
        <span className="hidden 2xl:inline uppercase">CAM</span>
      </div>

      {HANGAR_CAMERA_PRESETS.map((preset) => {
        const isActive = activePreset === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            data-testid={`cam-preset-${preset.id}`}
            aria-pressed={isActive}
            onClick={() => onSelectPreset(isActive ? null : preset.id)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono border flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'bg-[#161922]/85 hover:border-white/20 text-slate-300 border-white/[0.07]'
            }`}
            title={`切换至 ${preset.shortEn} (${preset.label}) 正交工程视角`}
          >
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] shrink-0" />}
            <span>{preset.shortEn}</span>
          </button>
        );
      })}

      {onCycleDirectorCam && (
        <button
          type="button"
          data-testid="cam-bar-director-btn"
          onClick={onCycleDirectorCam}
          className={`px-2 py-0.5 rounded-md text-[11px] font-mono border flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
            directorCamMode !== 'off'
              ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
              : 'bg-[#161922]/85 hover:border-white/20 text-slate-300 border-white/[0.07]'
          }`}
          title={`${getDirectorModeLabel(directorCamMode)} (切换环绕 / 变焦 / 关节甩镜 / 贴地追焦) [快捷键 K]`}
        >
          <Compass className="w-3 h-3 text-cyan-300 shrink-0" strokeWidth={1.5} />
          <span>
            {directorCamMode === 'off'
              ? '运镜 [K]'
              : getDirectorModeLabel(directorCamMode).replace('运镜: ', '').slice(0, 4)}
          </span>
        </button>
      )}

      {activePreset && (
        <button
          type="button"
          data-testid="cam-preset-free-orbit"
          onClick={() => onSelectPreset(null)}
          className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#161922] hover:border-cyan-400/55 border border-white/[0.12] text-slate-200 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
          title="解除固定视角锁定，恢复鼠标自由轨道旋转 (OrbitControls)"
        >
          <Unlock className="w-3 h-3 text-cyan-300" strokeWidth={1.5} />
          <span>自由轨道</span>
        </button>
      )}
    </div>
  );
};
