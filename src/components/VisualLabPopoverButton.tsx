import React, { useState, useRef, useEffect } from 'react';
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
  ChevronUp
} from 'lucide-react';
import { WindTunnelDisasterConfig } from '../utils/sciTechEngine';

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

  // Optional 4K Ray-Tracing Export
  isExporting4K?: boolean;
  onExport4K?: () => void;

  // Notify parent when popover opens/closes so 3D SVG probes auto-fade behind menu
  onOpenChange?: (open: boolean) => void;
}

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

  const activeLabCount =
    (thermalMode ? 1 : 0) +
    (xrayMode ? 1 : 0) +
    (autoRotate ? 1 : 0) +
    (magLensEnabled ? 1 : 0) +
    (mpcEnabled ? 1 : 0) +
    (microFpvActive ? 1 : 0) +
    (shipbreakerEnabled ? 1 : 0) +
    (focusModeEnabled ? 1 : 0) +
    (faultCount > 0 || faultInjectMode ? 1 : 0) +
    (ikEnabled ? 1 : 0) +
    (windTunnelConfig.schlierenMode ? 1 : 0) +
    (windTunnelConfig.mach8PlasmaSheath ? 1 : 0) +
    (windTunnelConfig.faradayLightningArcs ? 1 : 0);

  const itemClass = (active: boolean, warnTone = false) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-mono border flex items-center justify-between gap-1.5 transition cursor-pointer whitespace-nowrap ${
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
        title="展开视觉透视层、具身物理实验与风洞控制面板"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
        <span>实验设置</span>
        {activeLabCount > 0 && (
          <span className="text-[10px] font-mono text-cyan-300 tabular-nums">({activeLabCount})</span>
        )}
        <ChevronUp
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          data-testid="visual-lab-popover-panel"
          className="fixed right-4 bottom-16 w-[356px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7.5rem)] overflow-y-auto bg-[#12141a]/[0.97] border border-white/[0.10] rounded-xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_rgba(0,0,0,0.68)] z-50 space-y-2.5 whitespace-normal"
        >
          {/* Section 1: Viewport Inspection Layers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-0.5">
              <span>01. 工程视觉与透视层</span>
              <button
                type="button"
                onClick={() => updateOpen(false)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                收起 [Esc]
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleThermal}
                className={itemClass(thermalMode, true)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Flame className="w-3 h-3 text-amber-300 shrink-0" />
                  <span>热力/应力场</span>
                </span>
                {dot(thermalMode, true)}
              </button>

              <button
                type="button"
                onClick={onToggleFlowSensor}
                className={itemClass(flowSensorMode)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Wind className="w-3 h-3 text-cyan-300 shrink-0" />
                  <span>流场/感知域</span>
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
                  <span>磁力透视球{magLensEnabled ? ` ${magLensRadius.toFixed(2)}m` : ''}</span>
                </span>
                {dot(magLensEnabled)}
              </button>
            </div>
          </div>

          {/* Section 2: Sci-Tech & Salvage Physics */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400 px-0.5">
              02. 具身控制、增材重构与微距检视
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="trigger-sls-print-btn"
                onClick={onTriggerSlsPrint}
                className={itemClass(slsActive)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Layers className="w-3 h-3 text-cyan-300 shrink-0" strokeWidth={1.5} />
                  <span>{slsActive ? 'SLS 双激光烧结中...' : '双激光 SLS 光刻重构'}</span>
                </span>
                {dot(slsActive)}
              </button>

              <button
                type="button"
                data-testid="toggle-mpc-btn"
                onClick={onToggleMpc}
                className={itemClass(mpcEnabled)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Cpu className="w-3 h-3 text-cyan-300 shrink-0" />
                  <span>
                    MPC 预判与功率流
                    {mpcEnabled && totalPowerWatts > 1 ? ` ${Math.round(totalPowerWatts)}W` : ''}
                  </span>
                </span>
                {dot(mpcEnabled)}
              </button>

              {onToggleShipbreaker && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="toggle-shipbreaker-btn"
                    onClick={onToggleShipbreaker}
                    className={`flex-1 ${itemClass(shipbreakerEnabled)}`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Magnet className="w-3 h-3 text-cyan-300 shrink-0" />
                      <span>碎舰师磁力拆解</span>
                    </span>
                    {dot(shipbreakerEnabled)}
                  </button>
                  {shipbreakerEnabled && floatingPartsCount > 0 && onResetGrappledParts && (
                    <button
                      type="button"
                      data-testid="reset-shipbreaker-parts-btn"
                      onClick={onResetGrappledParts}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-mono border border-white/15 bg-[#0c1320] text-cyan-300 hover:border-cyan-400/60 cursor-pointer shrink-0"
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
                  <span className="flex items-center gap-1.5 truncate">
                    <ScanSearch className="w-3 h-3 text-cyan-300 shrink-0" />
                    <span>Focus 核心弱点透视</span>
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
                <span className="flex items-center gap-1.5 truncate">
                  <Video className="w-3 h-3 text-cyan-300 shrink-0" />
                  <span>
                    {microFpvActive
                      ? `退出微距钻膛 [C] · ${microFpvSegmentLabel || '穿腔'}`
                      : '微距钻膛航线 [C]'}
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
                  <span className="flex items-center gap-1.5 truncate">
                    <RotateCcw className="w-3 h-3 text-cyan-300 shrink-0" />
                    <span>纳米表面自清洁</span>
                  </span>
                  {dot(weatheringActive)}
                </button>
              )}

              {onToggleIk && (
                <button
                  type="button"
                  data-testid="hangar-ik-toggle-btn"
                  onClick={onToggleIk}
                  className={itemClass(ikEnabled)}
                >
                  <span className="truncate">6-DOF 空间 IK 牵引</span>
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
                  <span className="truncate">末端等离子电弧切割</span>
                  {dot(plasmaCutting)}
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
                    <span className="flex items-center gap-1.5 truncate">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>故障容错注入{faultCount > 0 ? ` (${faultCount})` : ''}</span>
                    </span>
                    {dot(faultCount > 0 || faultInjectMode, true)}
                  </button>
                  {faultCount > 0 && onSelfHealFaults && (
                    <button
                      type="button"
                      data-testid="hangar-self-heal-btn"
                      onClick={onSelfHealFaults}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-mono border border-cyan-400/60 bg-cyan-500/15 text-cyan-200 cursor-pointer shrink-0"
                    >
                      自愈
                    </button>
                  )}
                </div>
              )}

              {onExport4K && (
                <button
                  type="button"
                  data-testid="export-4k-raytraced-btn"
                  disabled={isExporting4K}
                  onClick={onExport4K}
                  className={itemClass(false)}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Camera className="w-3 h-3 text-cyan-300 shrink-0" />
                    <span>{isExporting4K ? '正在合成 4K...' : '导出 4K 超采样帧'}</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Section 3: Wind-Tunnel Schlieren & Extreme Physics */}
          <div className="pt-2 border-t border-white/10 space-y-1.5" data-testid="windtunnel-popover">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-0.5">
              <span>03. 光学纹影风洞与极端物理场</span>
              {(windTunnelConfig.schlierenMode ||
                windTunnelConfig.mach8PlasmaSheath ||
                windTunnelConfig.faradayLightningArcs) && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeWindTunnel({
                      schlierenMode: false,
                      mach8PlasmaSheath: false,
                      faradayLightningArcs: false
                    })
                  }
                  className="text-cyan-400 hover:underline cursor-pointer"
                >
                  全部重置
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
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
                  onChangeWindTunnel((p) => ({ ...p, mach8PlasmaSheath: !p.mach8PlasmaSheath }))
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
          </div>
        </div>
      )}
    </div>
  );
};
