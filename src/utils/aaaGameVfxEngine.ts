import { UrdfJointDef } from './manifestUtils';

// ============================================================================
// SIX AAA INDUSTRIAL SCI-FI GAME VISUAL & INTERACTIVE VFX — PURE LOGIC ENGINE
// 1. Titanfall 2 Orbital Dropfall Deployment (Y=+160m -> 12m Retro -> Impact Crouch -> Rise)
// 2. Armored Core 6 Overheat Armor-Pop Venting (12% seam gap + 2.2s steam) & 90ms RCS Thrusters
// 3. Hardspace: Shipbreaker Engineering Color-Coding & 2nd-Order Spring-Damper Grapple
// 4. Star Citizen / Ace Combat 7 Dynamic Surface Weathering (Mars Dust / Frost / Titanium Bluing)
// 5. Horizon Focus Weakpoint X-Ray Scan & Golden Patrol Navigation Ribbon
// 6. Dead Space 100% Diegetic 3D Spine HUD (4 Dorsal Holographic Arc Gauges)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. TITANFALL 2 ORBITAL DROPFALL DEPLOYMENT
// ----------------------------------------------------------------------------

export type OrbitalDropPhase = 'inactive' | 'supersonic_fall' | 'retro_burn' | 'hydraulic_crouch_rise';

export interface OrbitalDropState {
  active: boolean;
  elapsed: number;
  duration: number; // 1.8s total
  phase: OrbitalDropPhase;
  /** Vertical offset above groundY in meters (starts at +160m, hits 0m at t = 0.9s) */
  altitudeOffsetMeters: number;
  /** Atmospheric friction shock cone & sonic boom cloud intensity [0..1] */
  shockConeIntensity: number;
  /** Retro-burn thruster flash intensity [0..1] during 0.6s ~ 0.9s (altitude 12m -> 0m) */
  retroBurnIntensity: number;
  /** Ground seismic crack wave progress [0..1] after t = 0.9s */
  seismicWaveProgress: number;
  /** Real URDF hydraulic knee/flipper/suspension crouch factor [0..1] during 0.9s ~ 1.8s */
  crouchCompression: number;
  /** Emitted true on the exact frame of touchdown (t crosses 0.9s) for camera trauma & sub-bass slam */
  justTouchedDown: boolean;
}

export function createInitialOrbitalDropState(): OrbitalDropState {
  return {
    active: false,
    elapsed: 0,
    duration: 1.8,
    phase: 'inactive',
    altitudeOffsetMeters: 0,
    shockConeIntensity: 0,
    retroBurnIntensity: 0,
    seismicWaveProgress: 0,
    crouchCompression: 0,
    justTouchedDown: false
  };
}

export function triggerOrbitalDropfall(): OrbitalDropState {
  return {
    active: true,
    elapsed: 0,
    duration: 1.8,
    phase: 'supersonic_fall',
    altitudeOffsetMeters: 160.0,
    shockConeIntensity: 1.0,
    retroBurnIntensity: 0,
    seismicWaveProgress: 0,
    crouchCompression: 0,
    justTouchedDown: false
  };
}

/**
 * Steps the 1.8s Titanfall-grade Orbital Dropfall Deployment:
 * - 0.0 ~ 0.6s: Supersonic freefall from Y = +160m down to +12m (shock cone + sonic cloud ring)
 * - 0.6 ~ 0.9s: Near-ground retro-burn deceleration from +12m to 0m touchdown
 * - 0.9 ~ 1.8s: Heavy ground impact + URDF hydraulic crouch hold (0.35s) + smooth servo stand-up!
 */
export function stepOrbitalDropfall(prev: OrbitalDropState, dt: number): OrbitalDropState {
  if (!prev.active) {
    return prev.justTouchedDown ? { ...prev, justTouchedDown: false } : prev;
  }

  const safeDt = Math.max(0, Math.min(0.25, dt));
  const prevElapsed = prev.elapsed;
  const elapsed = prevElapsed + safeDt;

  if (elapsed >= prev.duration) {
    return createInitialOrbitalDropState();
  }

  const justTouchedDown = prevElapsed < 0.9 && elapsed >= 0.9;

  if (elapsed < 0.6) {
    // 0.0 ~ 0.6s: +160m -> +12m high-velocity supersonic dive
    const u = elapsed / 0.6;
    const alt = 160.0 - u * (160.0 - 12.0);
    return {
      active: true,
      elapsed,
      duration: prev.duration,
      phase: 'supersonic_fall',
      altitudeOffsetMeters: alt,
      shockConeIntensity: 0.75 + 0.25 * Math.sin(u * Math.PI),
      retroBurnIntensity: 0,
      seismicWaveProgress: 0,
      crouchCompression: 0,
      justTouchedDown: false
    };
  }

  if (elapsed < 0.9) {
    // 0.6 ~ 0.9s: +12m -> 0m hard retro-burn flare & touchdown
    const u = (elapsed - 0.6) / 0.3;
    // Quadratic retro deceleration into hard heavy slam
    const alt = 12.0 * (1.0 - u * u);
    return {
      active: true,
      elapsed,
      duration: prev.duration,
      phase: 'retro_burn',
      altitudeOffsetMeters: Math.max(0, alt),
      shockConeIntensity: Math.max(0, 1.0 - u * 1.4),
      retroBurnIntensity: Math.sin(u * Math.PI * 0.85 + 0.15),
      seismicWaveProgress: 0,
      crouchCompression: u * 0.25, // Pre-tension landing gear/knees just before impact
      justTouchedDown
    };
  }

  // 0.9 ~ 1.8s: Touchdown! 0.35s deep hydraulic absorption hold (0.9 ~ 1.25s), then 0.55s power rise (1.25 ~ 1.8s)
  const postImpact = elapsed - 0.9; // 0 .. 0.9s
  const seismicWaveProgress = Math.min(1.0, postImpact / 0.85);

  let crouchCompression = 0;
  if (postImpact < 0.10) {
    // Rapid impact compression into full crouch (0.25 -> 1.0)
    crouchCompression = 0.25 + (postImpact / 0.10) * 0.75;
  } else if (postImpact < 0.45) {
    // 0.35s dramatic hydraulic bottomed-out hold!
    crouchCompression = 1.0 - (postImpact - 0.10) * 0.08;
  } else {
    // Smooth S-curve hydraulic servo rise back to 0.0 combat stance
    const riseU = Math.min(1.0, (postImpact - 0.45) / 0.45);
    const smoothRise = riseU * riseU * (3 - 2 * riseU);
    crouchCompression = 0.97 * (1.0 - smoothRise);
  }

  return {
    active: true,
    elapsed,
    duration: prev.duration,
    phase: 'hydraulic_crouch_rise',
    altitudeOffsetMeters: 0,
    shockConeIntensity: 0,
    retroBurnIntensity: Math.max(0, 1.0 - postImpact * 6.0) * 0.5,
    seismicWaveProgress,
    crouchCompression,
    justTouchedDown
  };
}

/**
 * Computes real URDF joint angle delta (rad) and chassis crouch Y-drop (m) during Orbital Dropfall touchdown!
 * - Unitree G1: Deep knee flexion + hip pitch crouch + ankle dorsiflexion + arm counter-balance
 * - Unitree Go2: All 4 legs deep thigh/calf shock absorption
 * - SAR Tracked Robot: 4 articulated flippers deflecting downward/upward to absorb impact
 * - Mars 2020 Perseverance: Rocker-bogie suspension compression & mast brace
 */
export function computeDropfallUrdfJointDelta(
  actorId: string,
  joint: Pick<UrdfJointDef, 'name' | 'lower' | 'upper'>,
  crouchCompression: number
): number {
  if (crouchCompression <= 0.001) return 0;
  const n = joint.name.toLowerCase();
  let delta = 0;

  if (actorId === 'unitree_g1') {
    if (n.includes('knee')) delta = 1.18 * crouchCompression;
    else if (n.includes('hip_pitch')) delta = -0.92 * crouchCompression;
    else if (n.includes('ankle_pitch')) delta = -0.45 * crouchCompression;
    else if (n.includes('shoulder_pitch')) delta = 0.55 * crouchCompression;
    else if (n.includes('elbow')) delta = 0.65 * crouchCompression;
  } else if (actorId === 'unitree_go2') {
    if (n.includes('thigh')) delta = 0.72 * crouchCompression;
    else if (n.includes('calf')) delta = -1.15 * crouchCompression;
  } else if (actorId === 'sar') {
    if (n.includes('front_left') || n.includes('front_right')) delta = -0.68 * crouchCompression;
    else if (n.includes('back_left') || n.includes('back_right')) delta = 0.68 * crouchCompression;
    else if (n.includes('joint_2') || n.includes('link_2')) delta = 0.45 * crouchCompression;
  } else {
    if (n.includes('joint2') || n.includes('shoulder')) delta = 0.52 * crouchCompression;
    else if (n.includes('joint3') || n.includes('elbow')) delta = -0.62 * crouchCompression;
  }

  return delta;
}

// ----------------------------------------------------------------------------
// 2. ARMORED CORE 6 OVERHEAT ARMOR-POP VENTING & RCS COLD-GAS MICRO-THRUSTERS
// ----------------------------------------------------------------------------

export interface OverheatAndRcsState {
  /** Thermal load [0 .. 100] */
  heatPct: number;
  /** True during the 2.2s forced armor-pop steam cooling cycle */
  ventingActive: boolean;
  /** Remaining venting time (starts at 2.2s -> 0s) */
  ventTimer: number;
  /** Normalized outer L1 armor gap extension [0 .. 0.12] (exact 12% normal pop!) */
  armorGapRatio: number;
  /** Internal core cherry-red glow intensity [0 .. 1] */
  coreGlowIntensity: number;
  /** Steam & spark jet intensity [0 .. 1] */
  steamJetIntensity: number;
  /** Emitted when venting starts or snaps shut */
  justTriggeredVent: boolean;
  justSnappedShut: boolean;
  /** 90ms corner timers [FL, FR, RL, RR] in seconds for crisp blue-white RCS attitude thrusters */
  rcsTimers: [number, number, number, number];
}

export function createInitialOverheatState(): OverheatAndRcsState {
  return {
    heatPct: 14,
    ventingActive: false,
    ventTimer: 0,
    armorGapRatio: 0,
    coreGlowIntensity: 0,
    steamJetIntensity: 0,
    justTriggeredVent: false,
    justSnappedShut: false,
    rcsTimers: [0, 0, 0, 0]
  };
}

export function stepOverheatAndRcsState(
  prev: OverheatAndRcsState,
  params: {
    dt: number;
    isBoosting: boolean;
    justFiredWeapon: boolean;
    manualVentRequested: boolean;
    yawAccelRadS2: number;
    forwardDecelMS2: number;
  }
): OverheatAndRcsState {
  const { dt, isBoosting, justFiredWeapon, manualVentRequested, yawAccelRadS2, forwardDecelMS2 } = params;
  const safeDt = Math.max(0, Math.min(0.2, dt));

  let heatPct = prev.heatPct;
  let ventingActive = prev.ventingActive;
  let ventTimer = prev.ventTimer;
  let justTriggeredVent = false;
  let justSnappedShut = false;

  if (ventingActive) {
    ventTimer -= safeDt;
    heatPct = Math.max(0, (ventTimer / 2.2) * 100);
    if (ventTimer <= 0) {
      ventingActive = false;
      ventTimer = 0;
      heatPct = 8;
      justSnappedShut = true;
    }
  } else {
    // Accumulate heat during sprint/afterburner boost & weapon firing; passive radiative cooling otherwise
    const heatGain = (isBoosting ? 24.0 * safeDt : -6.5 * safeDt) + (justFiredWeapon ? 22.0 : 0);
    heatPct = Math.max(6, Math.min(100, heatPct + heatGain));

    if (manualVentRequested || heatPct >= 99.5) {
      ventingActive = true;
      ventTimer = 2.2;
      heatPct = 100;
      justTriggeredVent = true;
    }
  }

  // Compute exact 12% (0.12) armor pop envelope with snappy open & crisp mechanical lock-shut
  let armorGapRatio = 0;
  let coreGlowIntensity = (heatPct / 100) * 0.28;
  let steamJetIntensity = 0;

  if (ventingActive) {
    const elapsedVent = 2.2 - ventTimer; // 0 .. 2.2
    const openEnv = Math.min(1.0, elapsedVent / 0.14);
    const closeEnv = ventTimer < 0.16 ? ventTimer / 0.16 : 1.0;
    const env = Math.min(openEnv, closeEnv);
    armorGapRatio = 0.12 * env;
    coreGlowIntensity = 0.35 + 0.65 * env;
    steamJetIntensity = env;
  }

  // RCS Cold-Gas Attitude Micro-Thrusters: trigger 60ms (0.06s) crisp micro-pulse on sharp yaw acceleration or hard braking!
  const nextRcs: [number, number, number, number] = [
    Math.max(0, prev.rcsTimers[0] - safeDt),
    Math.max(0, prev.rcsTimers[1] - safeDt),
    Math.max(0, prev.rcsTimers[2] - safeDt),
    Math.max(0, prev.rcsTimers[3] - safeDt)
  ];

  if (yawAccelRadS2 > 1.8) {
    // Counter-clockwise turn impulse -> Front-Right (1) & Rear-Left (2) opposing couple!
    nextRcs[1] = 0.06;
    nextRcs[2] = 0.06;
  } else if (yawAccelRadS2 < -1.8) {
    // Clockwise turn impulse -> Front-Left (0) & Rear-Right (3) opposing couple!
    nextRcs[0] = 0.06;
    nextRcs[3] = 0.06;
  }

  if (forwardDecelMS2 > 4.2) {
    // Hard braking retro burst -> Both front thrusters [FL, FR] fire forward!
    nextRcs[0] = 0.06;
    nextRcs[1] = 0.06;
  }

  return {
    heatPct,
    ventingActive,
    ventTimer,
    armorGapRatio,
    coreGlowIntensity,
    steamJetIntensity,
    justTriggeredVent,
    justSnappedShut,
    rcsTimers: nextRcs
  };
}

// ----------------------------------------------------------------------------
// 3. HARDSPACE: SHIPBREAKER SALVAGE ROLE COLORING & 2ND-ORDER SPRING-DAMPER GRAPPLE
// ----------------------------------------------------------------------------

/**
 * 1 = Chassis/Load-Bearing Frame (Industrial Black-Yellow Hazard Stripes)
 * 2 = Propulsion / Drivetrain / Actuators (Pulsing Crimson)
 * 3 = Sensors / Optics / Avionics (Ice-Crystal Cyan)
 * 4 = High-Risk Nuclear / Combustor / Power Core (Amber Gold)
 */
export type ShipbreakerRoleCode = 0 | 1 | 2 | 3 | 4;

export function classifyShipbreakerPartRole(
  partName: string,
  layer: 'L1' | 'L2' | 'L3'
): { code: ShipbreakerRoleCode; roleLabel: string } {
  const n = partName.toLowerCase();

  if (
    n.includes('mmrtg') ||
    n.includes('combustor') ||
    n.includes('battery') ||
    n.includes('reactor') ||
    n.includes('hpt') ||
    n.includes('power') ||
    n.includes('core_shaft')
  ) {
    return { code: 4, roleLabel: '高危核芯/燃烧室 [琥珀金]' };
  }

  if (
    n.includes('lidar') ||
    n.includes('sonar') ||
    n.includes('ping360') ||
    n.includes('cam') ||
    n.includes('mast') ||
    n.includes('radar') ||
    n.includes('imu') ||
    n.includes('sensor') ||
    n.includes('head')
  ) {
    return { code: 3, roleLabel: '感知与航电舱 [冰晶青]' };
  }

  if (
    n.includes('wheel') ||
    n.includes('track') ||
    n.includes('flipper') ||
    n.includes('thruster') ||
    n.includes('fan') ||
    n.includes('lpc') ||
    n.includes('hpc') ||
    n.includes('lpt') ||
    n.includes('reverser') ||
    n.includes('nozzle') ||
    n.includes('thigh') ||
    n.includes('calf') ||
    n.includes('knee') ||
    n.includes('hip') ||
    n.includes('ankle') ||
    n.includes('link_') ||
    n.includes('joint') ||
    layer === 'L2'
  ) {
    return { code: 2, roleLabel: '推进与动力传动系 [脉冲赤红]' };
  }

  if (layer === 'L3') {
    return { code: 4, roleLabel: '精密内胆动力舱 [琥珀金]' };
  }

  return { code: 1, roleLabel: '主承力车架/蒙皮 [黑黄警示纹]' };
}

export interface SpringDamperVec3State {
  pos: [number, number, number];
  vel: [number, number, number];
  target: [number, number, number];
}

/**
 * Advances a 2nd-order underdamped Spring-Damper 3D vector for Shipbreaker Magnetic Grapple Tether
 * so dragged CAD sub-parts float with authentic physical mass & elastic inertia!
 */
export function stepSpringDamperVec3(
  state: SpringDamperVec3State,
  dt: number,
  stiffness: number = 95.0,
  damping: number = 12.5
): SpringDamperVec3State {
  const safeDt = Math.max(0, Math.min(0.033, dt));
  const nextPos: [number, number, number] = [0, 0, 0];
  const nextVel: [number, number, number] = [0, 0, 0];

  for (let k = 0; k < 3; k++) {
    const disp = state.target[k] - state.pos[k];
    const accel = disp * stiffness - state.vel[k] * damping;
    const v = state.vel[k] + accel * safeDt;
    nextVel[k] = v;
    nextPos[k] = state.pos[k] + v * safeDt;
  }

  return {
    pos: nextPos,
    vel: nextVel,
    target: [state.target[0], state.target[1], state.target[2]]
  };
}

// ----------------------------------------------------------------------------
// 4. STAR CITIZEN / ACE COMBAT 7 REAL-TIME SURFACE WEATHERING
// ----------------------------------------------------------------------------

export interface SurfaceWeatheringState {
  /** Martian red regolith dust accumulation upward from lower tracks/chassis [0 .. 1] */
  marsDust: number;
  /** High-altitude leading-edge ice crystal frost [0 .. 1] */
  intakeFrost: number;
  /** Exhaust / combustor Titanium Heat Bluing [0 .. 1] */
  titaniumHeatBluing: number;
}

export function createInitialWeatheringState(): SurfaceWeatheringState {
  return {
    marsDust: 0,
    intakeFrost: 0,
    titaniumHeatBluing: 0
  };
}

export function stepDynamicWeathering(
  prev: SurfaceWeatheringState,
  params: {
    dt: number;
    domain: 'land' | 'sea' | 'air';
    speedMetersPerSec: number;
    throttlePct: number;
  }
): SurfaceWeatheringState {
  const { dt, domain, speedMetersPerSec, throttlePct } = params;
  const safeDt = Math.max(0, Math.min(0.2, dt));
  const spd = Math.abs(speedMetersPerSec);

  if (domain === 'land') {
    const dustDelta = spd > 0.3 ? safeDt * (0.028 + spd * 0.008) : 0;
    return {
      marsDust: Math.min(1.0, prev.marsDust + dustDelta),
      intakeFrost: Math.max(0, prev.intakeFrost - safeDt * 0.1),
      titaniumHeatBluing: Math.min(0.45, prev.titaniumHeatBluing + (throttlePct > 75 ? safeDt * 0.02 : 0))
    };
  }

  if (domain === 'air') {
    return {
      marsDust: Math.max(0, prev.marsDust - safeDt * 0.15),
      intakeFrost: Math.min(1.0, prev.intakeFrost + safeDt * (0.045 + spd * 0.003)),
      titaniumHeatBluing: Math.min(1.0, prev.titaniumHeatBluing + safeDt * (0.03 + (throttlePct / 100) * 0.06))
    };
  }

  // Sea domain naturally rinses dust while subtle thruster heat bluing remains
  return {
    marsDust: Math.max(0, prev.marsDust - safeDt * 0.25),
    intakeFrost: Math.min(0.35, prev.intakeFrost + safeDt * 0.015),
    titaniumHeatBluing: Math.min(0.5, prev.titaniumHeatBluing + (throttlePct > 70 ? safeDt * 0.02 : 0))
  };
}

// ----------------------------------------------------------------------------
// 5. HORIZON FOCUS WEAKPOINT X-RAY & 6. DEAD SPACE DIEGETIC 3D SPINE HUD
// ----------------------------------------------------------------------------

/**
 * Returns Focus Shader Mode for a given CAD sub-part when Horizon Focus Weakpoint Scan is enabled:
 * - 0 = Focus Off
 * - 1 = Outer L1 Armor darkened to translucent dark-steel silhouette
 * - 2 = Internal High-Value Weakpoint Core (L3 / MMRTG / LiDAR / Combustor / Pressure Hull) glowing Amber-Gold!
 */
export function computeHorizonFocusMode(
  enabled: boolean,
  partName: string,
  layer: 'L1' | 'L2' | 'L3'
): 0 | 1 | 2 {
  if (!enabled) return 0;
  const n = partName.toLowerCase();
  const isWeakpoint =
    layer === 'L3' ||
    n.includes('lidar') ||
    n.includes('mmrtg') ||
    n.includes('combustor') ||
    n.includes('hpt') ||
    n.includes('sonar') ||
    n.includes('ping360') ||
    n.includes('cam') ||
    n.includes('battery');
  if (isWeakpoint) return 2;
  if (layer === 'L1') return 1;
  return 0;
}

export interface DiegeticSpineTelemetry {
  /** ⚡ Power Output Arc [0 .. 1] */
  powerArcFill: number;
  /** 🌡️ Core Thermal Melt Slot [0 .. 1] */
  thermalSlotFill: number;
  /** 🔄 Main Rotor / Joint RPM Ring [0 .. 1] */
  rpmRingFill: number;
  /** 🎯 Weapon Capacitor Charge [0 .. 1] */
  weaponChargeFill: number;
}

export function computeDiegeticSpineTelemetry(params: {
  throttlePct: number;
  heatPct: number;
  speedNorm: number;
  fireCooldownTimer: number;
}): DiegeticSpineTelemetry {
  return {
    powerArcFill: Math.max(0.08, Math.min(1.0, params.throttlePct / 100)),
    thermalSlotFill: Math.max(0.06, Math.min(1.0, params.heatPct / 100)),
    rpmRingFill: Math.max(0.1, Math.min(1.0, params.speedNorm)),
    weaponChargeFill: Math.max(0.05, Math.min(1.0, 1.0 - params.fireCooldownTimer))
  };
}
