import React from 'react';

export interface HoveredPartCalloutInfo {
  partName: string;
  index: number;
  layer: 'L1' | 'L2' | 'L3';
  tris: number;
  screenX: number;
  screenY: number;
  worldMm: [number, number, number];
  telemetryBadge?: string;
}

interface HoveredPartCalloutOverlayProps {
  callout: HoveredPartCalloutInfo | null;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Minimalist CAD 3D Spatial Anchor + 45-degree Bent Polyline Leader + Dark Glass HUD Tag
 * Rendered when hovering a mechanical sub-part in the Scene Graph or 3D Viewport.
 */
export const HoveredPartCalloutOverlay: React.FC<HoveredPartCalloutOverlayProps> = ({
  callout,
  viewportWidth,
  viewportHeight
}) => {
  if (!callout || viewportWidth < 120 || viewportHeight < 120) return null;

  const ax = Math.max(40, Math.min(viewportWidth - 40, callout.screenX));
  const ay = Math.max(56, Math.min(viewportHeight - 56, callout.screenY));

  // Route leader polyline away from the right-side Scene Graph HUD when anchor is on the right half
  const placeLeft = ax > viewportWidth * 0.54;
  const placeBelow = ay < 128;

  const diagDx = placeLeft ? -34 : 34;
  const diagDy = placeBelow ? 26 : -26;
  const shelfDx = placeLeft ? -54 : 54;

  const elbowX = ax + diagDx;
  const elbowY = ay + diagDy;
  const endX = elbowX + shelfDx;
  const endY = elbowY;

  const cardWidth = 228;
  const rawCardLeft = placeLeft ? endX - cardWidth - 6 : endX + 6;
  const cardLeft = Math.max(316, Math.min(viewportWidth - 324 - cardWidth, rawCardLeft));
  const cardTop = Math.max(56, Math.min(viewportHeight - 92, endY - 20));

  const formatMm = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;

  return (
    <div
      data-testid="hovered-part-3d-callout"
      className="pointer-events-none absolute inset-0 z-25 overflow-hidden"
    >
      <svg className="w-full h-full block" aria-hidden="true">
        {/* Precision 3D Spatial Anchor Reticle */}
        <circle
          cx={ax}
          cy={ay}
          r={6.5}
          fill="rgba(0, 229, 255, 0.08)"
          stroke="#00e5ff"
          strokeWidth={1.2}
        />
        <circle cx={ax} cy={ay} r={2.2} fill="#00e5ff" />

        {/* 45-Degree Bent CAD Leader Polyline */}
        <polyline
          points={`${ax},${ay} ${elbowX},${elbowY} ${endX},${endY}`}
          fill="none"
          stroke="#00e5ff"
          strokeWidth={1.25}
          strokeOpacity={0.9}
        />
        <circle cx={endX} cy={endY} r={1.8} fill="#00e5ff" />
      </svg>

      {/* Minimalist Floating Dark-Glass CAD Callout Tag */}
      <div
        style={{ transform: `translate3d(${Math.round(cardLeft)}px, ${Math.round(cardTop)}px, 0)` }}
        className="absolute top-0 left-0 w-[228px] rounded-lg bg-[#12141a]/[0.88] border border-cyan-400/45 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_28px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono tabular-nums">
          <span className="text-cyan-300 font-semibold shrink-0">
            #{String(callout.index + 1).padStart(2, '0')} · {callout.layer}
          </span>
          <span className="text-slate-400 shrink-0">
            {callout.tris.toLocaleString()} TRIS
          </span>
        </div>
        <div className="text-[11px] font-mono font-semibold text-slate-100 truncate mt-0.5">
          {callout.partName}
        </div>
        {callout.telemetryBadge && (
          <div className="text-[10px] font-mono tabular-nums text-amber-300 mt-0.5 truncate">
            {callout.telemetryBadge}
          </div>
        )}
        <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5 truncate border-t border-white/[0.06] pt-0.5">
          POS [{formatMm(callout.worldMm[0])}, {formatMm(callout.worldMm[1])}, {formatMm(callout.worldMm[2])}] mm
        </div>
      </div>
    </div>
  );
};
