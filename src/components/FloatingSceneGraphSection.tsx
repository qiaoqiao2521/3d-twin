import React from 'react';
import { Box, ChevronDown, Crosshair, Eye, EyeOff, RotateCcw, X } from 'lucide-react';

export interface SceneGraphNodeItem {
  name: string;
  tris: number;
  layer: 'L1' | 'L2' | 'L3';
}

interface FloatingSceneGraphSectionProps {
  nodes: SceneGraphNodeItem[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose?: () => void;
  selectedPart: string | null;
  hoveredPart: string | null;
  viewportHoveredPart: string | null;
  activeDrillLevel: 'L0' | 'L1' | 'L2' | 'L3';
  hiddenParts: Record<string, boolean>;
  onSelectPart: (partName: string | null) => void;
  onFocusPart: (partName: string) => void;
  onToggleHidePart: (partName: string) => void;
  onShowAllHidden?: () => void;
  onHoverPart: (partName: string | null) => void;
  rowTestIdPrefix?: string;
}

export const FloatingSceneGraphSection: React.FC<FloatingSceneGraphSectionProps> = ({
  nodes,
  isOpen,
  onToggleOpen,
  onClose,
  selectedPart,
  hoveredPart,
  viewportHoveredPart,
  activeDrillLevel,
  hiddenParts,
  onSelectPart,
  onFocusPart,
  onToggleHidePart,
  onShowAllHidden,
  onHoverPart,
  rowTestIdPrefix
}) => {
  const hiddenCount = Object.keys(hiddenParts).filter((k) => hiddenParts[k]).length;

  return (
    <div className={`flex flex-col min-h-0 flex-1 ${onClose ? '' : 'border-t border-white/[0.06]'}`}>
      {/* CAD Scene Graph Header */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
        {onClose ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <Box className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-slate-100 truncate">部件图层树</span>
            <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
              ({nodes.length})
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            className="flex items-center gap-1.5 text-left min-w-0 cursor-pointer group"
          >
            <Box className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-medium text-slate-200 truncate">部件图层树</span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
              ({nodes.length})
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${
                isOpen ? 'rotate-0' : '-rotate-90'
              }`}
              strokeWidth={1.5}
            />
          </button>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {hiddenCount > 0 && onShowAllHidden && (
            <button
              type="button"
              onClick={onShowAllHidden}
              className="px-1.5 py-0.5 rounded border border-amber-400/40 bg-amber-500/10 text-[10px] font-mono tabular-nums text-amber-200 hover:border-amber-300 transition cursor-pointer flex items-center gap-1"
              title="恢复全部已隐藏部件可见性"
            >
              <RotateCcw className="w-2.5 h-2.5" strokeWidth={1.5} />
              <span>显隐({hiddenCount})</span>
            </button>
          )}
          {selectedPart && (
            <button
              type="button"
              onClick={() => onSelectPart(null)}
              className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 border border-white/[0.08] hover:border-cyan-400/50 rounded px-1.5 py-0.5 transition cursor-pointer"
            >
              清除选中
            </button>
          )}
          {onClose && (
            <button
              type="button"
              aria-label="关闭部件列表"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Bidirectional CAD Scene Graph List */}
      {isOpen && (
        <div
          data-testid="scene-graph-list"
          onMouseLeave={() => onHoverPart(null)}
          className="flex-1 min-h-[140px] overflow-y-auto px-2 pb-2 space-y-0.5"
        >
          {nodes.map((node, idx) => {
            const isSelected = selectedPart === node.name;
            const isRowHovered = hoveredPart === node.name || viewportHoveredPart === node.name;
            const isHidden = Boolean(hiddenParts[node.name]);
            const isLayerDimmed =
              activeDrillLevel !== 'L0' && node.layer !== activeDrillLevel && !isSelected && !isRowHovered;

            const layerBarColor =
              node.layer === 'L1'
                ? 'bg-sky-400'
                : node.layer === 'L2'
                  ? 'bg-slate-400'
                  : 'bg-amber-400';

            const layerTextColor =
              node.layer === 'L1'
                ? 'text-sky-300'
                : node.layer === 'L2'
                  ? 'text-slate-300'
                  : 'text-amber-300';

            return (
              <div
                key={`${node.name}_${idx}`}
                onMouseEnter={() => onHoverPart(node.name)}
                className={`group relative flex items-center justify-between gap-1.5 pl-2 pr-1.5 py-1 rounded-md border transition ${
                  isSelected
                    ? 'bg-cyan-500/[0.14] border-[#00e5ff]/65 text-cyan-50'
                    : isRowHovered
                      ? 'bg-white/[0.07] border-cyan-400/45 text-white'
                      : isHidden
                        ? 'bg-transparent border-transparent opacity-40 text-slate-500'
                        : isLayerDimmed
                          ? 'bg-transparent border-transparent opacity-50 hover:opacity-90 hover:bg-white/[0.04] text-slate-400'
                          : 'bg-transparent border-transparent hover:bg-white/[0.05] hover:border-white/[0.08] text-slate-200'
                }`}
              >
                {/* Left Precision Layer Indicator Bar */}
                <span
                  aria-hidden="true"
                  className={`w-[2px] h-3.5 rounded-full shrink-0 ${layerBarColor}`}
                />

                {/* Primary Part Select Button */}
                <button
                  type="button"
                  data-testid={rowTestIdPrefix ? `${rowTestIdPrefix}-${idx}` : undefined}
                  onClick={() => onSelectPart(isSelected ? null : node.name)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-1.5 text-left cursor-pointer py-0.5"
                  title={`${node.layer} · ${node.name} (${node.tris.toLocaleString()} tris)`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className={`text-[10px] font-mono shrink-0 ${layerTextColor}`}>
                      {node.layer}
                    </span>
                    <span
                      className={`truncate font-mono text-[11px] ${
                        isHidden ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {node.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-slate-500 group-hover:text-slate-300 shrink-0">
                    {node.tris.toLocaleString()}
                  </span>
                </button>

                {/* Right CAD Quick Actions: Visibility (Eye/EyeOff) & Camera Focus (Crosshair) */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    data-testid={rowTestIdPrefix ? `${rowTestIdPrefix}-eye-${idx}` : undefined}
                    aria-label={`${isHidden ? '显示' : '隐藏'}部件 ${node.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidePart(node.name);
                    }}
                    className={`p-1 rounded border transition cursor-pointer ${
                      isHidden
                        ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                        : 'border-transparent text-slate-500 opacity-70 group-hover:opacity-100 hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-100'
                    }`}
                    title={isHidden ? '恢复显示该部件' : '隐藏该部件 (透视内部结构)'}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3 h-3" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-3 h-3" strokeWidth={1.5} />
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid={rowTestIdPrefix ? `${rowTestIdPrefix}-focus-${idx}` : undefined}
                    aria-label={`聚焦部件 ${node.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusPart(node.name);
                    }}
                    className={`p-1 rounded border transition cursor-pointer ${
                      isSelected
                        ? 'border-[#00e5ff]/55 bg-cyan-500/15 text-cyan-200'
                        : 'border-transparent text-slate-500 opacity-70 group-hover:opacity-100 hover:border-white/15 hover:bg-white/[0.06] hover:text-cyan-200'
                    }`}
                    title="镜头平滑推进聚焦并打开工程尺寸蓝图"
                  >
                    <Crosshair className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
