// ============================================================================
// MODULE 1: 3D MAG-LENS X-RAY SPHERE & DUAL-LASER SLS 3D PRINTING MATERIALIZATION
// ============================================================================

export interface SlsMaterializationState {
  active: boolean;
  elapsed: number;
  duration: number;
  /** Normalized progress 0..1 */
  progress: number;
  /** World-space horizontal laser sintering plane Y */
  laserY: number;
  /** Spark & melt-pool intensity 0..1 */
  meltIntensity: number;
}

export function createInitialSlsState(duration: number = 1.8): SlsMaterializationState {
  return {
    active: false,
    elapsed: 0,
    duration: Math.max(0.4, duration),
    progress: 1.0,
    laserY: 999.0,
    meltIntensity: 0.0
  };
}

export function triggerSlsMaterialization(
  yMin: number,
  duration: number = 1.8
): SlsMaterializationState {
  return {
    active: true,
    elapsed: 0,
    duration: Math.max(0.4, duration),
    progress: 0,
    laserY: yMin - 0.05,
    meltIntensity: 1.0
  };
}

/**
 * Advances the 1.8s Dual-Laser Selective Laser Sintering (SLS) materialization sweep
 * from model bounding-box bottom (yMin) to top (yMax).
 */
export function stepSlsMaterializationState(
  prev: SlsMaterializationState,
  dt: number,
  yMin: number,
  yMax: number
): SlsMaterializationState {
  if (!prev.active) {
    return prev;
  }

  const safeDt = Math.max(0, Math.min(0.25, dt));
  const elapsed = prev.elapsed + safeDt;
  const rawU = Math.min(1.0, elapsed / prev.duration);

  // Smooth industrial scan curve (cubic smoothstep blend + steady linear core)
  const smoothU = rawU * rawU * (3 - 2 * rawU);
  const u = 0.35 * rawU + 0.65 * smoothU;
  const span = Math.max(0.15, yMax - yMin);
  const laserY = yMin - span * 0.04 + u * (span * 1.10);

  if (rawU >= 1.0) {
    return {
      active: false,
      elapsed: prev.duration,
      duration: prev.duration,
      progress: 1.0,
      laserY: yMax + 10.0,
      meltIntensity: 0.0
    };
  }

  const edgeFade = Math.sin(rawU * Math.PI);
  return {
    active: true,
    elapsed,
    duration: prev.duration,
    progress: rawU,
    laserY,
    meltIntensity: Math.max(0.25, edgeFade)
  };
}

/**
 * Adjusts the 3D Mag-Lens X-Ray Sphere radius via mouse wheel delta while keeping within ergonomic bounds.
 */
export function clampMagLensRadius(
  currentRadius: number,
  wheelDeltaY: number,
  minRadius: number = 0.16,
  maxRadius: number = 1.15
): number {
  const step = Math.sign(wheelDeltaY) * -0.045;
  const next = currentRadius + step;
  return Math.max(minRadius, Math.min(maxRadius, next));
}

// ============================================================================
// MODULE 2: EMBODIED MPC PREDICTIVE ROLLOUT HORIZON (11 ARCS) & URDF POWER ARTERIES
// ============================================================================

export interface MpcTrajectoryArc {
  index: number;
  /** Steering curvature offset rad/s */
  omegaCandidate: number;
  /** Normalized cost 0 (optimal fluorescent cyan) -> 1 (high-cost amber-red boundary) */
  costNorm: number;
  isOptimal: boolean;
  /** Sampled 3D world points [x, y, z][] along the rollout horizon */
  points: [number, number, number][];
}

export interface MpcGhostPose {
  horizonSec: 0.8 | 1.6;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface MpcRolloutResult {
  arcs: MpcTrajectoryArc[];
  optimalIndex: number;
  futurePoses: [MpcGhostPose, MpcGhostPose];
}

/**
 * Maps normalized MPC rollout cost [0..1] to RGB [0..1]:
 * 0.0 -> Fluorescent Cyan [0.04, 0.98, 0.88]
 * 0.5 -> Golden Amber [0.98, 0.76, 0.12]
 * 1.0 -> High-Cost Collision Boundary Crimson [0.98, 0.22, 0.10]
 */
export function computeMpcCostColor(costNorm: number, isOptimal: boolean): [number, number, number] {
  if (isOptimal) {
    return [0.05, 1.0, 0.90];
  }
  const c = Math.max(0, Math.min(1, costNorm));
  if (c < 0.5) {
    const u = c / 0.5;
    return [0.10 + 0.88 * u, 0.92 - 0.16 * u, 0.72 - 0.60 * u];
  }
  const u = (c - 0.5) / 0.5;
  return [0.98, 0.76 - 0.54 * u, 0.12 - 0.04 * u];
}

/**
 * Generates 11 dynamically curved second-order kinematic Model Predictive Control (MPC) rollout trajectories
 * covering left-turn, right-bypass, straight, and braking envelopes over a 2.0s horizon,
 * plus exact 0.8s and 1.6s future predicted chassis poses along the minimum-cost rollout.
 */
export function computeMpcRolloutFan(
  originX: number,
  originY: number,
  originZ: number,
  headingYaw: number,
  forwardSpeed: number,
  yawRateRadS: number,
  sampleTerrainY: (x: number, z: number) => number,
  simTime: number = 0,
  horizonSec: number = 2.0,
  stepsPerArc: number = 16
): MpcRolloutResult {
  const numArcs = 11; // k = -5 .. +5
  const safeYaw = Number.isFinite(headingYaw) ? headingYaw : 0;
  const safeSpeed = Number.isFinite(forwardSpeed) ? forwardSpeed : 0;
  const safeYawRate = Number.isFinite(yawRateRadS) ? yawRateRadS : 0;
  const effSpeed = Math.abs(safeSpeed) > 0.35 ? safeSpeed : 1.85;
  const dt = horizonSec / stepsPerArc;

  const rawCosts: number[] = [];
  const rawArcs: { omegaCandidate: number; pts: [number, number, number][]; yaws: number[]; pitches: number[] }[] = [];

  // Subtle 60Hz active horizon breathing when patrolling/cruising
  const dynamicSteerBias = safeYawRate + Math.sin(simTime * 2.2) * 0.14;

  for (let idx = 0; idx < numArcs; idx++) {
    const k = idx - 5; // -5 .. +5
    const normK = k / 5;
    // Outer arcs also sample braking/deceleration envelope per spec!
    const decelFactor = 1.0 - Math.abs(normK) * 0.24;
    const omegaCandidate = dynamicSteerBias + normK * 0.92;
    const omegaDot = -normK * 0.18; // Second-order clothoid / S-curve relaxation!

    let x = Number.isFinite(originX) ? originX : 0;
    let z = Number.isFinite(originZ) ? originZ : 0;
    let yaw = safeYaw;
    let v = effSpeed * decelFactor;
    let slopeAccum = 0;

    const pts: [number, number, number][] = [];
    const yaws: number[] = [];
    const pitches: number[] = [];

    let prevY = sampleTerrainY(x, z);
    pts.push([x, Math.max(originY, prevY) + 0.04, z]);
    yaws.push(yaw);
    pitches.push(0);

    for (let s = 1; s <= stepsPerArc; s++) {
      const t = s * dt;
      const instOmega = omegaCandidate + omegaDot * t;
      yaw += instOmega * dt;
      // Second-order velocity damping on outer braking trajectories
      v = effSpeed * decelFactor * (1.0 - 0.12 * Math.abs(normK) * (t / horizonSec));
      const stepDist = v * dt;
      x += Math.cos(yaw) * stepDist;
      z += Math.sin(yaw) * stepDist;

      const terrY = sampleTerrainY(x, z);
      const dy = terrY - prevY;
      const grade = Math.abs(dy) / Math.max(0.02, Math.abs(stepDist));
      slopeAccum += grade;
      const pitch = Math.atan2(dy, Math.max(0.02, Math.abs(stepDist)));
      prevY = terrY;

      pts.push([x, terrY + 0.045, z]);
      yaws.push(yaw);
      pitches.push(pitch);
    }

    // Quadratic control effort + steering deviation from commanded yawRate + terrain slope hazard cost
    const steerDeviation = omegaCandidate - safeYawRate;
    const totalCost =
      steerDeviation * steerDeviation * 1.15 +
      normK * normK * 0.65 +
      slopeAccum * 0.42;

    rawCosts.push(totalCost);
    rawArcs.push({ omegaCandidate, pts, yaws, pitches });
  }

  let minCost = Infinity;
  let maxCost = -Infinity;
  let optimalIndex = 5;
  for (let i = 0; i < numArcs; i++) {
    if (rawCosts[i] < minCost) {
      minCost = rawCosts[i];
      optimalIndex = i;
    }
    if (rawCosts[i] > maxCost) {
      maxCost = rawCosts[i];
    }
  }

  const costSpan = Math.max(1e-4, maxCost - minCost);
  const arcs: MpcTrajectoryArc[] = rawArcs.map((ra, i) => ({
    index: i,
    omegaCandidate: ra.omegaCandidate,
    costNorm: (rawCosts[i] - minCost) / costSpan,
    isOptimal: i === optimalIndex,
    points: ra.pts
  }));

  const opt = rawArcs[optimalIndex];
  const idx08 = Math.min(stepsPerArc, Math.max(1, Math.round((0.8 / horizonSec) * stepsPerArc)));
  const idx16 = Math.min(stepsPerArc, Math.max(2, Math.round((1.6 / horizonSec) * stepsPerArc)));

  const pose08: MpcGhostPose = {
    horizonSec: 0.8,
    x: opt.pts[idx08][0],
    y: opt.pts[idx08][1],
    z: opt.pts[idx08][2],
    yaw: opt.yaws[idx08],
    pitch: opt.pitches[idx08]
  };
  const pose16: MpcGhostPose = {
    horizonSec: 1.6,
    x: opt.pts[idx16][0],
    y: opt.pts[idx16][1],
    z: opt.pts[idx16][2],
    yaw: opt.yaws[idx16],
    pitch: opt.pitches[idx16]
  };

  return {
    arcs,
    optimalIndex,
    futurePoses: [pose08, pose16]
  };
}

export interface JointPowerTelemetry {
  jointName: string;
  /** Instantaneous mechanical power |tau * omega| in Watts */
  powerWatts: number;
  /** Normalized power intensity 0..1 driving pulse speed & brightness */
  intensityNorm: number;
  /** Pulse travel speed along artery (cycles/sec) */
  pulseRateHz: number;
}

/**
 * Computes URDF joint power-flow metrics |tau * omega| to drive luminous energy pulse density & speed
 * from the main battery / MMRTG core through parent-child kinematic arteries.
 */
export function computeUrdfPowerFlowMetrics(
  joints: { name: string; type: string }[],
  angularVelocitiesRadS: number[],
  estimatedTorquesNm: number[]
): { joints: JointPowerTelemetry[]; totalPowerWatts: number } {
  let totalPowerWatts = 0;
  const out: JointPowerTelemetry[] = [];

  for (let i = 0; i < joints.length; i++) {
    const omega = Math.abs(angularVelocitiesRadS[i] || 0);
    const tau = Math.abs(estimatedTorquesNm[i] ?? (12.0 + omega * 18.5));
    const powerWatts = tau * omega;
    totalPowerWatts += powerWatts;
    const intensityNorm = Math.min(1.0, powerWatts / 85.0);
    out.push({
      jointName: joints[i].name,
      powerWatts,
      intensityNorm,
      pulseRateHz: 0.85 + intensityNorm * 4.6
    });
  }

  return { joints: out, totalPowerWatts };
}

// ============================================================================
// MODULE 3: AEROSPACE WIND TUNNEL SCHLIEREN OPTICS & EXTREME DISASTER MODES
// ============================================================================

export interface WindTunnelDisasterConfig {
  /** High-contrast silver-gray Schlieren refractive-gradient shockwave photography */
  schlierenMode: boolean;
  /** Mach 8 atmospheric re-entry purple-orange ionized plasma bow-shock sheath */
  mach8PlasmaSheath: boolean;
  /** Faraday-cage high-voltage surface mesh lightning arcs jumping across real GLB vertices */
  faradayLightningArcs: boolean;
}

export function createDefaultWindTunnelConfig(): WindTunnelDisasterConfig {
  return {
    schlierenMode: false,
    mach8PlasmaSheath: false,
    faradayLightningArcs: false
  };
}

/**
 * Generates a jagged 3D dielectric breakdown lightning path between two real GLB surface vertices
 * pushed outward slightly along the surface normal so the arc dances cleanly over the metal skin.
 */
export function generateSurfaceLightningArcPoints(
  start: [number, number, number],
  end: [number, number, number],
  centerRef: [number, number, number],
  seed: number,
  segments: number = 8
): [number, number, number][] {
  const pts: [number, number, number][] = [start];
  const span = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const jitterAmp = Math.min(0.14, span * 0.22);

  for (let i = 1; i < segments; i++) {
    const u = i / segments;
    const env = Math.sin(u * Math.PI);
    const bx = start[0] + (end[0] - start[0]) * u;
    const by = start[1] + (end[1] - start[1]) * u;
    const bz = start[2] + (end[2] - start[2]) * u;

    // Outward radial normal from model center so arcs hug outer Faraday skin
    let nx = bx - centerRef[0];
    let ny = by - centerRef[1];
    let nz = bz - centerRef[2];
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const h1 = Math.sin(seed * 47.3 + i * 19.7);
    const h2 = Math.cos(seed * 83.1 + i * 31.3);
    const h3 = Math.sin(seed * 113.9 - i * 13.1);

    pts.push([
      bx + nx * 0.024 * env + h1 * jitterAmp * env,
      by + ny * 0.024 * env + h2 * jitterAmp * env,
      bz + nz * 0.024 * env + h3 * jitterAmp * env
    ]);
  }

  pts.push(end);
  return pts;
}

// ============================================================================
// MODULE 4: MILLIMETER-SCALE MICRO-FPV CAVITY FLY-THROUGH SPLINE ENGINE
// ============================================================================

export interface MicroFpvPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  up: [number, number, number];
  bankRollRad: number;
  segmentLabel: string;
}

/**
 * Builds a closed internal cavity fly-through waypoint loop tailored to the real .glb twin's anatomy:
 * - Aerospace Turbofan (CFM56 / B737): Intake lip dive -> titanium fan blade gap -> HPC/combustor core -> nozzle Mach exit -> high-bank return loop!
 * - Robotics / Rover / ROV: Ground-skimming dive under suspension/track bridge -> hollow chassis bay -> climbing along robotic arm links -> turret radar flyby!
 */
export function buildMicroFpvCavityWaypoints(
  contextId: string,
  bboxMin: [number, number, number],
  bboxMax: [number, number, number]
): { points: [number, number, number][]; labels: string[] } {
  const id = contextId.toLowerCase();
  const cx = (bboxMin[0] + bboxMax[0]) * 0.5;
  const cy = (bboxMin[1] + bboxMax[1]) * 0.5;
  const cz = (bboxMin[2] + bboxMax[2]) * 0.5;
  const sx = Math.max(0.4, bboxMax[0] - bboxMin[0]);
  const sy = Math.max(0.3, bboxMax[1] - bboxMin[1]);
  const sz = Math.max(0.4, bboxMax[2] - bboxMin[2]);

  if (id.includes('cfm56') || id.includes('b737')) {
    // Thread the open exploded annular bypass & opened C-duct cowl corridor (never straight through solid center shaft!)
    return {
      points: [
        [cx - sx * 1.05, cy + sy * 0.18, cz + sz * 0.24], // 0: Wide-angle intake lip approach
        [cx - sx * 0.48, cy + sy * 0.28, cz + sz * 0.34], // 1: Annular fan-tip bypass duct corridor
        [cx - sx * 0.04, cy + sy * 0.34, cz + sz * 0.42], // 2: Opened C-duct & HPC casing clearance gap
        [cx + sx * 0.32, cy + sy * 0.30, cz + sz * 0.36], // 3: Annular combustor & HPT outer shroud view
        [cx + sx * 0.82, cy + sy * 0.16, cz + sz * 0.18], // 4: Chevron exhaust nozzle exit sweep
        [cx + sx * 1.08, cy + sy * 0.54, cz + sz * 0.76], // 5: High-G climbing bank turn outside nacelle
        [cx + sx * 0.04, cy + sy * 0.68, cz + sz * 0.94], // 6: Dorsal pylon & accessory gearbox overflight
        [cx - sx * 0.88, cy + sy * 0.40, cz + sz * 0.62]  // 7: Final alignment turn back into bypass corridor
      ],
      labels: [
        '进气道唇口外侧高速切入',
        '穿梭爆甲外涵道钛合金风扇叶尖走廊',
        '掠过开启反推罩与高压压气机间隙',
        '近距内窥双环燃烧室与高压涡轮环',
        '锯齿尾喷管外侧高速破空穿出',
        '大坡度战术滚转拉升回旋',
        '吊挂与附件齿轮箱上方掠飞',
        '对准外涵道准备下一轮无穿模巡航'
      ]
    };
  }

  // Embodied / Tracked / Quadruped / Rover / ROV: thread exploded upper-chassis & arm-flank clearance channels!
  return {
    points: [
      [cx + sx * 0.96, bboxMin[1] + sy * 0.38, cz + sz * 0.66], // 0: Flank approach outside suspension
      [cx + sx * 0.36, cy + sy * 0.18, cz + sz * 0.44],         // 1: Threading exploded L1/L2 side armor gap
      [cx - sx * 0.08, cy + sy * 0.26, cz + sz * 0.38],         // 2: Clear view of internal core bay & actuators
      [cx - sx * 0.32, cy + sy * 0.34, cz + sz * 0.28],         // 3: Sweeping aft power/MMRTG/thruster manifold
      [cx - sx * 0.12, bboxMax[1] + sy * 0.24, cz - sz * 0.18], // 4: Climbing past articulated arm & turret mast
      [cx + sx * 0.24, bboxMax[1] + sy * 0.28, cz - sz * 0.34], // 5: Skimming dorsal LiDAR / Mastcam-Z / Ping360 dome
      [cx - sx * 0.78, cy + sy * 0.48, cz - sz * 0.74],         // 6: Banking wingover orbit behind stern
      [cx + sx * 0.32, cy + sy * 0.32, cz + sz * 0.82]          // 7: Smooth bank turn back into exploded flank corridor
    ],
    labels: [
      '侧翼安全净空走廊俯冲进场',
      '穿行爆甲展开的外层护甲与内胆间隙',
      '近距巡检核心伺服驱动与主控舱',
      '掠过尾部核热源/推进器动力歧管',
      '沿展开机械臂与云台立柱攀升',
      '飞越顶部激光雷达/声呐天穹',
      '大倾角侧滑战术回旋机动',
      '切入爆甲走廊准备下一轮巡检'
    ]
  };
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleClosedSplinePoint(
  pts: [number, number, number][],
  uNorm: number
): [number, number, number] {
  const n = pts.length;
  const wrapped = ((uNorm % 1) + 1) % 1;
  const scaled = wrapped * n;
  const idx = Math.floor(scaled) % n;
  const frac = scaled - Math.floor(scaled);

  const p0 = pts[(idx - 1 + n) % n];
  const p1 = pts[idx];
  const p2 = pts[(idx + 1) % n];
  const p3 = pts[(idx + 2) % n];

  return [
    catmullRomScalar(p0[0], p1[0], p2[0], p3[0], frac),
    catmullRomScalar(p0[1], p1[1], p2[1], p3[1], frac),
    catmullRomScalar(p0[2], p1[2], p2[2], p3[2], frac)
  ];
}

/**
 * Evaluates smooth 6-DOF Micro-FPV drone camera position, look-ahead tangent, and coordinated bank roll
 * along the closed cavity Catmull-Rom spline.
 */
export function evaluateMicroFpvSplinePose(
  waypoints: { points: [number, number, number][]; labels: string[] },
  uNorm: number,
  bankGain: number = 0.65
): MicroFpvPose {
  const pts = waypoints.points;
  const n = pts.length;
  const wrapped = ((uNorm % 1) + 1) % 1;
  const segIdx = Math.floor(wrapped * n) % n;

  const pos = sampleClosedSplinePoint(pts, wrapped);
  const ahead = sampleClosedSplinePoint(pts, wrapped + 0.022);
  const further = sampleClosedSplinePoint(pts, wrapped + 0.048);

  // Tangent 1 & Tangent 2 to estimate horizontal turn curvature for realistic FPV drone banking!
  const t1x = ahead[0] - pos[0];
  const t1y = ahead[1] - pos[1];
  const t1z = ahead[2] - pos[2];
  const len1 = Math.hypot(t1x, t1y, t1z) || 1;
  const fx = t1x / len1;
  const fy = t1y / len1;
  const fz = t1z / len1;

  const t2x = further[0] - ahead[0];
  const t2z = further[2] - ahead[2];
  const len2 = Math.hypot(t2x, t2z) || 1;

  // Signed lateral curvature (cross product Y component in XZ plane)
  const crossY = (fx * (t2z / len2)) - (fz * (t2x / len2));
  const bankRollRad = Math.max(-0.62, Math.min(0.62, crossY * 3.2 * bankGain));

  // Right vector = forward x worldUp(0,1,0) = (-fz, 0, fx)
  const rxLen = Math.hypot(fx, fz) || 1;
  const rx = -fz / rxLen;
  const rz = fx / rxLen;

  // Tilted up vector: cos(bank)*WorldUp + sin(bank)*Right
  const cb = Math.cos(bankRollRad);
  const sb = Math.sin(bankRollRad);
  const upX = rx * sb;
  const upY = cb;
  const upZ = rz * sb;
  const upLen = Math.hypot(upX, upY, upZ) || 1;

  return {
    position: pos,
    lookAt: ahead,
    up: [upX / upLen, upY / upLen, upZ / upLen],
    bankRollRad,
    segmentLabel: waypoints.labels[segIdx] || '纳米穿越机微距穿腔巡航'
  };
}

// ============================================================================
// MODULE 5: PROCEDURAL WEBAUDIO FREQUENCY & ACOUSTIC PARAMETER MAPPINGS
// ============================================================================

/**
 * Maps summed URDF joint angular velocity Σ|Δq/Δt| (rad/s) to FOC brushless servo & harmonic drive
 * carrier frequencies (180Hz ~ 1,400Hz) and gain envelope.
 */
export function computeFocServoAcousticParams(sumJointSpeedRadS: number): {
  primaryCarrierHz: number;
  harmonicSidebandHz: number;
  gain: number;
} {
  const clampedSpeed = Math.max(0, Math.min(28.0, sumJointSpeedRadS));
  const norm = Math.pow(clampedSpeed / 28.0, 0.72);
  const primaryCarrierHz = 180 + norm * (1400 - 180);
  const harmonicSidebandHz = primaryCarrierHz * 1.498; // Characteristic harmonic-drive gear mesh ratio!
  const gain = clampedSpeed < 0.04 ? 0.0 : Math.min(0.085, 0.012 + norm * 0.072);
  return { primaryCarrierHz, harmonicSidebandHz, gain };
}

/**
 * Maps CFM56 dual-spool N1/N2 RPM and reverse-thrust flag to jet pink-noise filter cutoff & Blade Passing Frequencies (BPF).
 */
export function computeTurbofanAcousticParams(
  n1Rpm: number,
  n2Rpm: number,
  isReverse: boolean
): {
  n1BpfHz: number;
  n2BpfHz: number;
  jetBandpassHz: number;
  gain: number;
} {
  // 24-blade wide-chord titanium fan scaled down into crisp audible BPF register
  const n1Norm = Math.max(0, Math.min(1.2, (n1Rpm - 900) / 4500));
  const n2Norm = Math.max(0, Math.min(1.2, (n2Rpm - 8000) / 7200));

  const n1BpfHz = 240 + n1Norm * 880;
  const n2BpfHz = 620 + n2Norm * 1650;
  const jetBandpassHz = isReverse ? 540 + n1Norm * 620 : 210 + n1Norm * 490;
  const gain = Math.min(0.11, 0.022 + n1Norm * 0.068 + (isReverse ? 0.025 : 0));

  return { n1BpfHz, n2BpfHz, jetBandpassHz, gain };
}
