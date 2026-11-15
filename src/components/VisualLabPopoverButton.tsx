import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  SlidersHorizontal,
  Eye,
  Layers,
  Cpu,
  Wind,
  Video,
  Magnet,
  ScanSearch,
  RotateCcw,
  Flame,
  AlertTriangle,
  Camera,
  ChevronUp,
  ChevronDown,
  Sun,
  Shield,
  Radar,
  Sparkles,
  Activity,
  Crosshair,
  Film,
  Volume2,
  VolumeX
} from 'lucide-react';
import { WindTunnelDisasterConfig } from '../utils/sciTechEngine';
import {
  CinemaOpticsConfig,
  STUDIO_LIGHTING_PRESET_LIST,
  StudioLightingPresetId
} from '../utils/cinemaOpticsPipeline';
import { FeaColorMapId, ScientificVizConfig } from '../utils/scientificVizEngine';
import { SciFiVfxConfig } from '../utils/scifiVfxShaders';
import {
  BulletTimeScale,
  CinemaMacroId,
  TactileDirectorConfig
} from '../utils/tactileCameraRig';

export interface VisualLabPopoverProps {
  // Core View Layers
  thermalMode: boolean;
  onToggleThermal: () => void;
  flowSensorMode: boolean;
  onToggleFlowSensor: () => void;
  showSkeleton: boolean;
  onToggleSkeleton: () => void;
  xrayMode: boolean;
  onToggleXray: () => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;

  // Sci-Tech & AAA Physics Lab
  magLensEnabled: boolean;
  magLensRadius: number;
  onToggleMagLens: () => void;
  slsActive: boolean;
  onTriggerSlsPrint: () => void;
  mpcEnabled: boolean;
  totalPowerWatts?: number;
  onToggleMpc: () => void;
  windTunnelConfig: WindTunnelDisasterConfig;
  onChangeWindTunnel: React.Dispatch<React.SetStateAction<WindTunnelDisasterConfig>>;
  microFpvActive: boolean;
  microFpvSegmentLabel?: string;
  onToggleMicroFpv: () => void;

  // Workstation / Hangar Salvage & Focus
  shipbreakerEnabled?: boolean;
  onToggleShipbreaker?: () => void;
  floatingPartsCount?: number;
  onResetGrappledParts?: () => void;
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  weatheringActive?: boolean;
  onCleanWeathering?: () => void;

  // Optional Hangar Fault & 6-DOF IK / Plasma Controls
  faultCount?: number;
  faultInjectMode?: boolean;
  onToggleFaultInject?: () => void;
  onSelfHealFaults?: () => void;
  ikEnabled?: boolean;
  onToggleIk?: () => void;
  plasmaCutting?: boolean;
  onTogglePlasma?: () => void;

  // Optional 4K Ray-Tracing Export & Hybrid Path-Tracing
  isExporting4K?: boolean;
  onExport4K?: () => void;
  pathTracingEnabled?: boolean;
  pathTracingSpp?: number;
  onTogglePathTracing?: () => void;

  // Dimension 1: Cinema Optics & Studio Lighting Presets
  cinemaOptics?: CinemaOpticsConfig;
  onChangeCinemaOptics?: React.Dispatch<React.SetStateAction<CinemaOpticsConfig>>;

  // Dimension 2: Scientific Digital Twin & Computational Physics
  scientificConfig?: ScientificVizConfig;
  onChangeScientificConfig?: React.Dispatch<React.SetStateAction<ScientificVizConfig>>;
  peakStressMpa?: number;
  comStabilityStatus?: 'stable' | 'warning' | 'critical';
  hoverThermalReadout?: { tempC: number; zoneLabel: string; partName: string } | null;

  // Dimension 3: Hard-Surface Sci-Fi & Energy VFX
  scifiConfig?: SciFiVfxConfig;
  onChangeScifiConfig?: React.Dispatch<React.SetStateAction<SciFiVfxConfig>>;
  onTriggerNaniteDemo?: () => void;
  onTriggerTacticalPulse?: () => void;

  // Dimension 4: Tactile Game Feel, Bullet-Time, Camera Macros, Audio & WebM Recording
  tactileConfig?: TactileDirectorConfig;
  onChangeTactileConfig?: React.Dispatch<React.SetStateAction<TactileDirectorConfig>>;
  ikTensionNewtons?: number;
  onTriggerCinemaMacro?: (macroId: CinemaMacroId) => void;
  audioEnabled?: boolean;
  onToggleAudio?: () => void;
  audioVolume?: number;
  onChangeAudioVolume?: (vol01: number) => void;
  isRecordingWebm?: boolean;
  onToggleRecordWebm?: () => void;

  // Notify parent when popover opens/closes so 3D SVG probes auto-fade behind menu
  onOpenChange?: (open: boolean) => void;
}

type SectionKey = '00' | '01' | '02' | '03' | '04';

export const VisualLabPopoverButton: React.FC<VisualLabPopoverProps> = ({
  thermalMode,
  onToggleThermal,
  flowSensorMode,
  onToggleFlowSensor,
  showSkeleton,
  onToggleSkeleton,
  xrayMode,
  onToggleXray,
  autoRotate,
  onToggleAutoRotate,
  magLensEnabled,
  magLensRadius,
  onToggleMagLens,
  slsActive,
  onTriggerSlsPrint,
  mpcEnabled,
  totalPowerWatts = 0,
  onToggleMpc,
  windTunnelConfig,
  onChangeWindTunnel,
  microFpvActive,
  microFpvSegmentLabel,
  onToggleMicroFpv,
  shipbreakerEnabled = false,
  onToggleShipbreaker,
  floatingPartsCount = 0,
  onResetGrappledParts,
  focusModeEnabled = false,
  onToggleFocusMode,
  weatheringActive = false,
  onCleanWeathering,
  faultCount = 0,
  faultInjectMode = false,
  onToggleFaultInject,
  onSelfHealFaults,
  ikEnabled = false,
  onToggleIk,
  plasmaCutting = false,
  onTogglePlasma,
  isExporting4K = false,
  onExport4K,
  pathTracingEnabled = false,
  pathTracingSpp = 0,
  onTogglePathTracing,
  cinemaOptics,
  onChangeCinemaOptics,
  scientificConfig,
  onChangeScientificConfig,
  peakStressMpa = 0,
  comStabilityStatus = 'stable',
  hoverThermalReadout = null,
  scifiConfig,
  onChangeScifiConfig,
  onTriggerNaniteDemo,
  onTriggerTacticalPulse,
  tactileConfig,
  onChangeTactileConfig,
  ikTensionNewtons = 0,
  onTriggerCinemaMacro,
  audioEnabled = false,
  onToggleAudio,
  audioVolume = 0.85,
  onChangeAudioVolume,
  isRecordingWebm = false,
  onToggleRecordWebm,
  onOpenChange
}) => {
  const [open, setOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    '00': true,
    '01': false,
    '02': true,
    '03': false,
    '04': false
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const updateOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const toggleSection = (key: SectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
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

  const activeLabCount =
    (thermalMode ? 1 : 0) +
    (flowSensorMode ? 1 : 0) +
    (showSkeleton ? 1 : 0) +
    (xrayMode ? 1 : 0) +
    (autoRotate ? 1 : 0) +
    (magLensEnabled ? 1 : 0) +
    (mpcEnabled ? 1 : 0) +
    (microFpvActive ? 1 : 0) +
    (shipbreakerEnabled ? 1 : 0) +
    (focusModeEnabled ? 1 : 0) +
    (faultCount > 0 || faultInjectMode ? 1 : 0) +
    (ikEnabled ? 1 : 0) +
    (pathTracingEnabled ? 1 : 0) +
    (cinemaOptics && cinemaOptics.lightingPreset !== 'cold_lab' ? 1 : 0) +
    (cinemaOptics?.smartBokehEnabled ? 1 : 0) +
    (scientificConfig?.feaEnabled ? 1 : 0) +
    (scientificConfig?.comZmpEnabled ? 1 : 0) +
    (scientificConfig?.torqueVectorsEnabled ? 1 : 0) +
    (scientificConfig?.workspaceEnvelopeEnabled ? 1 : 0) +
    (scientificConfig?.lidarPersistEnabled ? 1 : 0) +
    (scifiConfig?.naniteDissolveEnabled ? 1 : 0) +
    (scifiConfig?.hexShieldEnabled ? 1 : 0) +
    (scifiConfig?.overdriveVentingEnabled ? 1 : 0) +
    (tactileConfig?.kineticImpactArmed ? 1 : 0) +
    (tactileConfig && tactileConfig.bulletTimeScale < 0.99 ? 1 : 0) +
    (windTunnelConfig.schlierenMode ? 1 : 0) +
    (windTunnelConfig.mach8PlasmaSheath ? 1 : 0) +
    (windTunnelConfig.faradayLightningArcs ? 1 : 0);

  const itemClass = (active: boolean, warnTone = false) =>
    `px-2 py-1.5 rounded-lg text-[11px] font-mono border flex items-center justify-between gap-1 transition cursor-pointer whitespace-nowrap ${
      active
        ? warnTone
          ? 'bg-amber-500/15 border-amber-400/75 text-amber-100 font-semibold'
          : 'bg-cyan-500/15 border-[#00e5ff]/75 text-cyan-100 font-semibold'
        : 'bg-[#0c1320]/90 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
    }`;

  const dot = (active: boolean, warnTone = false) => (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        active ? (warnTone ? 'bg-amber-400' : 'bg-[#00e5ff]') : 'bg-slate-600'
      }`}
    />
  );

  const sectionHeader = (key: SectionKey, title: string, badgeCount = 0) => {
    const isOpen = expandedSections[key];
    return (
      <button
        type="button"
        onClick={() => toggleSection(key)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between text-[11px] font-medium text-slate-200 hover:text-white py-1 px-0.5 cursor-pointer"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span>{title}</span>
          {badgeCount > 0 && (
            <span className="text-[10px] font-mono tabular-nums text-cyan-300">
              · {badgeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          strokeWidth={1.5}
        />
      </button>
    );
  };

  const allExpanded = Object.values(expandedSections).every(Boolean);

  const panelNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            data-testid="visual-lab-popover-panel"
            className="fixed right-4 bottom-16 w-[308px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7.5rem)] overflow-y-auto bg-[#12141a]/[0.97] border border-white/[0.10] rounded-xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_rgba(0,0,0,0.72)] z-[90] space-y-2 whitespace-normal"
          >
            {/* Top Bar inside Popover */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08]">
              <span className="text-xs font-semibold text-slate-100">光学·科研·视效实验台</span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    const next = !allExpanded;
                    setExpandedSections({
                      '00': next,
                      '01': next,
                      '02': next,
                      '03': next,
                      '04': next
                    });
                  }}
                  className="text-slate-400 hover:text-cyan-300 cursor-pointer"
                >
                  {allExpanded ? '折叠分组' : '展开全部'}
                </button>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => updateOpen(false)}
                  className="text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  收起 [Esc]
                </button>
              </div>
            </div>

            {/* 00. Cinema Optics & Studio Lighting Presets */}
            {cinemaOptics && onChangeCinemaOptics && (
              <div className="space-y-1.5 pb-1.5 border-b border-white/[0.08]">
                {sectionHeader(
                  '00',
                  '00. 电影光学与影棚布光',
                  (cinemaOptics.lightingPreset !== 'cold_lab' ? 1 : 0) +
                    (cinemaOptics.smartBokehEnabled ? 1 : 0) +
                    (pathTracingEnabled ? 1 : 0)
                )}
                {expandedSections['00'] && (
                  <div className="space-y-2 pt-0.5">
                    <div className="grid grid-cols-2 gap-1">
                      {STUDIO_LIGHTING_PRESET_LIST.map((preset) => {
                        const active = cinemaOptics.lightingPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            data-testid={`lighting-preset-${preset.id}`}
                            onClick={() =>
                              onChangeCinemaOptics((p) => ({
                                ...p,
                                lightingPreset: preset.id as StudioLightingPresetId
                              }))
                            }
                            className={itemClass(active, preset.id === 'mars_golden')}
                            title={preset.subtitle}
                          >
                            <span className="flex items-center gap-1 truncate">
                              <Sun className="w-3 h-3 text-cyan-300 shrink-0" strokeWidth={1.5} />
                              <span className="truncate">{preset.shortLabel}</span>
                            </span>
                            {dot(active, preset.id === 'mars_golden')}
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-1.5 bg-[#0c111b] border border-white/[0.06] rounded-lg p-2">
                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                          <span>变形宽银幕拉丝耀斑</span>
                          <span className="text-cyan-300">
                            {Math.round(cinemaOptics.anamorphicStreak * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="变形宽银幕拉丝耀斑"
                          min={0}
                          max={1}
                          step={0.02}
                          value={cinemaOptics.anamorphicStreak}
                          onChange={(e) =>
                            onChangeCinemaOptics((p) => ({
                              ...p,
                              anamorphicStreak: parseFloat(e.target.value)
                            }))
                          }
                          className="w-full h-1 accent-[#00e5ff] cursor-pointer"
                        />
                      </label>

                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                          <span>ACES 物理曝光补偿 EV</span>
                          <span className="text-cyan-300">
                            {cinemaOptics.exposureEv >= 0 ? '+' : ''}
                            {cinemaOptics.exposureEv.toFixed(2)} EV
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="ACES 物理曝光补偿 EV"
                          min={-1.5}
                          max={1.5}
                          step={0.05}
                          value={cinemaOptics.exposureEv}
                          onChange={(e) =>
                            onChangeCinemaOptics((p) => ({
                              ...p,
                              exposureEv: parseFloat(e.target.value)
                            }))
                          }
                          className="w-full h-1 accent-[#00e5ff] cursor-pointer"
                        />
                      </label>

                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                          <span>高光泛光阈值 Threshold</span>
                          <span className="text-slate-300">
                            {cinemaOptics.bloomThreshold.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="高光泛光阈值"
                          min={0.72}
                          max={0.95}
                          step={0.01}
                          value={cinemaOptics.bloomThreshold}
                          onChange={(e) =>
                            onChangeCinemaOptics((p) => ({
                              ...p,
                              bloomThreshold: parseFloat(e.target.value)
                            }))
                          }
                          className="w-full h-1 accent-[#00e5ff] cursor-pointer"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        data-testid="toggle-smart-bokeh-btn"
                        onClick={() =>
                          onChangeCinemaOptics((p) => ({
                            ...p,
                            smartBokehEnabled: !p.smartBokehEnabled
                          }))
                        }
                        className={itemClass(cinemaOptics.smartBokehEnabled)}
                      >
                        <span className="truncate">智能焦点微距景深</span>
                        {dot(cinemaOptics.smartBokehEnabled)}
                      </button>

                      <button
                        type="button"
                        data-testid="toggle-chromatic-vignette-btn"
                        onClick={() =>
                          onChangeCinemaOptics((p) => ({
                            ...p,
                            chromaticVignette: !p.chromaticVignette,
                            filmGrain: p.chromaticVignette ? 0.0 : 0.055
                          }))
                        }
                        className={itemClass(cinemaOptics.chromaticVignette)}
                      >
                        <span className="truncate">暗角色散与胶片颗粒</span>
                        {dot(cinemaOptics.chromaticVignette)}
                      </button>

                      {onTogglePathTracing && (
                        <button
                          type="button"
                          data-testid="popover-toggle-pathtracing-btn"
                          onClick={onTogglePathTracing}
                          className={`col-span-2 ${itemClass(pathTracingEnabled)}`}
                        >
                          <span className="truncate">
                            混合路径追踪累积 [R]
                            {pathTracingEnabled && pathTracingSpp > 0
                              ? ` · ${pathTracingSpp} SPP`
                              : ''}
                          </span>
                          {dot(pathTracingEnabled)}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 01. Engineering Viewport Inspection Layers */}
            <div className="space-y-1.5 pb-1.5 border-b border-white/[0.08]">
              {sectionHeader(
                '01',
                '01. 工程视觉与透视层',
                (thermalMode ? 1 : 0) +
                  (flowSensorMode ? 1 : 0) +
                  (showSkeleton ? 1 : 0) +
                  (xrayMode ? 1 : 0) +
                  (autoRotate ? 1 : 0) +
                  (magLensEnabled ? 1 : 0)
              )}
              {expandedSections['01'] && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      data-testid="toggle-flir-thermal-btn"
                      onClick={onToggleThermal}
                      className={itemClass(thermalMode, true)}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Flame className="w-3 h-3 text-amber-300 shrink-0" />
                        <span>FLIR 红外热成像</span>
                      </span>
                      {dot(thermalMode, true)}
                    </button>

                    <button
                      type="button"
                      data-testid="toggle-flow-wake-btn"
                      onClick={onToggleFlowSensor}
                      className={itemClass(flowSensorMode)}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Wind className="w-3 h-3 text-cyan-300 shrink-0" />
                        <span>卡门涡街/感知域</span>
                      </span>
                      {dot(flowSensorMode)}
                    </button>

                    <button
                      type="button"
                      onClick={onToggleSkeleton}
                      className={itemClass(showSkeleton)}
                    >
                      <span className="truncate">L0 运动学骨架</span>
                      {dot(showSkeleton)}
                    </button>

                    <button type="button" onClick={onToggleXray} className={itemClass(xrayMode)}>
                      <span className="truncate">X-Ray 线框透视</span>
                      {dot(xrayMode)}
                    </button>

                    <button
                      type="button"
                      onClick={onToggleAutoRotate}
                      className={itemClass(autoRotate)}
                    >
                      <span className="truncate">360° 环绕巡检</span>
                      {dot(autoRotate)}
                    </button>

                    <button
                      type="button"
                      data-testid="toggle-maglens-btn"
                      onClick={onToggleMagLens}
                      className={itemClass(magLensEnabled)}
                      title="光标球形相位透视镜（滚轮调节半径）"
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Eye className="w-3 h-3 text-cyan-300 shrink-0" />
                        <span className="truncate">
                          磁力透视球{magLensEnabled ? ` ${magLensRadius.toFixed(2)}m` : ''}
                        </span>
                      </span>
                      {dot(magLensEnabled)}
                    </button>
                  </div>

                  {/* Calibrated FLIR Inline Legend & Live Hover °C Readout (Zero Main-Viewport Clutter!) */}
                  {thermalMode && (
                    <div className="bg-[#0c111b] border border-amber-400/25 rounded-lg p-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                        <span className="text-amber-200">FLIR 多温区标定色标</span>
                        <span className="text-amber-300 font-semibold">
                          {hoverThermalReadout
                            ? `${hoverThermalReadout.tempC.toFixed(1)} °C`
                            : '悬停部件测温'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-blue-600 via-purple-500 via-amber-400 to-yellow-100" />
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 tabular-nums">
                        <span>22°C 蒙皮</span>
                        <span>48°C 算力舱</span>
                        <span>88°C+ 绕组/热源</span>
                      </div>
                      {hoverThermalReadout && (
                        <div className="text-[10px] font-mono text-slate-300 truncate">
                          {hoverThermalReadout.zoneLabel} · {hoverThermalReadout.partName}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 02. Scientific Digital Twin & Computational Physics */}
            <div className="space-y-1.5 pb-1.5 border-b border-white/[0.08]">
              {sectionHeader(
                '02',
                '02. 科研数字孪生与计算物理',
                (scientificConfig?.feaEnabled ? 1 : 0) +
                  (scientificConfig?.comZmpEnabled ? 1 : 0) +
                  (scientificConfig?.torqueVectorsEnabled ? 1 : 0) +
                  (scientificConfig?.workspaceEnvelopeEnabled ? 1 : 0) +
                  (scientificConfig?.lidarPersistEnabled ? 1 : 0) +
                  (mpcEnabled ? 1 : 0)
              )}
              {expandedSections['02'] && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-2 gap-1">
                    {scientificConfig && onChangeScientificConfig && (
                      <>
                        <button
                          type="button"
                          data-testid="toggle-fea-stress-btn"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              feaEnabled: !p.feaEnabled
                            }))
                          }
                          className={itemClass(scientificConfig.feaEnabled, true)}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Activity className="w-3 h-3 text-amber-300 shrink-0" />
                            <span className="truncate">FEA 等效应力云图</span>
                          </span>
                          {dot(scientificConfig.feaEnabled, true)}
                        </button>

                        <button
                          type="button"
                          data-testid="toggle-com-zmp-btn"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              comZmpEnabled: !p.comZmpEnabled
                            }))
                          }
                          className={itemClass(scientificConfig.comZmpEnabled)}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Crosshair className="w-3 h-3 text-cyan-300 shrink-0" />
                            <span className="truncate">质心与支撑多边形</span>
                          </span>
                          {dot(scientificConfig.comZmpEnabled)}
                        </button>

                        <button
                          type="button"
                          data-testid="toggle-torque-vectors-btn"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              torqueVectorsEnabled: !p.torqueVectorsEnabled
                            }))
                          }
                          className={itemClass(scientificConfig.torqueVectorsEnabled)}
                        >
                          <span className="truncate">关节力矩旋转矢量</span>
                          {dot(scientificConfig.torqueVectorsEnabled)}
                        </button>

                        <button
                          type="button"
                          data-testid="toggle-workspace-envelope-btn"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              workspaceEnvelopeEnabled: !p.workspaceEnvelopeEnabled
                            }))
                          }
                          className={itemClass(scientificConfig.workspaceEnvelopeEnabled)}
                        >
                          <span className="truncate">可达工作空间包络</span>
                          {dot(scientificConfig.workspaceEnvelopeEnabled)}
                        </button>

                        <button
                          type="button"
                          data-testid="toggle-lidar-persist-btn"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              lidarPersistEnabled: !p.lidarPersistEnabled
                            }))
                          }
                          className={itemClass(scientificConfig.lidarPersistEnabled)}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Radar className="w-3 h-3 text-cyan-300 shrink-0" />
                            <span className="truncate">LiDAR 持续点云测绘</span>
                          </span>
                          {dot(scientificConfig.lidarPersistEnabled)}
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      data-testid="toggle-mpc-btn"
                      onClick={onToggleMpc}
                      className={itemClass(mpcEnabled)}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Cpu className="w-3 h-3 text-cyan-300 shrink-0" />
                        <span className="truncate">
                          MPC 功率流
                          {mpcEnabled && totalPowerWatts > 1 ? ` ${Math.round(totalPowerWatts)}W` : ''}
                        </span>
                      </span>
                      {dot(mpcEnabled)}
                    </button>
                  </div>

                  {/* FEA Von Mises Inline Colorbar, Colormap Selector & Peak MPa */}
                  {scientificConfig?.feaEnabled && onChangeScientificConfig && (
                    <div className="bg-[#0c111b] border border-cyan-400/25 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                        <span className="text-slate-300">Von Mises 峰值应力</span>
                        <span className="text-amber-300 font-semibold">
                          {peakStressMpa > 0 ? `${peakStressMpa} MPa` : '142 MPa'}
                        </span>
                      </div>
                      <div
                        className={`h-1.5 rounded-full ${
                          scientificConfig.feaColorMap === 'viridis'
                            ? 'bg-gradient-to-r from-[#440154] via-[#21918c] to-[#fde725]'
                            : scientificConfig.feaColorMap === 'jet'
                            ? 'bg-gradient-to-r from-blue-600 via-emerald-400 via-yellow-300 to-red-600'
                            : 'bg-gradient-to-r from-[#30123b] via-[#1ae4b6] via-[#faba39] to-[#7a0403]'
                        }`}
                      />
                      <div className="flex items-center justify-between gap-1 pt-0.5">
                        <div className="flex items-center gap-1">
                          {(['turbo', 'viridis', 'jet'] as FeaColorMapId[]).map((cm) => (
                            <button
                              key={cm}
                              type="button"
                              onClick={() =>
                                onChangeScientificConfig((p) => ({ ...p, feaColorMap: cm }))
                              }
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border cursor-pointer ${
                                scientificConfig.feaColorMap === cm
                                  ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                                  : 'border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {cm}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeScientificConfig((p) => ({
                              ...p,
                              feaContourLines: !p.feaContourLines
                            }))
                          }
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                            scientificConfig.feaContourLines
                              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                              : 'border-white/10 text-slate-400'
                          }`}
                        >
                          等高线
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CoM / ZMP Stability Inline Status */}
                  {scientificConfig?.comZmpEnabled && (
                    <div className="flex items-center justify-between text-[10px] font-mono bg-[#0c111b] border border-white/[0.06] rounded-lg px-2 py-1">
                      <span className="text-slate-400">ZMP 零力矩点包络裕度</span>
                      <span
                        className={
                          comStabilityStatus === 'critical'
                            ? 'text-rose-400 font-semibold'
                            : comStabilityStatus === 'warning'
                            ? 'text-amber-300 font-semibold'
                            : 'text-emerald-300 font-semibold'
                        }
                      >
                        {comStabilityStatus === 'critical'
                          ? '倾覆临界预警'
                          : comStabilityStatus === 'warning'
                          ? '支撑边缘动态调整'
                          : '支撑多边形内稳定'}
                      </span>
                    </div>
                  )}

                  {/* LiDAR Persistence Decay Slider */}
                  {scientificConfig?.lidarPersistEnabled && onChangeScientificConfig && (
                    <label className="block bg-[#0c111b] border border-white/[0.06] rounded-lg px-2 py-1.5 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                        <span>点云驻留衰减时长</span>
                        <span className="text-cyan-300">
                          {scientificConfig.lidarDecaySec.toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="点云驻留衰减时长"
                        min={1.5}
                        max={10.0}
                        step={0.5}
                        value={scientificConfig.lidarDecaySec}
                        onChange={(e) =>
                          onChangeScientificConfig((p) => ({
                            ...p,
                            lidarDecaySec: parseFloat(e.target.value)
                          }))
                        }
                        className="w-full h-1 accent-[#00e5ff] cursor-pointer"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 03. Sci-Fi Hard-Surface & Energy VFX */}
            <div
              className="space-y-1.5 pb-1.5 border-b border-white/[0.08]"
              data-testid="windtunnel-popover"
            >
              {sectionHeader(
                '03',
                '03. 顶级科幻与能量视效',
                (slsActive ? 1 : 0) +
                  (scifiConfig?.naniteDissolveEnabled ? 1 : 0) +
                  (scifiConfig?.hexShieldEnabled ? 1 : 0) +
                  (scifiConfig?.overdriveVentingEnabled ? 1 : 0) +
                  (windTunnelConfig.schlierenMode ? 1 : 0) +
                  (windTunnelConfig.mach8PlasmaSheath ? 1 : 0) +
                  (windTunnelConfig.faradayLightningArcs ? 1 : 0)
              )}
              {expandedSections['03'] && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-2 gap-1">
                    {onTriggerNaniteDemo && (
                      <button
                        type="button"
                        data-testid="trigger-nanite-demo-btn"
                        onClick={onTriggerNaniteDemo}
                        className={itemClass(Boolean(scifiConfig?.naniteDissolveEnabled))}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Sparkles className="w-3 h-3 text-cyan-300 shrink-0" />
                          <span className="truncate">纳米解构与重组</span>
                        </span>
                        {dot(Boolean(scifiConfig?.naniteDissolveEnabled))}
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="trigger-sls-print-btn"
                      onClick={onTriggerSlsPrint}
                      className={itemClass(slsActive)}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Layers className="w-3 h-3 text-cyan-300 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">
                          {slsActive ? 'SLS 烧结中...' : 'SLS 双激光重构'}
                        </span>
                      </span>
                      {dot(slsActive)}
                    </button>

                    {scifiConfig && onChangeScifiConfig && (
                      <>
                        <button
                          type="button"
                          data-testid="toggle-hex-shield-btn"
                          onClick={() =>
                            onChangeScifiConfig((p) => ({
                              ...p,
                              hexShieldEnabled: !p.hexShieldEnabled
                            }))
                          }
                          className={itemClass(scifiConfig.hexShieldEnabled)}
                          title="开启后点击真机任意部位触发三维射线涟漪"
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Shield className="w-3 h-3 text-cyan-300 shrink-0" />
                            <span className="truncate">六角相控能量护盾</span>
                          </span>
                          {dot(scifiConfig.hexShieldEnabled)}
                        </button>

                        <button
                          type="button"
                          data-testid="toggle-overdrive-vent-btn"
                          onClick={() =>
                            onChangeScifiConfig((p) => ({
                              ...p,
                              overdriveVentingEnabled: !p.overdriveVentingEnabled
                            }))
                          }
                          className={itemClass(scifiConfig.overdriveVentingEnabled, true)}
                        >
                          <span className="truncate">超频泄压冷气喷流</span>
                          {dot(scifiConfig.overdriveVentingEnabled, true)}
                        </button>
                      </>
                    )}

                    {onTriggerTacticalPulse && (
                      <button
                        type="button"
                        data-testid="trigger-tactical-pulse-btn"
                        onClick={onTriggerTacticalPulse}
                        className={itemClass(false)}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Radar className="w-3 h-3 text-cyan-300 shrink-0" />
                          <span className="truncate">战术地形脉冲波 [T]</span>
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="wt-toggle-schlieren"
                      onClick={() =>
                        onChangeWindTunnel((p) => ({ ...p, schlierenMode: !p.schlierenMode }))
                      }
                      className={itemClass(windTunnelConfig.schlierenMode)}
                    >
                      <span className="truncate">光学纹影激波仪</span>
                      {dot(windTunnelConfig.schlierenMode)}
                    </button>

                    <button
                      type="button"
                      data-testid="wt-toggle-plasma"
                      onClick={() =>
                        onChangeWindTunnel((p) => ({
                          ...p,
                          mach8PlasmaSheath: !p.mach8PlasmaSheath
                        }))
                      }
                      className={itemClass(windTunnelConfig.mach8PlasmaSheath, true)}
                    >
                      <span className="truncate">马赫8 等离子鞘</span>
                      {dot(windTunnelConfig.mach8PlasmaSheath, true)}
                    </button>

                    <button
                      type="button"
                      data-testid="wt-toggle-lightning"
                      onClick={() =>
                        onChangeWindTunnel((p) => ({
                          ...p,
                          faradayLightningArcs: !p.faradayLightningArcs
                        }))
                      }
                      className={itemClass(windTunnelConfig.faradayLightningArcs)}
                    >
                      <span className="truncate">法拉第笼走电弧</span>
                      {dot(windTunnelConfig.faradayLightningArcs)}
                    </button>
                  </div>

                  {scifiConfig && onChangeScifiConfig && (
                    <div className="bg-[#0c111b] border border-white/[0.06] rounded-lg p-2 space-y-1.5">
                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                          <span>手动纳米解构截面</span>
                          <span className="text-cyan-300">
                            {Math.round(scifiConfig.naniteProgress * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="手动纳米解构截面"
                          min={0}
                          max={1}
                          step={0.02}
                          value={scifiConfig.naniteProgress}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onChangeScifiConfig((p) => ({
                              ...p,
                              naniteDissolveEnabled: val > 0.01,
                              naniteProgress: val
                            }));
                          }}
                          className="w-full h-1 accent-[#00e5ff] cursor-pointer"
                        />
                      </label>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>切换真机自动 0.65s 重构</span>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeScifiConfig((p) => ({
                              ...p,
                              autoSpawnMaterialize: !p.autoSpawnMaterialize
                            }))
                          }
                          className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                            scifiConfig.autoSpawnMaterialize
                              ? 'border-cyan-400/70 text-cyan-200 bg-cyan-500/15'
                              : 'border-white/10 text-slate-400'
                          }`}
                        >
                          {scifiConfig.autoSpawnMaterialize ? '已启用' : '已关闭'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 04. Tactile Game Feel, Physics Impulse & Director Tools */}
            <div className="space-y-1.5">
              {sectionHeader(
                '04',
                '04. 顶级交互与导演工具',
                (tactileConfig?.kineticImpactArmed ? 1 : 0) +
                  (ikEnabled ? 1 : 0) +
                  (shipbreakerEnabled ? 1 : 0) +
                  (focusModeEnabled ? 1 : 0) +
                  (microFpvActive ? 1 : 0) +
                  (faultCount > 0 || faultInjectMode ? 1 : 0) +
                  (tactileConfig && tactileConfig.bulletTimeScale < 0.99 ? 1 : 0)
              )}
              {expandedSections['04'] && (
                <div className="space-y-1.5 pt-0.5">
                  {/* Kinetic Impact Test Launcher */}
                  {tactileConfig && onChangeTactileConfig && (
                    <div className="bg-[#0c111b] border border-white/[0.06] rounded-lg p-2 space-y-1.5">
                      <button
                        type="button"
                        data-testid="toggle-kinetic-impact-btn"
                        onClick={() =>
                          onChangeTactileConfig((p) => ({
                            ...p,
                            kineticImpactArmed: !p.kineticImpactArmed
                          }))
                        }
                        className={`w-full ${itemClass(tactileConfig.kineticImpactArmed, true)}`}
                      >
                        <span className="truncate">
                          {tactileConfig.kineticImpactArmed
                            ? '动能冲击弹已挂载（点击真机发射）'
                            : '挂载抗扰动动能冲击弹测试'}
                        </span>
                        {dot(tactileConfig.kineticImpactArmed, true)}
                      </button>

                      {tactileConfig.kineticImpactArmed && (
                        <label className="block space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                            <span>侧向冲量幅值</span>
                            <span className="text-amber-300">
                              {Math.round(tactileConfig.kineticImpulseNs)} N·s
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label="侧向冲量幅值"
                            min={80}
                            max={400}
                            step={10}
                            value={tactileConfig.kineticImpulseNs}
                            onChange={(e) =>
                              onChangeTactileConfig((p) => ({
                                ...p,
                                kineticImpulseNs: parseFloat(e.target.value)
                              }))
                            }
                            className="w-full h-1 accent-amber-400 cursor-pointer"
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1">
                    {onToggleIk && (
                      <button
                        type="button"
                        data-testid="hangar-ik-toggle-btn"
                        onClick={onToggleIk}
                        className={itemClass(ikEnabled)}
                      >
                        <span className="truncate">
                          6-DOF 弹簧 IK
                          {ikEnabled && ikTensionNewtons > 0 ? ` ${ikTensionNewtons}N` : ''}
                        </span>
                        {dot(ikEnabled)}
                      </button>
                    )}

                    {ikEnabled && onTogglePlasma && (
                      <button
                        type="button"
                        data-testid="hangar-plasma-toggle-btn"
                        onClick={onTogglePlasma}
                        className={itemClass(plasmaCutting)}
                      >
                        <span className="truncate">末端等离子电弧</span>
                        {dot(plasmaCutting)}
                      </button>
                    )}

                    {onToggleShipbreaker && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid="toggle-shipbreaker-btn"
                          onClick={onToggleShipbreaker}
                          className={`flex-1 ${itemClass(shipbreakerEnabled)}`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <Magnet className="w-3 h-3 text-cyan-300 shrink-0" />
                            <span className="truncate">磁力拆解</span>
                          </span>
                          {dot(shipbreakerEnabled)}
                        </button>
                        {shipbreakerEnabled && floatingPartsCount > 0 && onResetGrappledParts && (
                          <button
                            type="button"
                            data-testid="reset-shipbreaker-parts-btn"
                            onClick={onResetGrappledParts}
                            className="px-1.5 py-1.5 rounded-lg text-[10px] font-mono border border-white/15 bg-[#0c1320] text-cyan-300 hover:border-cyan-400/60 cursor-pointer shrink-0"
                          >
                            归位({floatingPartsCount})
                          </button>
                        )}
                      </div>
                    )}

                    {onToggleFocusMode && (
                      <button
                        type="button"
                        data-testid="toggle-focus-btn"
                        onClick={onToggleFocusMode}
                        className={itemClass(focusModeEnabled)}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <ScanSearch className="w-3 h-3 text-cyan-300 shrink-0" />
                          <span className="truncate">核心弱点透视</span>
                        </span>
                        {dot(focusModeEnabled)}
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="toggle-microfpv-btn"
                      onClick={onToggleMicroFpv}
                      className={itemClass(microFpvActive)}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <Video className="w-3 h-3 text-cyan-300 shrink-0" />
                        <span className="truncate">
                          {microFpvActive
                            ? `退出钻膛 · ${microFpvSegmentLabel || '穿腔'}`
                            : '微距钻膛 [C]'}
                        </span>
                      </span>
                      {dot(microFpvActive)}
                    </button>

                    {onCleanWeathering && (
                      <button
                        type="button"
                        data-testid="clean-weathering-btn"
                        onClick={onCleanWeathering}
                        className={itemClass(weatheringActive)}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <RotateCcw className="w-3 h-3 text-cyan-300 shrink-0" />
                          <span className="truncate">纳米自清洁</span>
                        </span>
                        {dot(weatheringActive)}
                      </button>
                    )}

                    {onToggleFaultInject && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid="hangar-fault-inject-btn"
                          onClick={onToggleFaultInject}
                          className={`flex-1 ${itemClass(faultCount > 0 || faultInjectMode, true)}`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="truncate">
                              故障注入{faultCount > 0 ? `(${faultCount})` : ''}
                            </span>
                          </span>
                          {dot(faultCount > 0 || faultInjectMode, true)}
                        </button>
                        {faultCount > 0 && onSelfHealFaults && (
                          <button
                            type="button"
                            data-testid="hangar-self-heal-btn"
                            onClick={onSelfHealFaults}
                            className="px-1.5 py-1.5 rounded-lg text-[10px] font-mono border border-cyan-400/60 bg-cyan-500/15 text-cyan-200 cursor-pointer shrink-0"
                          >
                            自愈
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bullet-Time Scale & 6s Cinema Camera Macros */}
                  {tactileConfig && onChangeTactileConfig && (
                    <div className="bg-[#0c111b] border border-white/[0.06] rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>子弹时间升格倍率</span>
                        <div className="flex items-center gap-1">
                          {([1, 0.25, 0.05] as BulletTimeScale[]).map((scale) => (
                            <button
                              key={scale}
                              type="button"
                              data-testid={`bullettime-${scale}`}
                              onClick={() =>
                                onChangeTactileConfig((p) => ({ ...p, bulletTimeScale: scale }))
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums border cursor-pointer ${
                                tactileConfig.bulletTimeScale === scale
                                  ? 'border-cyan-400/75 bg-cyan-500/20 text-cyan-100 font-semibold'
                                  : 'border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {scale}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {onTriggerCinemaMacro && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-slate-400">
                            6 秒一键电影导演宏镜头
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'hero_orbit_push', label: '环绕推进' },
                                { id: 'low_angle_titan', label: '贴地仰拍' },
                                { id: 'top_down_disassembly', label: '俯冲拆解' }
                              ] as { id: CinemaMacroId; label: string }[]
                            ).map((m) => {
                              const active = tactileConfig.activeMacro === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  data-testid={`cinema-macro-${m.id}`}
                                  onClick={() =>
                                    onTriggerCinemaMacro(active ? 'off' : m.id)
                                  }
                                  className={`py-1 px-1.5 rounded text-[10px] font-mono border truncate cursor-pointer ${
                                    active
                                      ? 'border-cyan-400/75 bg-cyan-500/20 text-cyan-100 font-semibold'
                                      : 'border-white/10 bg-[#121622] text-slate-300 hover:text-white'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audio Foley Volume + 4K PNG + WebM HD Video Capture */}
                  {onToggleAudio && onChangeAudioVolume && (
                    <div className="bg-[#0c111b] border border-white/[0.06] rounded-lg px-2 py-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onToggleAudio}
                        className="text-slate-300 hover:text-cyan-300 cursor-pointer shrink-0"
                        title={audioEnabled ? '静音物理拟音' : '开启物理拟音'}
                      >
                        {audioEnabled ? (
                          <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </button>
                      <input
                        type="range"
                        aria-label="主拟音音量"
                        min={0}
                        max={1}
                        step={0.05}
                        value={audioVolume}
                        onChange={(e) => onChangeAudioVolume(parseFloat(e.target.value))}
                        className="flex-1 h-1 accent-[#00e5ff] cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-slate-400 tabular-nums w-8 text-right">
                        {Math.round(audioVolume * 100)}%
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1">
                    {onExport4K && (
                      <button
                        type="button"
                        data-testid="export-4k-raytraced-btn"
                        disabled={isExporting4K}
                        onClick={onExport4K}
                        className={itemClass(false)}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Camera className="w-3 h-3 text-cyan-300 shrink-0" />
                          <span className="truncate">
                            {isExporting4K ? '合成 4K...' : '导出 4K 帧'}
                          </span>
                        </span>
                      </button>
                    )}

                    {onToggleRecordWebm && (
                      <button
                        type="button"
                        data-testid="record-webm-btn"
                        onClick={onToggleRecordWebm}
                        className={itemClass(isRecordingWebm, true)}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Film className="w-3 h-3 text-amber-300 shrink-0" />
                          <span className="truncate">
                            {isRecordingWebm ? '停止并保存 WebM' : '录制 WebM 短片'}
                          </span>
                        </span>
                        {dot(isRecordingWebm, true)}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid="scitech-hud-controls">
      <button
        type="button"
        data-testid="visual-lab-popover-btn"
        aria-expanded={open}
        onClick={(e) => {
          e.currentTarget.blur();
          updateOpen(!open);
        }}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
          open || activeLabCount > 0
            ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
            : 'bg-[#161922]/90 border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
        }`}
        title="展开电影光学、科研孪生、硬核视效与导演交互控制面板"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
        <span>实验设置</span>
        {activeLabCount > 0 && (
          <span className="text-[10px] font-mono text-cyan-300 tabular-nums">
            ({activeLabCount})
          </span>
        )}
        <ChevronUp
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>
      {panelNode}
    </div>
  );
};
