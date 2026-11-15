import React, { useState, useRef, useEffect } from 'react';
import { Eye, Sparkles, Cpu, Wind, Video, Check, Magnet, ScanSearch, RotateCcw } from 'lucide-react';
import { WindTunnelDisasterConfig } from '../utils/sciTechEngine';

export interface SciTechHudControlsProps {
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
  // Optional AAA Hangar / Workstation Controls (Hardspace: Shipbreaker + Horizon Focus + Nano-Clean)
  shipbreakerEnabled?: boolean;
  onToggleShipbreaker?: () => void;
  floatingPartsCount?: number;
  onResetGrappledParts?: () => void;
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  weatheringActive?: boolean;
  onCleanWeathering?: () => void;
  compact?: boolean;
}

export const SciTechHudControls: React.FC<SciTechHudControlsProps> = ({
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
  compact = false
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointerDown = (ev: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocPointerDown);
    return () => window.removeEventListener('mousedown', onDocPointerDown);
  }, [menuOpen]);

  const activeDisasterCount =
    (windTunnelConfig.schlierenMode ? 1 : 0) +
    (windTunnelConfig.mach8PlasmaSheath ? 1 : 0) +
    (windTunnelConfig.faradayLightningArcs ? 1 : 0);

  const btnPad = compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';

  return (
    <div
      data-testid="scitech-hud-controls"
      className="pointer-events-auto relative flex flex-wrap items-center justify-center gap-1.5 bg-[#070d19]/95 border border-cyan-500/35 rounded-xl px-2.5 py-1 shadow-2xl"
    >
      {/* AAA System 3: Hardspace: Shipbreaker Engineering Role Color-Coding + Magnetic Grapple Tether */}
      {onToggleShipbreaker && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="toggle-shipbreaker-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleShipbreaker();
            }}
            className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
              shipbreakerEnabled
                ? 'bg-amber-400 text-slate-950 border-amber-200 font-bold shadow'
                : 'bg-slate-900 border-amber-500/45 text-amber-200 hover:border-amber-400'
            }`}
            title="《迷走深空：碎舰师》工程职能涂装 + 弯曲贝塞尔磁力牵引索（开启后可直接按住任意 3D 真机零件弹性拖拽悬停！）"
          >
            <Magnet className="w-3 h-3 shrink-0" />
            <span>碎舰师磁力拆解{shipbreakerEnabled ? ': 开' : ''}</span>
          </button>

          {shipbreakerEnabled && floatingPartsCount > 0 && onResetGrappledParts && (
            <button
              type="button"
              data-testid="reset-shipbreaker-parts-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onResetGrappledParts();
              }}
              className="px-1.5 py-0.5 rounded-lg text-[10px] font-mono border border-sky-400/70 bg-sky-500/20 text-sky-200 hover:bg-sky-500/35 flex items-center gap-0.5 cursor-pointer"
              title="将所有磁力悬停中的零件吸附归位"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>归位({floatingPartsCount})</span>
            </button>
          )}
        </div>
      )}

      {/* AAA System 5: Horizon Focus Weakpoint X-Ray Scan */}
      {onToggleFocusMode && (
        <button
          type="button"
          data-testid="toggle-focus-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleFocusMode();
          }}
          className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
            focusModeEnabled
              ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold shadow'
              : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-400/60'
          }`}
          title="《地平线》Focus 弱点透视扫描：压暗外层 L1 壳体为深邃暗钢轮廓，琥珀金高亮显影内部核电池/燃烧室/雷达高价值弱点！"
        >
          <ScanSearch className="w-3 h-3 shrink-0" />
          <span>Focus 弱点透视</span>
        </button>
      )}

      {/* AAA System 4: Nano Self-Clean Reset */}
      {onCleanWeathering && (
        <button
          type="button"
          data-testid="clean-weathering-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onCleanWeathering();
          }}
          className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
            weatheringActive
              ? 'bg-sky-500/25 border-sky-300 text-sky-100 font-semibold'
              : 'bg-slate-900 border-slate-700 text-sky-200 hover:border-sky-400/60'
          }`}
          title="一键纳米自清洁：清除战损风沙尘土、进气道微晶结霜与高温钛蓝氧化层，恢复出厂镜面金属光泽"
        >
          <Sparkles className="w-3 h-3 text-sky-300 shrink-0" />
          <span>纳米自清洁</span>
        </button>
      )}

      {/* Module 1A: 3D Mag-Lens X-Ray Sphere */}
      <button
        type="button"
        data-testid="toggle-maglens-btn"
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMagLens();
        }}
        className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
          magLensEnabled
            ? 'bg-cyan-400 text-slate-950 border-cyan-200 font-bold shadow'
            : 'bg-slate-900 border-slate-700 text-cyan-200 hover:border-cyan-400/60'
        }`}
        title="光标跟随 3D 磁力 X 光相位透视球：消融外层 L1 护甲为青色线框，显露内部 100% 实体金属转子/电机（滚轮可调球径 R）"
      >
        <Eye className="w-3 h-3 shrink-0" />
        <span>
          磁力透视球{magLensEnabled ? ` R=${magLensRadius.toFixed(2)}m` : ''}
        </span>
      </button>

      {/* Module 1B: Dual-Laser SLS Metal 3D Printing Materialization */}
      <button
        type="button"
        data-testid="trigger-sls-print-btn"
        onClick={(e) => {
          e.currentTarget.blur();
          onTriggerSlsPrint();
        }}
        className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
          slsActive
            ? 'bg-amber-400 text-slate-950 border-amber-200 font-bold shadow'
            : 'bg-slate-900 border-amber-500/40 text-amber-200 hover:border-amber-400'
        }`}
        title="双激光选区烧结创世生成 (1.8s SLS 金属 3D 打印增材制造扫掠)"
      >
        <Sparkles className="w-3 h-3 shrink-0" />
        <span>{slsActive ? 'SLS 光刻烧结中...' : '光刻重构'}</span>
      </button>

      {/* Module 2: Embodied MPC Predictive Rollout Horizon + URDF Power-Flow Arteries */}
      <button
        type="button"
        data-testid="toggle-mpc-btn"
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMpc();
        }}
        className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
          mpcEnabled
            ? 'bg-emerald-400 text-slate-950 border-emerald-200 font-bold shadow'
            : 'bg-slate-900 border-slate-700 text-emerald-200 hover:border-emerald-400/60'
        }`}
        title="具身智能 MPC 11簇二阶动力学滚动预测弧 + 0.8s/1.6s 未来幽灵帧 + URDF 关节功率流动脉 (|τ·ω|)"
      >
        <Cpu className="w-3 h-3 shrink-0" />
        <span>
          MPC 预判场{mpcEnabled && totalPowerWatts > 1 ? ` · ${Math.round(totalPowerWatts)}W` : ''}
        </span>
      </button>

      {/* Module 3: Aerospace Wind-Tunnel Schlieren Optics & Extreme Disaster Chamber */}
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          data-testid="toggle-windtunnel-menu-btn"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.currentTarget.blur();
            setMenuOpen((o) => !o);
          }}
          className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
            activeDisasterCount > 0 || menuOpen
              ? 'bg-violet-500 text-slate-950 border-violet-200 font-bold shadow'
              : 'bg-slate-900 border-slate-700 text-violet-200 hover:border-violet-400/60'
          }`}
          title="极端物理风洞与天象试验舱：光学纹影激波仪 / 马赫 8 再入等离子黑障 / 雷暴法拉第笼表面走电弧"
        >
          <Wind className="w-3 h-3 shrink-0" />
          <span>
            极端物理风洞/天象{activeDisasterCount > 0 ? ` (${activeDisasterCount})` : ''}
          </span>
        </button>

        {menuOpen && (
          <div
            data-testid="windtunnel-popover"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[#070d19] border border-violet-400/60 rounded-xl p-2 shadow-2xl z-40 space-y-1"
          >
            <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-800 text-[10px] font-mono text-violet-300">
              <span>极端多物理场试验舱</span>
              <div className="flex items-center gap-2">
                {activeDisasterCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeWindTunnel({
                        schlierenMode: false,
                        mach8PlasmaSheath: false,
                        faradayLightningArcs: false
                      })
                    }
                    className="text-sky-400 hover:underline cursor-pointer"
                  >
                    全部关闭
                  </button>
                )}
                <button
                  type="button"
                  data-testid="wt-close-popover"
                  onClick={() => setMenuOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  收起
                </button>
              </div>
            </div>

            <button
              type="button"
              data-testid="wt-toggle-schlieren"
              onClick={() =>
                onChangeWindTunnel((prev) => ({
                  ...prev,
                  schlierenMode: !prev.schlierenMode
                }))
              }
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-mono flex items-center justify-between border transition cursor-pointer ${
                windTunnelConfig.schlierenMode
                  ? 'bg-slate-200 text-slate-950 border-white font-bold'
                  : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-600'
              }`}
            >
              <div>
                <div>光学纹影激波仪 (Schlieren)</div>
                <div
                  className={`text-[9px] ${
                    windTunnelConfig.schlierenMode ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  折射率梯度银灰刀口成像 · 弓形激波与卡门涡街
                </div>
              </div>
              {windTunnelConfig.schlierenMode && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <button
              type="button"
              data-testid="wt-toggle-plasma"
              onClick={() =>
                onChangeWindTunnel((prev) => ({
                  ...prev,
                  mach8PlasmaSheath: !prev.mach8PlasmaSheath
                }))
              }
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-mono flex items-center justify-between border transition cursor-pointer ${
                windTunnelConfig.mach8PlasmaSheath
                  ? 'bg-orange-500/30 text-orange-100 border-orange-400 font-bold'
                  : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-600'
              }`}
            >
              <div>
                <div>马赫 8 再入等离子黑障</div>
                <div className="text-[9px] text-slate-400">
                  迎风激波面紫橙电离激波鞘与剥离烧蚀尾迹
                </div>
              </div>
              {windTunnelConfig.mach8PlasmaSheath && (
                <Check className="w-3.5 h-3.5 text-orange-300 shrink-0" />
              )}
            </button>

            <button
              type="button"
              data-testid="wt-toggle-lightning"
              onClick={() =>
                onChangeWindTunnel((prev) => ({
                  ...prev,
                  faradayLightningArcs: !prev.faradayLightningArcs
                }))
              }
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-mono flex items-center justify-between border transition cursor-pointer ${
                windTunnelConfig.faradayLightningArcs
                  ? 'bg-sky-500/30 text-sky-100 border-sky-300 font-bold'
                  : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-600'
              }`}
            >
              <div>
                <div>雷暴法拉第笼表面走电弧</div>
                <div className="text-[9px] text-slate-400">
                  采样真实 .glb 金属蒙皮顶点高压蓝白跳火
                </div>
              </div>
              {windTunnelConfig.faradayLightningArcs && (
                <Check className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Module 4: Millimeter-Scale Micro-FPV Cavity Fly-Through [Key C] */}
      <button
        type="button"
        data-testid="toggle-microfpv-btn"
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMicroFpv();
        }}
        className={`${btnPad} rounded-lg font-mono border flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${
          microFpvActive
            ? 'bg-rose-500 text-slate-950 border-rose-200 font-bold shadow'
            : 'bg-slate-900 border-rose-500/40 text-rose-200 hover:border-rose-400'
        }`}
        title="纳米穿越机内部钻膛一镜到底大片 (near=0.002 微距贴飞穿越风扇叶片/燃烧室/底盘悬架) [快捷键 C]"
      >
        <Video className="w-3 h-3 shrink-0" />
        <span>
          {microFpvActive
            ? `退出钻膛 [C] · ${microFpvSegmentLabel || '微距穿腔中'}`
            : '纳米穿越机钻膛大片 [C]'}
        </span>
      </button>
    </div>
  );
};
