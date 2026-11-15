import { UrdfJointDef } from './manifestUtils';

export type HangarRegime = 'idle' | 'patrol' | 'sweep';
export type AeroRegime = 'idle_24' | 'cruise_78' | 'toga_100' | 'reverse';
export type MarsRegime = 'traverse' | 'coring' | 'panorama';

export interface HangarRegimeOption {
  id: HangarRegime;
  label: string;
  shortLabel: string;
  loadFactor: number;
}

export interface AeroRegimeOption {
  id: AeroRegime;
  label: string;
  plaPercent: number;
  isReverse: boolean;
  loadFactor: number;
}

export interface MarsRegimeOption {
  id: MarsRegime;
  label: string;
  loadFactor: number;
}

export const HANGAR_REGIMES: HangarRegimeOption[] = [
  { id: 'idle', label: '待机微呼吸 (Idle)', shortLabel: 'Idle 待机', loadFactor: 0.22 },
  { id: 'patrol', label: '巡检作业 (Active Patrol)', shortLabel: 'Patrol 巡检', loadFactor: 0.68 },
  { id: 'sweep', label: '极限包络自检 (Joint Sweep)', shortLabel: 'Sweep 自检', loadFactor: 0.94 }
];

export const AERO_REGIMES: AeroRegimeOption[] = [
  { id: 'idle_24', label: '慢车 Idle 24%', plaPercent: 24, isReverse: false, loadFactor: 0.24 },
  { id: 'cruise_78', label: '巡航 Cruise 78%', plaPercent: 78, isReverse: false, loadFactor: 0.78 },
  { id: 'toga_100', label: '起飞全加力 TOGA 100%', plaPercent: 100, isReverse: false, loadFactor: 1.0 },
  { id: 'reverse', label: '着陆反推 Reverse', plaPercent: 72, isReverse: true, loadFactor: 0.82 }
];

export const MARS_REGIMES: MarsRegimeOption[] = [
  { id: 'traverse', label: '火星地表越障巡航', loadFactor: 0.65 },
  { id: 'coring', label: '岩芯采样作业', loadFactor: 0.85 },
  { id: 'panorama', label: '遥感环视扫描', loadFactor: 0.42 }
];

export interface AeroFadecTelemetry {
  plaPercent: number;
  n1Rpm: number;
  n2Rpm: number;
  egtCelsius: number;
  fuelFlowKgH: number;
  reverserStroke: number; // 0..1
  n1SpinRadS: number;
  n2SpinRadS: number;
}

export interface TelemetryProbeReadout {
  id: string;
  label: string;
  partKeywords: string[];
  fallbackLocalPos: [number, number, number];
  primaryValue: string;
  secondaryValue: string;
  status: 'NOMINAL' | 'ELEVATED' | 'ACTIVE';
}

/**
 * Frame-rate independent exponential smoothing.
 */
export function dampValue(current: number, target: number, lambda: number, dt: number): number {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  return current + (target - current) * (1 - Math.exp(-lambda * safeDt));
}

/**
 * Formats elapsed simulation time (with base offset 14m 20s) as `00:14:28.42`.
 */
export function formatSimClock(elapsedSeconds: number): string {
  const total = Math.max(0, 860 + elapsedSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const centis = Math.floor((total - Math.floor(total)) * 100);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}.${pad2(centis)}`;
}

/**
 * Computes 1.2-second cyan Fresnel rim pulse intensity after selecting a real GLB sub-part.
 */
export function computeFresnelPulseIntensity(elapsedSec: number): number {
  if (elapsedSec < 0) return 0;
  if (elapsedSec > 1.2) return 0.24; // Steady subtle highlight after 1.2s pulse
  // Smooth bell-shaped scan pulse peaking at 0.25s and settling to 0.24 by 1.2s
  const rise = Math.min(1, elapsedSec / 0.22);
  const decay = Math.exp(-2.6 * Math.max(0, elapsedSec - 0.22));
  return 0.24 + 0.76 * rise * decay;
}

/**
 * Computes closed-loop live URDF joint angle/position for any of the 6 real flagship robots.
 */
export function computeRobotLiveJointTarget(
  packId: string,
  joint: UrdfJointDef,
  jointIndex: number,
  regime: HangarRegime,
  simTime: number
): number {
  const name = joint.name.toLowerCase();
  const child = joint.child.toLowerCase();

  // Continuous propulsion thrusters (BlueROV2 & RexROV2)
  if (name.includes('thruster') || child.includes('thruster') || child.includes('prop')) {
    const speedMult = regime === 'idle' ? 3.5 : regime === 'patrol' ? 12.5 : 20.0;
    const dir = jointIndex % 2 === 0 ? 1 : -1;
    // Wrap within [-PI, PI] so FK slider visibly oscillates/rotates cleanly
    const raw = (simTime * speedMult * dir + jointIndex * 0.7) % (Math.PI * 2);
    return raw > Math.PI ? raw - Math.PI * 2 : raw < -Math.PI ? raw + Math.PI * 2 : raw;
  }

  // Ping360 360-degree scanning sonar joint
  if (name.includes('sonar') || child.includes('sonar')) {
    const scanSpeed = regime === 'idle' ? 0.65 : regime === 'patrol' ? 1.65 : 2.8;
    const raw = (simTime * scanSpeed) % (Math.PI * 2);
    return raw > Math.PI ? raw - Math.PI : raw - Math.PI;
  }

  // Tracked robot main drive wheels
  if (packId === 'sar' && joint.type === 'continuous' && !name.includes('f_')) {
    const wheelSpeed = regime === 'idle' ? 0.4 : regime === 'patrol' ? 3.2 : 6.4;
    const raw = (simTime * wheelSpeed) % (Math.PI * 2);
    return raw - Math.PI;
  }

  // Determine safe URDF mechanical limits
  const lo = Number.isFinite(joint.lower) ? joint.lower : -1.57;
  const hi = Number.isFinite(joint.upper) ? joint.upper : 1.57;
  const mid = 0.5 * (lo + hi);
  const halfSpan = Math.max(0.08, Math.min(1.45, 0.5 * (hi - lo)));

  if (regime === 'sweep') {
    // Envelope self-test sweep across 78% of mechanical URDF limits
    const phase = simTime * 1.45 + jointIndex * 0.42;
    return clampToLimits(mid + Math.sin(phase) * halfSpan * 0.78, lo, hi);
  }

  if (regime === 'idle') {
    // Subtle micro-breathingservo holding loop
    const microAmp = Math.min(0.09, halfSpan * 0.14);
    return clampToLimits(mid * 0.15 + Math.sin(simTime * 1.15 + jointIndex * 0.6) * microAmp, lo, hi);
  }

  // Active Patrol / Coordinated Gait / Manipulator Inspection Trajectory
  if (packId === 'sar') {
    if (name.includes('f_front') || name.includes('flipper_front')) {
      return clampToLimits(0.32 + 0.28 * Math.sin(simTime * 1.8), lo, hi);
    }
    if (name.includes('f_back') || name.includes('flipper_back')) {
      return clampToLimits(-0.22 + 0.24 * Math.cos(simTime * 1.8), lo, hi);
    }
    // AR4 6-axis arm inspection sweep
    return clampToLimits(mid * 0.2 + Math.sin(simTime * 1.35 + jointIndex * 0.75) * Math.min(0.65, halfSpan * 0.55), lo, hi);
  }

  if (packId === 'rexrov2') {
    // Oberon7 7-DOF subsea hydraulic arm coordinated sinusoidal reach & grip
    return clampToLimits(mid * 0.25 + Math.sin(simTime * 1.1 + jointIndex * 0.65) * Math.min(0.58, halfSpan * 0.5), lo, hi);
  }

  if (packId === 'unitree_go2') {
    // Diagonal trot gait phase pairing (FL+RR vs FR+RL)
    const isDiagonalA = name.startsWith('fl_') || name.startsWith('rr_');
    const gaitPhase = simTime * 3.6 + (isDiagonalA ? 0 : Math.PI);
    if (name.includes('hip')) {
      return clampToLimits(0.06 * Math.sin(gaitPhase), lo, hi);
    }
    if (name.includes('thigh')) {
      return clampToLimits(0.62 + 0.28 * Math.sin(gaitPhase), lo, hi);
    }
    if (name.includes('calf')) {
      return clampToLimits(-1.18 + 0.32 * Math.cos(gaitPhase), lo, hi);
    }
  }

  if (packId === 'unitree_g1') {
    const isLeft = name.includes('left');
    const stridePhase = simTime * 2.6 + (isLeft ? 0 : Math.PI);
    if (name.includes('hip_pitch')) {
      return clampToLimits(-0.15 + 0.28 * Math.sin(stridePhase), lo, hi);
    }
    if (name.includes('knee')) {
      return clampToLimits(0.36 + 0.26 * Math.max(0, Math.sin(stridePhase + 0.6)), lo, hi);
    }
    if (name.includes('ankle_pitch')) {
      return clampToLimits(-0.18 - 0.16 * Math.sin(stridePhase), lo, hi);
    }
    if (name.includes('shoulder_pitch')) {
      return clampToLimits(0.12 - 0.26 * Math.sin(stridePhase), lo, hi);
    }
    if (name.includes('elbow')) {
      return clampToLimits(0.45 + 0.18 * Math.cos(stridePhase), lo, hi);
    }
    if (name.includes('waist')) {
      return clampToLimits(0.1 * Math.sin(simTime * 2.6), lo, hi);
    }
    return clampToLimits(mid * 0.2 + 0.12 * Math.sin(simTime * 2.0 + jointIndex), lo, hi);
  }

  if (packId === 'unitree_z1') {
    // 6-DOF spatial welding / pick-and-place trajectory
    const trajPhase = simTime * 1.45 + jointIndex * 0.58;
    return clampToLimits(mid * 0.35 + Math.sin(trajPhase) * Math.min(0.72, halfSpan * 0.55), lo, hi);
  }

  return clampToLimits(mid * 0.2 + Math.sin(simTime * 1.4 + jointIndex * 0.5) * Math.min(0.5, halfSpan * 0.45), lo, hi);
}

function clampToLimits(val: number, lo: number, hi: number): number {
  if (lo >= hi) return val;
  return Math.max(lo, Math.min(hi, val));
}

/**
 * Computes CFM56-7B FADEC dual-spool thermodynamics & kinematics from PLA throttle & regime.
 */
export function computeAeroFadecTargets(regime: AeroRegime, plaOverride?: number): AeroFadecTelemetry {
  const preset = AERO_REGIMES.find((r) => r.id === regime) || AERO_REGIMES[1];
  const pla = plaOverride !== undefined ? Math.max(18, Math.min(100, plaOverride)) : preset.plaPercent;
  const norm = (pla - 18) / 82; // 0..1 above ground idle

  // Authentic CFM56-7B27 rated curves: N1 max ~5,380 RPM, N2 max ~15,183 RPM
  const n1Rpm = 1180 + norm * 4200;
  const n2Rpm = 9150 + Math.pow(norm, 0.78) * 6033;
  const egtCelsius = 435 + Math.pow(norm, 1.12) * 515 + (preset.isReverse ? 48 : 0);
  const fuelFlowKgH = 340 + Math.pow(norm, 1.35) * 2380;
  const reverserStroke = preset.isReverse ? 1.0 : 0.0;

  // Visual angular velocities (rad/s) preserving differential N2 > N1 ratio
  const n1SpinRadS = 2.6 + norm * 16.5;
  const n2SpinRadS = n1SpinRadS * 2.45;

  return {
    plaPercent: pla,
    n1Rpm,
    n2Rpm,
    egtCelsius,
    fuelFlowKgH,
    reverserStroke,
    n1SpinRadS,
    n2SpinRadS
  };
}

/**
 * Computes NASA Perseverance Mars 2020 closed-loop subsystem articulation targets.
 */
export function computeMarsLiveTargets(regime: MarsRegime, simTime: number): {
  rockerPitch: number;
  armPitch: number;
  mastYaw: number;
  wheelSpinRadS: number;
} {
  if (regime === 'traverse') {
    return {
      rockerPitch: 0.42 * Math.sin(simTime * 1.55) + 0.14 * Math.cos(simTime * 3.1),
      armPitch: -0.25 + 0.06 * Math.sin(simTime * 1.1),
      mastYaw: 0.38 * Math.sin(simTime * 0.75),
      wheelSpinRadS: 2.4
    };
  }
  if (regime === 'coring') {
    return {
      rockerPitch: 0.08 * Math.sin(simTime * 0.5),
      armPitch: 0.68 + 0.24 * Math.sin(simTime * 1.35),
      mastYaw: -0.32 + 0.12 * Math.sin(simTime * 0.9),
      wheelSpinRadS: 0.0
    };
  }
  // panorama
  return {
    rockerPitch: 0.03 * Math.sin(simTime * 0.6),
    armPitch: -0.15 + 0.04 * Math.sin(simTime * 0.8),
    mastYaw: 1.32 * Math.sin(simTime * 0.85),
    wheelSpinRadS: 0.35
  };
}

/**
 * Industrial Infrared False-Color Palette (Deep Cryo Blue -> Cyan -> Nominal Green -> Amber -> Hot Red -> Incandescent White-Yellow).
 */
export function computeThermalIrColor(normalizedTemp: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normalizedTemp));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.05, 0.16, 0.52]],   // Deep cold blue
    [0.25, [0.02, 0.68, 0.85]],  // Cryo/ambient cyan
    [0.48, [0.12, 0.82, 0.48]],  // Nominal green-teal
    [0.70, [0.96, 0.65, 0.08]],  // Warm amber
    [0.88, [0.95, 0.22, 0.12]],  // Hot combustion crimson
    [1.0, [1.0, 0.94, 0.76]]     // Incandescent core white-gold
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / Math.max(1e-5, t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Estimates normalized thermal intensity [0..1] for a real GLB sub-part based on physical domain & operating load.
 */
export function estimatePartThermalNormalized(
  contextId: string,
  meshName: string,
  layer: 'L1' | 'L2' | 'L3',
  loadFactor: number,
  normAxialX: number = 0
): number {
  const n = meshName.toLowerCase();
  const load = Math.max(0.1, Math.min(1.0, loadFactor));

  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    // Turbofan axial gas-path temperature profile: cold intake -> warm LPC/HPC -> incandescent combustor/HPT
    if (n.includes('inlet') || n.includes('fan_containment') || n.includes('n1_wide_chord')) {
      return 0.08 + 0.08 * load;
    }
    if (n.includes('ogv') || n.includes('reverser')) {
      return 0.18 + 0.16 * load;
    }
    if (n.includes('lpc')) {
      return 0.34 + 0.22 * load;
    }
    if (n.includes('hpc')) {
      return 0.54 + 0.28 * load;
    }
    if (n.includes('combustor') || n.includes('hpt')) {
      return Math.min(1.0, 0.68 + 0.32 * load);
    }
    if (n.includes('lpt') || n.includes('exhaust') || n.includes('shaft')) {
      return 0.58 + 0.28 * load;
    }
    return Math.max(0.1, Math.min(0.95, 0.3 + normAxialX * 0.35 + 0.2 * load));
  }

  if (contextId === 'mars2020') {
    // Tail MMRTG Pu-238 nuclear heat source (~210 C) conducting forward into WEB warm electronics box
    if (n.includes('rtg') || n.includes('mmrtg') || (layer === 'L3' && normAxialX < -0.35)) {
      return Math.min(1.0, 0.86 + 0.1 * load);
    }
    if (layer === 'L3') {
      return Math.max(0.38, 0.62 - Math.max(0, normAxialX) * 0.22 + 0.1 * load);
    }
    if (layer === 'L2') {
      return n.includes('turret') || n.includes('drill') ? 0.35 + 0.42 * load : 0.26 + 0.18 * load;
    }
    // L1 wheels & suspension on cold Martian regolith (-60C ambient, actuator hubs warm)
    return n.includes('suspension') ? 0.24 + 0.22 * load : 0.14 + 0.24 * load;
  }

  // Embodied & Subsea Robots: Servo motors, harmonic drives, thrusters, and LiDAR ASICs heat up with load
  if (
    n.includes('motor') ||
    n.includes('thruster') ||
    n.includes('prop') ||
    n.includes('hip') ||
    n.includes('knee') ||
    n.includes('thigh') ||
    n.includes('shoulder') ||
    n.includes('esc')
  ) {
    return Math.min(0.96, 0.46 + 0.46 * load);
  }
  if (n.includes('lidar') || n.includes('sonar') || n.includes('imu') || n.includes('camera') || layer === 'L3') {
    return 0.38 + 0.26 * load;
  }
  if (layer === 'L2') {
    return 0.26 + 0.28 * load;
  }
  return 0.14 + 0.14 * load;
}

/**
 * Generates deterministic + micro-jitter HIL telemetry callout probes for the 6 flagship robots & 3 workstations.
 */
export function buildSpatialTelemetryProbes(
  contextId: string,
  simTime: number,
  loadFactor: number,
  fadec?: AeroFadecTelemetry
): TelemetryProbeReadout[] {
  const jitter = (seed: number, amp: number) =>
    Math.sin(simTime * 11.3 + seed * 4.7) * amp * 0.6 + Math.cos(simTime * 23.1 + seed * 2.1) * amp * 0.4;

  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    const f = fadec || computeAeroFadecTargets('cruise_78');
    const n1 = Math.max(0, f.n1Rpm + jitter(1, 6.5));
    const n2 = Math.max(0, f.n2Rpm + jitter(2, 11.2));
    const egt = f.egtCelsius + jitter(3, 1.8);
    const opr = 4.2 + (f.plaPercent / 100) * 28.6 + jitter(4, 0.08);
    const revPct = Math.round(f.reverserStroke * 100);
    return [
      {
        id: 'cfm_n1',
        label: 'N1 宽弦钛合金风扇',
        partKeywords: ['n1_wide_chord', 'inlet_cowl'],
        fallbackLocalPos: [-0.62, 0.35, 0.25],
        primaryValue: `${Math.round(n1).toLocaleString()} RPM`,
        secondaryValue: `PLA ${f.plaPercent.toFixed(0)}% · Mach ${(0.32 + (f.plaPercent / 100) * 0.94).toFixed(2)}`,
        status: f.plaPercent > 90 ? 'ELEVATED' : 'ACTIVE'
      },
      {
        id: 'cfm_hpc',
        label: '9级高压压气机 HPC',
        partKeywords: ['hpc_9stage', 'lpc_4stage'],
        fallbackLocalPos: [0.02, 0.28, -0.22],
        primaryValue: `${Math.round(n2).toLocaleString()} RPM`,
        secondaryValue: `OPR ${opr.toFixed(1)}:1 · T3 ${(240 + (f.plaPercent / 100) * 340 + jitter(5, 1.2)).toFixed(1)} °C`,
        status: 'NOMINAL'
      },
      {
        id: 'cfm_egt',
        label: '双环腔燃烧室 / HPT 热端',
        partKeywords: ['combustor', 'hpt_single'],
        fallbackLocalPos: [0.46, 0.26, 0.18],
        primaryValue: `EGT ${egt.toFixed(1)} °C`,
        secondaryValue: `FF ${Math.round(f.fuelFlowKgH + jitter(6, 8))} kg/h`,
        status: egt > 880 ? 'ELEVATED' : 'ACTIVE'
      },
      {
        id: 'cfm_rev',
        label: 'C-Duct 叶栅反推短舱',
        partKeywords: ['thrust_reverser_c_duct_port', 'thrust_reverser'],
        fallbackLocalPos: [0.22, -0.35, 0.48],
        primaryValue: revPct > 5 ? `REV DEPLOY ${revPct}%` : 'STOWED LOCKED',
        secondaryValue: `Actuator ${(20.4 + f.reverserStroke * 8.2 + jitter(7, 0.12)).toFixed(1)} MPa`,
        status: revPct > 5 ? 'ELEVATED' : 'NOMINAL'
      }
    ];
  }

  if (contextId === 'mars2020') {
    const rtgTemp = 198.4 + loadFactor * 9.5 + jitter(1, 0.35);
    const rtgWatts = 110.2 - loadFactor * 1.4 + jitter(2, 0.18);
    const drillTorque = 12.4 + loadFactor * 28.6 + jitter(3, 0.65);
    const bogieLoad = 168 + loadFactor * 42 + jitter(4, 1.9);
    return [
      {
        id: 'mars_mmrtg',
        label: 'MMRTG 钚-238 核热电池',
        partKeywords: ['rtg', '10461523', 'cube009'],
        fallbackLocalPos: [-0.72, 0.22, 0.0],
        primaryValue: `${rtgTemp.toFixed(1)} °C · ${rtgWatts.toFixed(1)} W`,
        secondaryValue: `热功率 1,998 W · 母线 28.4 V`,
        status: 'ELEVATED'
      },
      {
        id: 'mars_mastcam',
        label: 'Mastcam-Z / SuperCam 桅杆',
        partKeywords: ['mast', 'head', 'navcam', 'cylinder015'],
        fallbackLocalPos: [0.38, 0.68, -0.22],
        primaryValue: `AZ ${(Math.sin(simTime * 0.85) * 75 + jitter(5, 0.2)).toFixed(1)}°`,
        secondaryValue: `LIBS 激光测距 ${(4.82 + Math.sin(simTime * 0.4) * 0.6).toFixed(2)} m`,
        status: 'ACTIVE'
      },
      {
        id: 'mars_turret',
        label: '5-DOF 岩芯钻转塔 PIXL',
        partKeywords: ['turret', 'arm', 'drill'],
        fallbackLocalPos: [0.82, 0.05, 0.18],
        primaryValue: `${drillTorque.toFixed(1)} N·m`,
        secondaryValue: `冲击频率 ${(loadFactor > 0.75 ? 32.5 + jitter(6, 0.4) : 0).toFixed(1)} Hz`,
        status: loadFactor > 0.75 ? 'ELEVATED' : 'NOMINAL'
      },
      {
        id: 'mars_bogie',
        label: 'Rocker-Bogie 钛合金主摇臂',
        partKeywords: ['horizontal', 'suspension', 'wheel'],
        fallbackLocalPos: [0.12, -0.36, 0.52],
        primaryValue: `${bogieLoad.toFixed(1)} N · 差速联动`,
        secondaryValue: `轮毂温度 ${(-18.5 + loadFactor * 34 + jitter(7, 0.3)).toFixed(1)} °C`,
        status: 'NOMINAL'
      }
    ];
  }

  if (contextId === 'bluerov2' || contextId === 'rexrov2') {
    const isRex = contextId === 'rexrov2';
    const rpm = 1150 + loadFactor * 2450 + jitter(1, 18);
    const sonarDeg = ((simTime * (45 + loadFactor * 75)) % 360);
    return [
      {
        id: 'rov_thruster',
        label: isRex ? '深海矢量推进器 #2' : 'T200 无刷矢量推进器',
        partKeywords: ['thruster_2', 'thruster_1', 'thruster'],
        fallbackLocalPos: [0.35, 0.15, 0.32],
        primaryValue: `${Math.round(rpm).toLocaleString()} RPM`,
        secondaryValue: `推力 ${(18.5 + loadFactor * (isRex ? 195 : 34) + jitter(2, 0.4)).toFixed(1)} N`,
        status: 'ACTIVE'
      },
      {
        id: 'rov_sonar',
        label: isRex ? '深海前视声呐阵 / 传感器舱' : 'Ping360 机械扫描声呐',
        partKeywords: ['ping360_sonar', 'rov_sensor_pod', 'sonar'],
        fallbackLocalPos: [0.25, 0.42, -0.18],
        primaryValue: `BRG ${sonarDeg.toFixed(1)}° · 750 kHz`,
        secondaryValue: `回波距离 ${(14.2 + Math.sin(simTime * 0.7) * 2.1).toFixed(2)} m`,
        status: 'ACTIVE'
      },
      {
        id: 'rov_hull',
        label: isRex ? '3000m 耐压电子框架舱' : 'Bar30 耐压电子密封舱',
        partKeywords: ['electronics_tube', 'bar30', 'rexrov2_hull'],
        fallbackLocalPos: [-0.28, 0.12, -0.32],
        primaryValue: `${(isRex ? 248.6 : 42.8 + jitter(3, 0.05)).toFixed(2)} bar`,
        secondaryValue: `舱内湿度 24.1% · ${(36.2 + loadFactor * 14.5 + jitter(4, 0.2)).toFixed(1)} °C`,
        status: 'NOMINAL'
      },
      {
        id: 'rov_arm_or_bus',
        label: isRex ? 'Oberon7 液压关节臂力矩' : 'Navigator 飞控与供电母线',
        partKeywords: ['oberon7_upper_arm', 'oberon7_elbow', 'esc_power', 'navigator'],
        fallbackLocalPos: [0.55, -0.28, 0.12],
        primaryValue: isRex
          ? `${(64.2 + loadFactor * 118 + jitter(5, 1.4)).toFixed(1)} N·m`
          : `${(15.8 - loadFactor * 0.9 + jitter(5, 0.06)).toFixed(2)} V · ${(8.4 + loadFactor * 26.5).toFixed(1)} A`,
        secondaryValue: isRex ? `油压 20.8 MPa` : `MAVLink 100Hz 锁定`,
        status: loadFactor > 0.8 ? 'ELEVATED' : 'NOMINAL'
      }
    ];
  }

  // Embodied Ground & Manipulator Robots (SAR, Unitree G1, Unitree Go2, Unitree Z1)
  const torquePeak = (contextId === 'unitree_g1' ? 58 : contextId === 'sar' ? 36 : 28) * (0.35 + loadFactor * 0.85) + jitter(1, 0.75);
  const motorTemp = 34.5 + loadFactor * 29.5 + jitter(2, 0.25);
  const busPower = (contextId === 'unitree_g1' ? 280 : 145) * (0.3 + loadFactor * 0.95) + jitter(3, 3.2);

  return [
    {
      id: 'bot_lidar',
      label: contextId === 'unitree_z1' ? '末端夹爪伺服力控传感器' : '3D 激光雷达 / 深度视觉模组',
      partKeywords: ['lidar', 'head', 'radar', 'gripper', 'link06'],
      fallbackLocalPos: [0.32, 0.52, 0.12],
      primaryValue: contextId === 'unitree_z1'
        ? `Grip ${(14.2 + loadFactor * 18.5 + jitter(4, 0.3)).toFixed(1)} N`
        : `${(285 + jitter(4, 4)).toFixed(0)}k pts/s · 10Hz`,
      secondaryValue: `SLAM 定位残差 ${(0.008 + jitter(5, 0.001)).toFixed(3)} m`,
      status: 'ACTIVE'
    },
    {
      id: 'bot_joint_primary',
      label: contextId === 'sar' ? '越障前摆臂主驱动关节' : contextId === 'unitree_z1' ? 'J2 大臂谐波减速器关节' : '主承力髋/膝关节扭矩电机',
      partKeywords: ['f_front_left', 'thigh', 'knee_link', 'link02', 'link_2'],
      fallbackLocalPos: [0.22, -0.08, 0.36],
      primaryValue: `${torquePeak.toFixed(1)} N·m`,
      secondaryValue: `定子温度 ${motorTemp.toFixed(1)} °C`,
      status: motorTemp > 58 ? 'ELEVATED' : 'ACTIVE'
    },
    {
      id: 'bot_arm_or_leg',
      label: contextId === 'sar' ? 'AR4 六轴机械臂腕部关节' : '副运动链谐波/行星伺服节点',
      partKeywords: ['link_4', 'link04', 'calf', 'elbow', 'ankle'],
      fallbackLocalPos: [-0.28, 0.18, -0.28],
      primaryValue: `${(torquePeak * 0.58 + jitter(6, 0.45)).toFixed(1)} N·m`,
      secondaryValue: `FOC 闭环 1,000 Hz`,
      status: 'NOMINAL'
    },
    {
      id: 'bot_bus',
      label: '高压直流母线与 IMU 姿态核',
      partKeywords: ['base_link', 'torso', 'pelvis', 'base', 'link00'],
      fallbackLocalPos: [-0.18, 0.05, 0.35],
      primaryValue: `${busPower.toFixed(0)} W · ${(48.2 - loadFactor * 1.6 + jitter(7, 0.08)).toFixed(1)} V`,
      secondaryValue: `IMU 零偏 ${(0.012 + Math.abs(jitter(8, 0.004))).toFixed(3)} °/s`,
      status: 'NOMINAL'
    }
  ];
}

/**
 * Computes 45-degree industrial elbow leader-line geometry from projected 3D screen point to outer HUD margin.
 */
export function computeCalloutLeaderGeometry(
  screenX: number,
  screenY: number,
  viewportW: number,
  viewportH: number,
  slotIndex: number,
  sideHudInsetPx = 0
): {
  x0: number,
  y0: number,
  xElbow: number,
  yElbow: number,
  xEnd: number,
  yEnd: number,
  alignRight: boolean
} {
  const w = Math.max(360, viewportW);
  const h = Math.max(280, viewportH);
  const safeInset = w >= 1120 ? Math.max(0, Math.min(340, sideHudInsetPx)) : 0;
  const x0 = Math.max(36, Math.min(w - 36, screenX));
  const y0 = Math.max(64, Math.min(h - 96, screenY));

  // Slots 0,1 dock on left corridor edge; Slots 2,3 dock on right corridor edge
  const placeOnRight = slotIndex >= 2;
  const isLowerSlot = slotIndex % 2 === 1;
  const cardSpan = safeInset > 0 ? safeInset + 186 : 204;

  const xEnd = placeOnRight
    ? Math.max(w * 0.56, w - cardSpan)
    : Math.min(w * 0.44, cardSpan);

  const upperY = Math.min(h * 0.42, 168);
  const lowerY = Math.max(upperY + 118, Math.min(h - 148, Math.round(h * 0.66)));
  const yEnd = Math.round(isLowerSlot ? lowerY : upperY);

  const dxTotal = xEnd - x0;
  const dirX = dxTotal >= 0 ? 1 : -1;
  const dy = yEnd - y0;
  const diagRun = Math.min(Math.max(18, Math.abs(dy)), Math.max(18, Math.abs(dxTotal) - 22));
  const xElbow = Math.round(x0 + dirX * diagRun);

  return {
    x0: Math.round(x0),
    y0: Math.round(y0),
    xElbow: xElbow === Math.round(x0) ? Math.round(x0 + dirX * 20) : xElbow,
    yElbow: yEnd,
    xEnd: Math.round(xEnd),
    yEnd,
    alignRight: placeOnRight
  };
}

/**
 * Samples 3 real-time bus waveform channels [0..1] for the 60Hz scrolling sparklines.
 */
export function sampleTelemetryWaveforms(
  contextId: string,
  simTime: number,
  loadFactor: number
): {
  ch1Value: number;
  ch2Value: number;
  ch3Value: number;
  ch1Text: string;
  ch2Text: string;
  ch3Text: string;
  protocolBadge: string;
} {
  const load = Math.max(0.12, Math.min(1.0, loadFactor));
  const n1 = 0.5 + 0.5 * Math.sin(simTime * 5.2);
  const n2 = 0.5 + 0.5 * Math.sin(simTime * 13.7 + 1.1);
  const hf = 0.5 + 0.5 * Math.sin(simTime * 29.3);

  const ch1 = Math.max(0.06, Math.min(0.96, 0.18 + load * 0.58 + (n1 - 0.5) * 0.18 * load + (hf - 0.5) * 0.06));
  const ch2 = Math.max(0.06, Math.min(0.96, 0.14 + load * 0.52 + (n2 - 0.5) * 0.26 + (hf - 0.5) * 0.12));
  const ch3 = Math.max(0.06, Math.min(0.96, 0.20 + load * 0.60 + Math.abs(Math.sin(simTime * 3.4)) * 0.22 * load));

  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    return {
      ch1Value: ch1,
      ch2Value: ch2,
      ch3Value: ch3,
      ch1Text: `${(420 + ch1 * 2350).toFixed(0)} kg/h`,
      ch2Text: `${(0.18 + ch2 * 1.45).toFixed(2)} ips FFT`,
      ch3Text: `${(460 + ch3 * 510).toFixed(1)} °C EGT`,
      protocolBadge: 'ARINC-429 / FADEC'
    };
  }

  if (contextId === 'mars2020') {
    return {
      ch1Value: ch1,
      ch2Value: ch2,
      ch3Value: ch3,
      ch1Text: `${(108.5 + ch1 * 4.2).toFixed(1)} W RTG`,
      ch2Text: `${(0.04 + ch2 * 0.38).toFixed(2)} g Vib`,
      ch3Text: `${(14.0 + ch3 * 36.0).toFixed(1)} N·m`,
      protocolBadge: 'MIL-STD-1553 / FSW'
    };
  }

  if (contextId === 'bluerov2' || contextId === 'rexrov2') {
    return {
      ch1Value: ch1,
      ch2Value: ch2,
      ch3Value: ch3,
      ch1Text: `${(180 + ch1 * 920).toFixed(0)} W Bus`,
      ch2Text: `${(0.12 + ch2 * 0.85).toFixed(2)} m/s² IMU`,
      ch3Text: `${(22.0 + ch3 * 145.0).toFixed(1)} N Thrust`,
      protocolBadge: 'MAVLink2 / ROS2 DDS'
    };
  }

  return {
    ch1Value: ch1,
    ch2Value: ch2,
    ch3Value: ch3,
    ch1Text: `${(95 + ch1 * 340).toFixed(0)} W Bus`,
    ch2Text: `${(0.08 + ch2 * 0.92).toFixed(2)} rad/s`,
    ch3Text: `${(12.5 + ch3 * 68.0).toFixed(1)} N·m Peak`,
    protocolBadge: 'ROS2 /joint_states'
  };
}
