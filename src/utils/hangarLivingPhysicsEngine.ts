import { UrdfJointDef } from './manifestUtils';

/**
 * Modules 3 & 4 Pure Physics & Global State Coordinator for Digital Twin Hangar:
 * 1. Interactive Cursor Gaze Tracking (head / mast / gimbal smooth look-at, auto-paused during explosion/isolation)
 * 2. Unitree-Signature 3D Push-Recovery Impulse Test (2nd-order inverted-pendulum CoM disturbance + counterweight arms
 *    + deep hip/knee recovery step + coupled Thermal spike, Power-Artery surge & Telemetry Torque N·m waveform spike)
 * 3. Assembly Magnetic Snap-Back Whole-Robot Micro-Vibration Impulse
 * 4. Floor-Click MPC Predictive Walk Controller (steers & walks URDF robot to clicked 3D Hangar floor beacon)
 * 5. Global Hangar State Coordinator ([C] Micro-FPV 18% explosion clamp & clip reset, Optical Section auto-skeleton reveal,
 *    and standalone mode smooth section reset)
 */

export interface HangarGazeState {
  active: boolean;
  yawRad: number;
  pitchRad: number;
  targetYawRad: number;
  targetPitchRad: number;
}

export function createInitialHangarGazeState(): HangarGazeState {
  return {
    active: false,
    yawRad: 0,
    pitchRad: 0,
    targetYawRad: 0,
    targetPitchRad: 0
  };
}

export function stepHangarGazeTracking(
  state: HangarGazeState,
  params: {
    dt: number;
    cursorValid: boolean;
    pointerNdcX: number;
    pointerNdcY: number;
    explosion: number;
    isolatedPart: string | null;
    microFpvActive: boolean;
    ultimateActive: boolean;
  }
): HangarGazeState {
  const canTrack =
    params.cursorValid &&
    params.explosion <= 0.015 &&
    !params.isolatedPart &&
    !params.microFpvActive &&
    !params.ultimateActive;

  const targetYaw = canTrack ? Math.max(-0.62, Math.min(0.62, params.pointerNdcX * 0.56)) : 0;
  const targetPitch = canTrack ? Math.max(-0.36, Math.min(0.36, -params.pointerNdcY * 0.34)) : 0;
  const k = 1 - Math.exp(-7.5 * Math.min(0.1, Math.max(0.001, params.dt)));

  return {
    active: canTrack,
    yawRad: state.yawRad + (targetYaw - state.yawRad) * k,
    pitchRad: state.pitchRad + (targetPitch - state.pitchRad) * k,
    targetYawRad: targetYaw,
    targetPitchRad: targetPitch
  };
}

export function computeHangarGazeUrdfDelta(
  robotId: string,
  def: UrdfJointDef,
  gaze: HangarGazeState
): number {
  if (Math.abs(gaze.yawRad) < 1e-4 && Math.abs(gaze.pitchRad) < 1e-4) return 0;
  const jn = def.name.toLowerCase();
  const child = def.child.toLowerCase();

  // Humanoid G1: head/waist subtle lifelike gaze tracking
  if (robotId === 'unitree_g1') {
    if (jn.includes('head_yaw') || child.includes('head')) {
      return gaze.yawRad * 0.75;
    }
    if (jn.includes('waist_yaw')) {
      return gaze.yawRad * 0.38;
    }
    if (jn.includes('waist_pitch') || jn.includes('torso')) {
      return gaze.pitchRad * 0.28;
    }
    return 0;
  }

  // Manipulator Z1: base waist & wrist pan toward cursor
  if (robotId === 'unitree_z1') {
    if (jn === 'joint1') return gaze.yawRad * 0.55;
    if (jn === 'joint5') return gaze.pitchRad * 0.5;
    return 0;
  }

  // Tracked SAR / Rover / ROV sensor mast or camera gimbal
  if (
    jn.includes('mast') ||
    jn.includes('pan') ||
    jn.includes('lidar') ||
    jn.includes('camera') ||
    jn.includes('sonar') ||
    child.includes('head')
  ) {
    return gaze.yawRad * 0.65;
  }
  if (jn.includes('tilt')) {
    return gaze.pitchRad * 0.5;
  }

  // Quadruped Go2 subtle front body posture lean toward cursor
  if (robotId === 'unitree_go2') {
    if (jn.includes('fl_hip') || jn.includes('fr_hip')) {
      return gaze.yawRad * 0.16;
    }
    if (jn.includes('fl_thigh') || jn.includes('fr_thigh')) {
      return gaze.pitchRad * 0.18;
    }
  }

  return 0;
}

export interface PushRecoveryState {
  active: boolean;
  elapsed: number;
  duration: number;
  contactWorld: [number, number, number];
  pushDirWorld: [number, number, number];
  forceNewtons: number;
  impactPartName: string;
  arrowVisibleTimer: number;
  // 2nd-order inverted-pendulum CoM tilt response (radians)
  tiltPitch: number;
  tiltRoll: number;
  velPitch: number;
  velRoll: number;
  // Root translation & recovery step phase
  rootShiftX: number;
  rootShiftZ: number;
  stepPhase: number;
  // Cross-module physical coupling outputs
  thermalSpike01: number;
  powerArteryBoost: number;
  telemetryTorqueSpikeNm: number;
}

export function createInitialPushRecoveryState(): PushRecoveryState {
  return {
    active: false,
    elapsed: 0,
    duration: 1.55,
    contactWorld: [0, 0.3, 0],
    pushDirWorld: [0, 0, -1],
    forceNewtons: 0,
    impactPartName: '',
    arrowVisibleTimer: 0,
    tiltPitch: 0,
    tiltRoll: 0,
    velPitch: 0,
    velRoll: 0,
    rootShiftX: 0,
    rootShiftZ: 0,
    stepPhase: 0,
    thermalSpike01: 0,
    powerArteryBoost: 0,
    telemetryTorqueSpikeNm: 0
  };
}

export function triggerPushRecoveryImpulse(
  prev: PushRecoveryState,
  params: {
    contactWorld: [number, number, number];
    pushDirWorld: [number, number, number];
    forceNewtons?: number;
    impactPartName?: string;
    robotYaw?: number;
  }
): PushRecoveryState {
  const dx = params.pushDirWorld[0];
  const dy = params.pushDirWorld[1];
  const dz = params.pushDirWorld[2];
  const horizLen = Math.hypot(dx, dz);
  const nx = horizLen > 1e-4 ? dx / horizLen : 0;
  const nz = horizLen > 1e-4 ? dz / horizLen : -1;
  const force = Math.round(params.forceNewtons ?? 225);
  const scale = Math.max(0.65, Math.min(1.55, force / 210));

  // Project world push direction into robot local frame (yaw)
  const yaw = params.robotYaw ?? 0;
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const localFwd = nx * sinY + nz * cosY;
  const localRight = nx * cosY - nz * sinY;

  return {
    active: true,
    elapsed: 0,
    duration: 1.65,
    contactWorld: [...params.contactWorld],
    pushDirWorld: [nx, Math.max(-0.35, Math.min(0.35, dy)), nz],
    forceNewtons: force,
    impactPartName: params.impactPartName || 'torso_link',
    arrowVisibleTimer: 1.45,
    tiltPitch: prev.tiltPitch * 0.25,
    tiltRoll: prev.tiltRoll * 0.25,
    velPitch: localFwd * 4.4 * scale,
    velRoll: -localRight * 4.1 * scale,
    rootShiftX: nx * 0.09 * scale,
    rootShiftZ: nz * 0.09 * scale,
    stepPhase: 0.01,
    thermalSpike01: 1.0,
    powerArteryBoost: 1.0,
    telemetryTorqueSpikeNm: Math.round(force * 0.54)
  };
}

export function stepPushRecoveryState(state: PushRecoveryState, rawDt: number): PushRecoveryState {
  if (!state.active) return state;
  const dt = Math.min(0.05, Math.max(0.001, rawDt));
  const elapsed = state.elapsed + dt;
  const arrowVisibleTimer = Math.max(0, state.arrowVisibleTimer - dt);

  // 2nd-order active PD balance controller (omega_n = 11.5 rad/s, zeta = 0.58)
  const stiffness = 132.0;
  const damping = 13.4;
  const accP = -stiffness * state.tiltPitch - damping * state.velPitch;
  const accR = -stiffness * state.tiltRoll - damping * state.velRoll;
  const velPitch = state.velPitch + accP * dt;
  const velRoll = state.velRoll + accR * dt;
  const tiltPitch = Math.max(-0.46, Math.min(0.46, state.tiltPitch + velPitch * dt));
  const tiltRoll = Math.max(-0.42, Math.min(0.42, state.tiltRoll + velRoll * dt));

  // Recovery step envelope (peaks at t ~ 0.26s, settles cleanly back to stance by 1.2s)
  const stepEnv =
    elapsed < 1.25 ? Math.sin(Math.min(1, elapsed / 1.25) * Math.PI) * Math.exp(-elapsed * 1.15) : 0;
  const decay = Math.exp(-elapsed * 2.1);
  const rootK = 1 - Math.exp(-5.5 * dt);
  const rootShiftX = state.rootShiftX * (1 - rootK * 0.45);
  const rootShiftZ = state.rootShiftZ * (1 - rootK * 0.45);

  const tiltEnergy = Math.min(
    1,
    Math.hypot(tiltPitch, tiltRoll) * 2.8 + Math.hypot(velPitch, velRoll) * 0.22
  );
  const thermalSpike01 = Math.max(decay * 0.92, tiltEnergy * 0.85);
  const powerArteryBoost = Math.max(decay, tiltEnergy);
  const telemetryTorqueSpikeNm = Math.round(
    state.forceNewtons * 0.56 * Math.max(decay, tiltEnergy * 0.9)
  );

  if (elapsed >= state.duration && tiltEnergy < 0.02 && arrowVisibleTimer <= 0) {
    return createInitialPushRecoveryState();
  }

  return {
    ...state,
    elapsed,
    arrowVisibleTimer,
    tiltPitch,
    tiltRoll,
    velPitch,
    velRoll,
    rootShiftX,
    rootShiftZ,
    stepPhase: stepEnv,
    thermalSpike01,
    powerArteryBoost,
    telemetryTorqueSpikeNm
  };
}

/**
 * Computes URDF joint angle deltas for Unitree-style whole-body push recovery:
 * - Torso pitches/rolls with disturbance
 * - Arms swing wide outward as angular-momentum counterweights
 * - Hips, knees & ankles flex deeply into a stabilizing recovery step!
 */
export function computePushRecoveryUrdfDelta(
  robotId: string,
  def: UrdfJointDef,
  push: PushRecoveryState
): number {
  if (!push.active) return 0;
  const jn = def.name.toLowerCase();
  const p = push.tiltPitch;
  const r = push.tiltRoll;
  const crouch = push.stepPhase * 1.65;

  if (robotId === 'unitree_g1') {
    if (jn.includes('waist_pitch') || jn.includes('torso_pitch')) return p * 1.15;
    if (jn.includes('waist_roll')) return r * 1.05;
    // Counterweight arm flare!
    if (jn.includes('left_shoulder_roll')) return Math.max(0, crouch * 0.72 + Math.abs(r) * 0.9);
    if (jn.includes('right_shoulder_roll')) return -Math.max(0, crouch * 0.72 + Math.abs(r) * 0.9);
    if (jn.includes('left_shoulder_pitch')) return -p * 1.45 - crouch * 0.35;
    if (jn.includes('right_shoulder_pitch')) return -p * 1.45 - crouch * 0.35;
    if (jn.includes('elbow')) return -crouch * 0.52;
    // Stabilizing leg crouch + asymmetric recovery step
    const isLeftLeg = jn.includes('left_');
    const stepAsym = isLeftLeg ? p * 0.95 : -p * 0.55;
    if (jn.includes('hip_pitch')) return -crouch * 0.68 - stepAsym;
    if (jn.includes('hip_roll')) return -r * 0.65 + (isLeftLeg ? 0.08 : -0.08) * crouch;
    if (jn.includes('knee')) return crouch * 1.28 + Math.max(0, stepAsym * 0.8);
    if (jn.includes('ankle_pitch')) return -crouch * 0.58 + p * 0.45;
    if (jn.includes('ankle_roll')) return r * 0.55;
    return 0;
  }

  if (robotId === 'unitree_go2') {
    const isFront = jn.includes('fl_') || jn.includes('fr_');
    const isLeft = jn.includes('fl_') || jn.includes('rl_');
    if (jn.includes('hip')) return -r * 0.75 + (isLeft ? 0.14 : -0.14) * crouch;
    if (jn.includes('thigh')) return crouch * 0.65 + (isFront ? p * 0.8 : -p * 0.8);
    if (jn.includes('calf')) return -crouch * 1.15;
    return 0;
  }

  if (robotId === 'unitree_z1') {
    if (jn === 'joint1') return r * 0.85;
    if (jn === 'joint2') return p * 1.1;
    if (jn === 'joint3') return -p * 1.25 - crouch * 0.4;
    return 0;
  }

  // Tracked SAR / ROV flippers & suspension brace
  if (jn.includes('flipper') || jn.includes('bogie') || jn.includes('arm')) {
    return p * 0.85 + crouch * 0.35;
  }
  return 0;
}

export function isHighLoadPushJointPart(partName: string): boolean {
  const n = partName.toLowerCase();
  return (
    n.includes('hip') ||
    n.includes('thigh') ||
    n.includes('knee') ||
    n.includes('calf') ||
    n.includes('ankle') ||
    n.includes('waist') ||
    n.includes('torso') ||
    n.includes('pelvis') ||
    n.includes('joint2') ||
    n.includes('joint3')
  );
}

/**
 * Assembly Snap-Back Physical Micro-Vibration State (triggered when a dragged/peeled part latches back).
 */
export interface AssemblySnapShakeState {
  timer: number;
  amplitude: number;
}

export function triggerAssemblySnapShake(amplitude: number = 1.0): AssemblySnapShakeState {
  return { timer: 0.28, amplitude: Math.max(0.2, Math.min(2.0, amplitude)) };
}

export function stepAssemblySnapShake(
  state: AssemblySnapShakeState,
  dt: number
): { next: AssemblySnapShakeState; offsetY: number; pitchRad: number; rollRad: number } {
  if (state.timer <= 0) {
    return { next: { timer: 0, amplitude: 0 }, offsetY: 0, pitchRad: 0, rollRad: 0 };
  }
  const nextTimer = Math.max(0, state.timer - Math.min(0.05, dt));
  const env = (nextTimer / 0.28) * state.amplitude;
  const phase = (0.28 - nextTimer) * 68.0;
  return {
    next: { timer: nextTimer, amplitude: state.amplitude },
    offsetY: -Math.abs(Math.sin(phase)) * 0.018 * env,
    pitchRad: Math.sin(phase * 1.15) * 0.028 * env,
    rollRad: Math.cos(phase * 0.9) * 0.022 * env
  };
}

/**
 * Floor-Click MPC Predictive Walk State (steers & physically walks robot across Hangar deck to clicked target).
 */
export interface HangarMpcWalkState {
  hasTarget: boolean;
  isWalking: boolean;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turnVel: number;
  gaitDistance: number;
  targetX: number;
  targetZ: number;
  beaconPulse: number;
}

export function createInitialHangarMpcWalkState(): HangarMpcWalkState {
  return {
    hasTarget: false,
    isWalking: false,
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    turnVel: 0,
    gaitDistance: 0,
    targetX: 0,
    targetZ: 0,
    beaconPulse: 0
  };
}

export function setMpcFloorTarget(
  prev: HangarMpcWalkState,
  worldX: number,
  worldZ: number,
  maxRadius: number = 2.6
): HangarMpcWalkState {
  const r = Math.hypot(worldX, worldZ);
  const scale = r > maxRadius ? maxRadius / r : 1.0;
  return {
    ...prev,
    hasTarget: true,
    isWalking: true,
    targetX: worldX * scale,
    targetZ: worldZ * scale,
    beaconPulse: 1.0
  };
}

export function stepHangarMpcWalk(state: HangarMpcWalkState, rawDt: number): HangarMpcWalkState {
  const dt = Math.min(0.06, Math.max(0.001, rawDt));
  if (!state.hasTarget) {
    return {
      ...state,
      isWalking: false,
      speed: state.speed * Math.exp(-8 * dt),
      turnVel: 0
    };
  }

  const dx = state.targetX - state.x;
  const dz = state.targetZ - state.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.055) {
    return {
      ...state,
      x: state.targetX,
      z: state.targetZ,
      isWalking: false,
      speed: 0,
      turnVel: 0,
      beaconPulse: Math.max(0, state.beaconPulse - dt * 1.2)
    };
  }

  // Note: GLB robot forward in Hangar is +Z / +X depending on model; standard Three.js yaw around +Y:
  // forward vector (sin(yaw), 0, cos(yaw))
  const desiredYaw = Math.atan2(dx, dz);
  let diff = desiredYaw - state.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const turnRate = Math.max(-3.6, Math.min(3.6, diff * 6.2));
  const nextYaw = state.yaw + turnRate * dt;
  const alignFactor = Math.max(0.25, Math.cos(Math.min(Math.PI * 0.5, Math.abs(diff))));
  const cruiseSpd = Math.min(1.45, Math.max(0.28, dist * 1.85)) * alignFactor;

  const kSpd = 1 - Math.exp(-9.0 * dt);
  const nextSpeed = state.speed + (cruiseSpd - state.speed) * kSpd;
  const stepDist = Math.min(dist, nextSpeed * dt);
  const nx = state.x + (dx / dist) * stepDist;
  const nz = state.z + (dz / dist) * stepDist;

  return {
    ...state,
    isWalking: true,
    x: nx,
    z: nz,
    yaw: nextYaw,
    speed: nextSpeed,
    turnVel: turnRate,
    gaitDistance: state.gaitDistance + stepDist * 2.2,
    beaconPulse: (state.beaconPulse + dt * 1.8) % 1.0
  };
}

/**
 * Module 4: Global Hangar State Coordinator Rules
 */
export type HangarCoordinatedAction =
  | { type: 'enter_micro_fpv' }
  | { type: 'exit_micro_fpv' }
  | { type: 'change_clip_ratio'; clipRatio: number }
  | {
      type: 'enter_standalone_mode';
      mode: 'skeleton' | 'sls_print' | 'push_test' | 'mpc_walk' | 'shipbreaker';
    };

export interface HangarCoordinatorSnapshot {
  explosion: number;
  clipRatio: number;
  autoSectionScan: boolean;
  autoDisassembly: boolean;
  microFpvActive: boolean;
  isolatedPart: string | null;
}

export const MICRO_FPV_SAFE_EXPLOSION_RATIO = 0.18;

export function reconcileHangarStateTransition(
  current: HangarCoordinatorSnapshot,
  action: HangarCoordinatedAction
): HangarCoordinatorSnapshot {
  if (action.type === 'enter_micro_fpv') {
    // Smoothly reset Optical Sectioning to 1.0 and clamp Explosion to 18% micro-gap (never 100% black void!)
    return {
      ...current,
      microFpvActive: true,
      clipRatio: 1.0,
      autoSectionScan: false,
      autoDisassembly: false,
      isolatedPart: null,
      explosion: MICRO_FPV_SAFE_EXPLOSION_RATIO
    };
  }

  if (action.type === 'exit_micro_fpv') {
    return {
      ...current,
      microFpvActive: false,
      explosion: current.explosion <= MICRO_FPV_SAFE_EXPLOSION_RATIO + 0.02 ? 0 : current.explosion
    };
  }

  if (action.type === 'change_clip_ratio') {
    return {
      ...current,
      clipRatio: Math.max(0.05, Math.min(1.0, action.clipRatio)),
      autoSectionScan: false,
      microFpvActive: false
    };
  }

  // Standalone mode activation smoothly resets active Optical Sectioning plane back to 1.0!
  return {
    ...current,
    clipRatio: 1.0,
    autoSectionScan: false,
    microFpvActive: false,
    isolatedPart: null
  };
}

/**
 * Whenever Optical Sectioning cuts into the model (clipRatio < 0.99 or autoSectionScan),
 * automatically reveal the internal cyan URDF kinematic skeleton & energy arteries inside the cut!
 */
export function shouldAutoRevealInternalSkeleton(
  showSkeletonToggle: boolean,
  curClipRatio: number,
  autoSectionScan: boolean,
  isolatedPart: string | null,
  schlierenMode: boolean
): boolean {
  if (isolatedPart || schlierenMode) return false;
  const isSectionSliced = curClipRatio < 0.985 || autoSectionScan;
  return showSkeletonToggle || isSectionSliced;
}

/**
 * Computes safe world-BBox exterior + 18% primary micro-gap FPV inspection waypoints
 * guaranteed never to fly through solid unexploded centers or distant empty void.
 */
export function buildSafeWorldBBoxFpvWaypoints(
  contextId: string,
  bboxMin: [number, number, number],
  bboxMax: [number, number, number]
): { points: [number, number, number][]; labels: string[] } {
  const cx = (bboxMin[0] + bboxMax[0]) * 0.5;
  const cy = (bboxMin[1] + bboxMax[1]) * 0.5;
  const cz = (bboxMin[2] + bboxMax[2]) * 0.5;
  const rx = Math.max(0.38, (bboxMax[0] - bboxMin[0]) * 0.5);
  const ry = Math.max(0.32, (bboxMax[1] - bboxMin[1]) * 0.5);
  const rz = Math.max(0.38, (bboxMax[2] - bboxMin[2]) * 0.5);
  const isAero = contextId.toLowerCase().includes('cfm56') || contextId.toLowerCase().includes('b737');

  if (isAero) {
    return {
      points: [
        [cx - rx * 1.45, cy + ry * 0.22, cz + rz * 0.85],
        [cx - rx * 0.65, cy + ry * 0.55, cz + rz * 1.18],
        [cx + rx * 0.15, cy + ry * 0.68, cz + rz * 1.12],
        [cx + rx * 1.15, cy + ry * 0.35, cz + rz * 0.85],
        [cx + rx * 1.42, cy + ry * 0.52, cz - rz * 0.55],
        [cx + rx * 0.18, cy + ry * 0.92, cz - rz * 1.12],
        [cx - rx * 0.88, cy + ry * 0.62, cz - rz * 0.95],
        [cx - rx * 1.38, cy + ry * 0.32, cz - rz * 0.08]
      ],
      labels: [
        '进气唇口安全净空切入',
        '18% 微爆甲外涵道缝隙掠航',
        '反推罩与高压机匣主缝巡检',
        '锯齿尾喷管热端侧翼脱离',
        '大坡度战术爬升回转',
        '背部吊挂与齿轮箱俯瞰',
        '左舷附件管路近距检视',
        '对准进气道走廊闭环巡航'
      ]
    };
  }

  return {
    points: [
      [cx + rx * 1.35, bboxMin[1] + ry * 0.65, cz + rz * 1.25],
      [cx + rx * 1.18, cy + ry * 0.25, cz + rz * 0.35],
      [cx + rx * 0.55, bboxMax[1] + ry * 0.32, cz - rz * 0.65],
      [cx - rx * 0.55, bboxMax[1] + ry * 0.36, cz - rz * 0.95],
      [cx - rx * 1.28, cy + ry * 0.28, cz - rz * 0.25],
      [cx - rx * 1.15, bboxMin[1] + ry * 0.68, cz + rz * 0.95],
      [cx - rx * 0.18, cy + ry * 0.38, cz + rz * 1.32],
      [cx + rx * 0.78, cy + ry * 0.45, cz + rz * 1.28]
    ],
    labels: [
      '右前侧翼近距切入机体包络',
      '沿 18% 微拆解主装甲缝隙巡航',
      '攀升掠过肩部关节与云台雷达',
      '背部主控舱与散热鳍片近距检视',
      '左翼执行器与机械臂外侧绕飞',
      '下潜巡检髋膝谐波减速器总成',
      '正面光学面罩与激光雷达近掠',
      '平滑回切右翼微距走廊'
    ]
  };
}
