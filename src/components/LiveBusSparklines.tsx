import React, { useEffect, useRef } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { sampleTelemetryWaveforms } from '../utils/liveTwinEngine';
import { computeFaultOscilloscopeHarmonic } from '../utils/hallOfFameEngine';

interface LiveBusSparklinesProps {
  contextId: string;
  loadFactor: number;
  liveSim: boolean;
  channelLabels: [string, string, string];
  faultActive?: boolean;
  faultLabel?: string;
  torqueSpikeNm?: number;
  children?: React.ReactNode;
}

export const LiveBusSparklines: React.FC<LiveBusSparklinesProps> = ({
  contextId,
  loadFactor,
  liveSim,
  channelLabels,
  faultActive = false,
  faultLabel,
  torqueSpikeNm = 0,
  children
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const val1Ref = useRef<HTMLSpanElement | null>(null);
  const val2Ref = useRef<HTMLSpanElement | null>(null);
  const val3Ref = useRef<HTMLSpanElement | null>(null);
  const protoRef = useRef<HTMLSpanElement | null>(null);

  const loadRef = useRef(loadFactor);
  const liveRef = useRef(liveSim);
  const ctxIdRef = useRef(contextId);
  const faultRef = useRef(faultActive);
  const torqueSpikeRef = useRef(torqueSpikeNm);

  useEffect(() => {
    loadRef.current = loadFactor;
    liveRef.current = liveSim;
    ctxIdRef.current = contextId;
    faultRef.current = faultActive;
    torqueSpikeRef.current = torqueSpikeNm;
  }, [loadFactor, liveSim, contextId, faultActive, torqueSpikeNm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const historyLen = 90;
    const ch1Hist = new Float32Array(historyLen).fill(0.35);
    const ch2Hist = new Float32Array(historyLen).fill(0.28);
    const ch3Hist = new Float32Array(historyLen).fill(0.42);
    let head = 0;
    let simT = 0;
    let lastTs = performance.now();
    let frameCount = 0;
    let rafId = 0;

    // Seed initial waveform so even paused mode shows realistic historical trace
    for (let i = 0; i < historyLen; i++) {
      const s = sampleTelemetryWaveforms(ctxIdRef.current, i * 0.05, loadRef.current);
      ch1Hist[i] = s.ch1Value;
      ch2Hist[i] = s.ch2Value;
      ch3Hist[i] = s.ch3Value;
    }

    const draw = (now: number) => {
      const dt = Math.min(0.08, (now - lastTs) / 1000);
      lastTs = now;
      simT += liveRef.current ? dt : dt * 0.12;

      const sample = sampleTelemetryWaveforms(ctxIdRef.current, simT, loadRef.current);
      const isFault = faultRef.current;
      const spikeNm = torqueSpikeRef.current;
      const spikeBoost = spikeNm > 1 ? Math.min(0.56, spikeNm / 210) : 0;
      ch1Hist[head] = Math.min(
        0.98,
        computeFaultOscilloscopeHarmonic(sample.ch1Value, simT, isFault, 0) + spikeBoost * 0.55
      );
      ch2Hist[head] = Math.min(
        0.98,
        computeFaultOscilloscopeHarmonic(sample.ch2Value, simT, isFault, 1) + spikeBoost * 0.65
      );
      ch3Hist[head] = Math.min(
        0.99,
        computeFaultOscilloscopeHarmonic(sample.ch3Value, simT, isFault, 2) + spikeBoost
      );
      head = (head + 1) % historyLen;

      frameCount++;
      if (frameCount % 4 === 0) {
        if (val1Ref.current) val1Ref.current.textContent = sample.ch1Text;
        if (val2Ref.current) val2Ref.current.textContent = sample.ch2Text;
        if (val3Ref.current) {
          if (spikeNm > 4) {
            const baseNum = parseFloat(sample.ch3Text) || 48.0;
            val3Ref.current.textContent = `${(baseNum + spikeNm).toFixed(1)} N·m ⚡`;
          } else {
            val3Ref.current.textContent = sample.ch3Text;
          }
        }
        if (protoRef.current) protoRef.current.textContent = sample.protocolBadge;
      }

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Subtle oscilloscope graticule grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.75)';
      ctx.lineWidth = 1;
      const bandH = H / 3;
      for (let r = 1; r < 3; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * bandH);
        ctx.lineTo(W, r * bandH);
        ctx.stroke();
      }
      for (let c = 1; c < 6; c++) {
        ctx.beginPath();
        ctx.moveTo((c * W) / 6, 0);
        ctx.lineTo((c * W) / 6, H);
        ctx.stroke();
      }

      const drawTrace = (hist: Float32Array, bandIndex: number, stroke: string, fill: string) => {
        const yTop = bandIndex * bandH + 3;
        const usableH = bandH - 6;
        ctx.beginPath();
        for (let i = 0; i < historyLen; i++) {
          const idx = (head + i) % historyLen;
          const x = (i / (historyLen - 1)) * W;
          const y = yTop + usableH * (1.0 - hist[idx]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.lineTo(W, yTop + usableH);
        ctx.lineTo(0, yTop + usableH);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };

      drawTrace(
        ch1Hist,
        0,
        isFault ? '#ef4444' : '#38bdf8',
        isFault ? 'rgba(239, 68, 68, 0.22)' : 'rgba(56, 189, 248, 0.10)'
      );
      drawTrace(
        ch2Hist,
        1,
        isFault ? '#f97316' : '#10b981',
        isFault ? 'rgba(249, 115, 22, 0.16)' : 'rgba(16, 185, 129, 0.10)'
      );
      drawTrace(
        ch3Hist,
        2,
        spikeNm > 4 ? '#fb923c' : '#f59e0b',
        spikeNm > 4 ? 'rgba(251, 146, 60, 0.24)' : 'rgba(245, 158, 11, 0.10)'
      );

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className="px-2.5 pb-2.5 pt-1.5 space-y-2"
      data-testid="live-bus-sparklines"
    >
      <div className="flex items-center justify-between gap-1">
        <div
          className={`text-[10px] font-mono tracking-wide flex items-center gap-1.5 ${
            faultActive ? 'text-amber-300 font-semibold' : 'text-slate-300'
          }`}
        >
          {faultActive ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" strokeWidth={1.5} />
          ) : (
            <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" strokeWidth={1.5} />
          )}
          <span className="truncate">
            {faultActive ? `故障演示 · ${faultLabel || '谐波震荡'}` : '程序波形 · 未连接设备'}
          </span>
        </div>
        <span
          ref={protoRef}
          className={`text-[10px] font-mono tabular-nums whitespace-nowrap ${
            faultActive ? 'text-amber-300 font-semibold' : 'text-cyan-300/90'
          }`}
        >
          演示数据
        </span>
      </div>

      {/* 3-Channel 60fps Oscilloscope Canvas */}
      <div
        className={`bg-[#0b0e14]/90 border rounded-lg p-1.5 space-y-1 ${
          faultActive ? 'border-amber-500/60' : 'border-white/[0.07]'
        }`}
      >
        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono tabular-nums">
          <div className="truncate">
            <span className="text-slate-500 block truncate">{channelLabels[0]}</span>
            <span ref={val1Ref} className="text-sky-300 font-semibold">--</span>
          </div>
          <div className="truncate">
            <span className="text-slate-500 block truncate">{channelLabels[1]}</span>
            <span ref={val2Ref} className="text-emerald-300 font-semibold">--</span>
          </div>
          <div className="truncate">
            <span className="text-slate-500 block truncate">{channelLabels[2]}</span>
            <span ref={val3Ref} className="text-amber-300 font-semibold">--</span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={264}
          height={60}
          className="w-full h-[60px] block rounded"
        />
      </div>

      {/* Preserved Reality Baseline & Triangle Metrics */}
      {children}
    </div>
  );
};
