import React, { useMemo } from 'react';
import { TelemetryProbeReadout, computeCalloutLeaderGeometry } from '../utils/liveTwinEngine';

export interface ProjectedTelemetryItem {
  probe: TelemetryProbeReadout;
  partName: string;
  screenX: number;
  screenY: number;
  visible: boolean;
}

interface SpatialTelemetryOverlayProps {
  items: ProjectedTelemetryItem[];
  viewportWidth: number;
  viewportHeight: number;
  visible: boolean;
  dimmed?: boolean;
  sideHudInsetPx?: number;
}

export const SpatialTelemetryOverlay: React.FC<SpatialTelemetryOverlayProps> = ({
  items,
  viewportWidth,
  viewportHeight,
  visible,
  dimmed = false,
  sideHudInsetPx = 316
}) => {
  const slottedItems = useMemo(() => {
    const active = items.filter((it) => it.visible);
    if (active.length === 0) return [];

    // Sort horizontally so left-side 3D anchors dock on the left corridor edge and right-side anchors dock on the right corridor edge,
    // then sort each pair top-to-bottom so leader lines never cross or collide.
    const byX = [...active].sort((a, b) => a.screenX - b.screenX);
    const half = Math.ceil(byX.length / 2);
    const leftSide = byX.slice(0, half).sort((a, b) => a.screenY - b.screenY);
    const rightSide = byX.slice(half).sort((a, b) => a.screenY - b.screenY);

    const assigned: { item: ProjectedTelemetryItem; slotIndex: number }[] = [];
    leftSide.forEach((item, i) => assigned.push({ item, slotIndex: i === 0 ? 0 : 1 }));
    rightSide.forEach((item, i) => assigned.push({ item, slotIndex: i === 0 ? 2 : 3 }));
    return assigned;
  }, [items]);

  if (!visible || slottedItems.length === 0 || viewportWidth < 100 || viewportHeight < 100) {
    return null;
  }

  const effectiveInset = viewportWidth >= 1120 ? sideHudInsetPx : 12;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden z-10 transition-opacity duration-150 ${
        dimmed ? 'opacity-10' : 'opacity-100'
      }`}
      data-testid="spatial-telemetry-overlay"
      aria-hidden="true"
    >
      <svg className="w-full h-full" width={viewportWidth} height={viewportHeight}>
        {slottedItems.map(({ item, slotIndex }) => {
          const geom = computeCalloutLeaderGeometry(
            item.screenX,
            item.screenY,
            viewportWidth,
            viewportHeight,
            slotIndex,
            effectiveInset
          );
          const strokeColor =
            item.probe.status === 'ELEVATED'
              ? '#f59e0b'
              : item.probe.status === 'ACTIVE'
                ? '#38bdf8'
                : '#10b981';

          return (
            <g key={item.probe.id}>
              {/* High-contrast dark halo + colored 3D anchor reticle */}
              <circle
                cx={geom.x0}
                cy={geom.y0}
                r={5.5}
                fill="rgba(12, 15, 22, 0.90)"
                stroke={strokeColor}
                strokeWidth={1.35}
              />
              <circle cx={geom.x0} cy={geom.y0} r={2.0} fill={strokeColor} />
              {/* Dark backing stroke so leader line stays crisp over bright white/metallic meshes */}
              <polyline
                points={`${geom.x0},${geom.y0} ${geom.xElbow},${geom.yElbow} ${geom.xEnd},${geom.yEnd}`}
                fill="none"
                stroke="rgba(8, 11, 16, 0.82)"
                strokeWidth={2.8}
              />
              {/* 45-degree Industrial Elbow Leader Line */}
              <polyline
                points={`${geom.x0},${geom.y0} ${geom.xElbow},${geom.yElbow} ${geom.xEnd},${geom.yEnd}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.15}
                strokeOpacity={0.88}
              />
              <circle cx={geom.xEnd} cy={geom.yEnd} r={2.0} fill={strokeColor} />
            </g>
          );
        })}
      </svg>

      {/* Non-overlapping Central-Corridor CAD Sensor Nameplates */}
      {slottedItems.map(({ item, slotIndex }) => {
        const geom = computeCalloutLeaderGeometry(
          item.screenX,
          item.screenY,
          viewportWidth,
          viewportHeight,
          slotIndex,
          effectiveInset
        );
        const cardWidth = 176;
        const rawLeft = geom.alignRight ? geom.xEnd + 6 : geom.xEnd - cardWidth - 6;
        const minLeft = Math.max(12, effectiveInset);
        const maxLeft = Math.max(minLeft, viewportWidth - effectiveInset - cardWidth - 8);
        const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));
        const clampedTop = Math.max(76, Math.min(viewportHeight - 118, geom.yEnd - 26));

        const statusBorder =
          item.probe.status === 'ELEVATED'
            ? 'border-amber-400/45'
            : item.probe.status === 'ACTIVE'
              ? 'border-[#00e5ff]/35'
              : 'border-white/[0.10]';

        const statusTextCol =
          item.probe.status === 'ELEVATED'
            ? 'text-amber-300'
            : item.probe.status === 'ACTIVE'
              ? 'text-sky-300'
              : 'text-emerald-300';

        return (
          <div
            key={`${item.probe.id}_card`}
            style={{ transform: `translate3d(${Math.round(clampedLeft)}px, ${Math.round(clampedTop)}px, 0)` }}
            className={`absolute top-0 left-0 w-[176px] bg-[#12141a]/[0.88] border ${statusBorder} rounded-lg px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_28px_rgba(0,0,0,0.55)]`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-medium text-slate-200 truncate">{item.probe.label}</span>
              <span className="text-[9px] font-mono text-slate-500 truncate max-w-[54px]">{item.partName}</span>
            </div>
            <div className={`text-xs font-mono font-semibold tabular-nums tracking-tight mt-0.5 ${statusTextCol}`}>
              {item.probe.primaryValue}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
              {item.probe.secondaryValue}
            </div>
          </div>
        );
      })}
    </div>
  );
};
