import { SandboxDomain, sampleLandTerrainHeight, sampleSeabedHeight } from './actionSandboxEngine';

// ============================================================================
// MODULE 1: BULLET-TIME (0.01x) MID-AIR EXPLOSION & SANDEVISTAN 4D STROBE
// ============================================================================

export interface BulletTimeState {
  active: boolean;
  /** Simulation time scale: 1.0 normal -> 0.01x suspended bullet-time */
  simTimeScale: number;
  /** Mid-air 4-stage orthogonal explosion progress 0..1 */
  explosionProgress: number;
  /** Target explosion set automatically to 0.88 on Tab or overridden by user slider */
  explosionTarget: number;
  /** Slow orbital inspection angle (radians) around frozen mid-air vehicle */
  orbitYawOffset: number;
}

export function createInitialBulletTimeState(): BulletTimeState {
  return {
    active: false,
    simTimeScale: 1.0,
    explosionProgress: 0,
    explosionTarget: 0,
    orbitYawOffset: 0
  };
}

export function stepBulletTimeController(
  prev: BulletTimeState,
  realDt: number
): BulletTimeState {
  const dt = Math.max(0.001, Math.min(0.08, realDt));
  const targetScale = prev.active ? 0.01 : 1.0;
  const lambdaScale = prev.active ? 18.0 : 14.0;
  const simTimeScale =
    prev.simTimeScale + (targetScale - prev.simTimeScale) * (1 - Math.exp(-lambdaScale * dt));

  // Fast crisp snap-back (lambda 16) when exiting Bullet-Time (`咔嚓收拢咬合`), smooth peel-out (lambda 5.5) when entering
  const targetExp = prev.active ? prev.explosionTarget : 0.0;
  const lambdaExp = prev.active ? 5.2 : 16.5;
  let explosionProgress =
    prev.explosionProgress + (targetExp - prev.explosionProgress) * (1 - Math.exp(-lambdaExp * dt));
  if (explosionProgress < 0.002 && !prev.active) explosionProgress = 0;

  const orbitYawOffset = prev.active
    ? prev.orbitYawOffset + dt * 0.48
    : prev.orbitYawOffset * Math.exp(-8.0 * dt);

  return {
    active: prev.active,
    simTimeScale,
    explosionProgress,
    explosionTarget: prev.explosionTarget,
    orbitYawOffset
  };
}

export interface StrobeSlotState {
  active: boolean;
  age: number;
  maxAge: number;
  /** 0..1 normalized age for cyan -> violet -> magenta chromatic shift */
  ageNorm: number;
  opacity: number;
}

export interface ChronoStrobeSchedulerState {
  cooldown: number;
  nextSlotIdx: number;
  slots: StrobeSlotState[];
}

export function createChronoStrobeScheduler(slotCount: number = 3): ChronoStrobeSchedulerState {
  const cappedSlots = Math.max(1, Math.min(3, slotCount));
  const slots: StrobeSlotState[] = [];
  for (let i = 0; i < cappedSlots; i++) {
    slots.push({ active: false, age: 0, maxAge: 0.66, ageNorm: 0, opacity: 0 });
  }
  return {
    cooldown: 0,
    nextSlotIdx: 0,
    slots
  };
}

/**
 * Advances the Sandevistan 4D Chrono-Pose Strobe Trail scheduler.
 * Emits `captureSlotIndex >= 0` every 0.22s (<= 3 ghosts simultaneously) when strobeEnabled && isManeuvering,
 * capping peak opacity at <= 0.14 so ghosts form crisp Fresnel silhouettes instead of a white blob.
 */
export function stepChronoStrobeScheduler(
  prev: ChronoStrobeSchedulerState,
  dt: number,
  strobeEnabled: boolean,
  isManeuvering: boolean
): { next: ChronoStrobeSchedulerState; captureSlotIndex: number } {
  const safeDt = Math.max(0, Math.min(0.08, dt));
  const slots = prev.slots.map((s) => {
    if (!s.active) return s;
    const age = s.age + safeDt;
    if (age >= s.maxAge) {
      return { ...s, active: false, age: s.maxAge, ageNorm: 1, opacity: 0 };
    }
    const ageNorm = age / s.maxAge;
    const opacity = Math.pow(1 - ageNorm, 1.55) * 0.14;
    return { ...s, age, ageNorm, opacity };
  });

  let cooldown = Math.max(0, prev.cooldown - safeDt);
  let nextSlotIdx = prev.nextSlotIdx;
  let captureSlotIndex = -1;

  if (strobeEnabled && isManeuvering && cooldown <= 0) {
    captureSlotIndex = nextSlotIdx % slots.length;
    slots[captureSlotIndex] = {
      active: true,
      age: 0,
      maxAge: 0.66,
      ageNorm: 0,
      opacity: 0.14
    };
    nextSlotIdx = (captureSlotIndex + 1) % slots.length;
    cooldown = 0.22;
  }

  return {
    next: { cooldown, nextSlotIdx, slots },
    captureSlotIndex
  };
}

// ============================================================================
// MODULE 2: REAL-TIME BATTLE DAMAGE / FAULT INJECTION & LIMP-HOME CONTROL
// ============================================================================

export type FaultSubsystemKind =
  | 'limb_fl'
  | 'limb_fr'
  | 'limb_rl'
  | 'limb_rr'
  | 'limb_left'
  | 'limb_right'
  | 'thruster'
  | 'compressor_surge'
  | 'manipulator';

export interface ActiveFaultRecord {
  partName: string;
  kind: FaultSubsystemKind;
  injectedAtSimTime: number;
  alertTitle: string;
  compensationLaw: string;
}

export function classifyFaultSubsystem(
  actorId: string,
  partName: string,
  domain: SandboxDomain
): { kind: FaultSubsystemKind; alertTitle: string; compensationLaw: string } {
  const n = partName.toLowerCase();

  if (domain === 'air' || actorId === 'b737_cfm56' || actorId === 'b737_bridge') {
    return {
      kind: 'compressor_surge',
      alertTitle: 'CRITICAL FAULT: HPC COMPRESSOR SURGE',
      compensationLaw: 'FADEC 断油防喘 + 蓝色哈龙灭火喷射'
    };
  }

  if (domain === 'sea' || actorId === 'bluerov2' || actorId === 'rexrov2') {
    return {
      kind: 'thruster',
      alertTitle: 'CRITICAL FAULT: THRUSTER ROTOR LOCKED',
      compensationLaw: '控制分配矩阵重构 · 5/7推力矢量增稳恢复定深'
    };
  }

  if (n.startsWith('fl_') || (n.includes('front') && n.includes('left'))) {
    return {
      kind: 'limb_fl',
      alertTitle: 'CRITICAL FAULT: FL ACTUATOR LOCKED',
      compensationLaw: '左前肢锁死抬起 · 三足非对称跳跃跛行容错步态'
    };
  }
  if (n.startsWith('fr_') || (n.includes('front') && n.includes('right'))) {
    return {
      kind: 'limb_fr',
      alertTitle: 'CRITICAL FAULT: FR ACTUATOR LOCKED',
      compensationLaw: '右前肢锁死抬起 · 三足非对称跳跃跛行容错步态'
    };
  }
  if (n.startsWith('rl_') || (n.includes('back') && n.includes('left')) || n.includes('rl_')) {
    return {
      kind: 'limb_rl',
      alertTitle: 'CRITICAL FAULT: RL ACTUATOR LOCKED',
      compensationLaw: '左后肢锁死抬起 · 三足非对称跳跃跛行容错步态'
    };
  }
  if (n.startsWith('rr_') || (n.includes('back') && n.includes('right')) || n.includes('rr_')) {
    return {
      kind: 'limb_rr',
      alertTitle: 'CRITICAL FAULT: RR ACTUATOR LOCKED',
      compensationLaw: '右后肢锁死抬起 · 三足非对称跳跃跛行容错步态'
    };
  }
  if (n.includes('left')) {
    return {
      kind: 'limb_left',
      alertTitle: 'CRITICAL FAULT: PORT DRIVE/LEG LOCKED',
      compensationLaw: '左侧执行器锁死 · 差速偏航补偿与单侧跛行越障'
    };
  }
  if (n.includes('right')) {
    return {
      kind: 'limb_right',
      alertTitle: 'CRITICAL FAULT: STBD DRIVE/LEG LOCKED',
      compensationLaw: '右侧执行器锁死 · 差速偏航补偿与单侧跛行越障'
    };
  }

  // Default to front-left limb fault on land vehicles so limp-home gait is dramatically visible!
  return {
    kind: 'limb_fl',
    alertTitle: 'CRITICAL FAULT: ACTUATOR JAMMED',
    compensationLaw: '容错控制重构 · 非对称跛行补偿推进'
  };
}

/**
 * Computes fault-tolerant kinematic attitude & motion perturbations:
 * - Land: Asymmetric 3-leg hopping limp bob + side roll lean while stubbornly maintaining forward progress
 * - Sea: 0.95s severe roll destabilization transient -> smooth thruster reallocation depth stabilization
 * - Air: 1.2s violent compressor surge backfire -> fuel-cut safe windmill glide + Halon extinguishing active
 */
export function computeFaultTolerantAttitudeOffsets(
  faults: ActiveFaultRecord[],
  simTime: number,
  gaitDistance: number,
  speed: number,
  domain: SandboxDomain
): {
  hopYOffset: number;
  rollOffset: number;
  pitchOffset: number;
  speedMultiplier: number;
  surgeBackfireActive: boolean;
  halonSprayActive: boolean;
  rovReallocated: boolean;
} {
  if (faults.length === 0) {
    return {
      hopYOffset: 0,
      rollOffset: 0,
      pitchOffset: 0,
      speedMultiplier: 1.0,
      surgeBackfireActive: false,
      halonSprayActive: false,
      rovReallocated: false
    };
  }

  const latest = faults[faults.length - 1];
  const elapsed = Math.max(0, simTime - latest.injectedAtSimTime);

  if (domain === 'air') {
    const surgeBackfireActive = elapsed < 1.25;
    const halonSprayActive = elapsed >= 0.45 && elapsed < 6.5;
    const surgeShake = surgeBackfireActive ? Math.sin(simTime * 48) * 0.16 : 0;
    return {
      hopYOffset: surgeShake * 0.4,
      rollOffset: surgeShake,
      pitchOffset: surgeBackfireActive ? 0.12 * Math.cos(simTime * 38) : -0.05,
      speedMultiplier: 0.62, // Safe windmill thrust after fuel/oil cutoff
      surgeBackfireActive,
      halonSprayActive,
      rovReallocated: false
    };
  }

  if (domain === 'sea') {
    // 0 -> 1.0s: severe uncommanded roll/heave transient; > 1.0s: reallocation matrix damps roll back to 0!
    const transientEnv = Math.exp(-elapsed * 1.85);
    const rollOffset = Math.sin(elapsed * 11.5) * 0.48 * transientEnv;
    const hopYOffset = -0.32 * transientEnv + (elapsed >= 0.8 ? Math.sin(simTime * 3.2) * 0.03 : 0);
    return {
      hopYOffset,
      rollOffset,
      pitchOffset: 0.18 * transientEnv,
      speedMultiplier: 0.86,
      surgeBackfireActive: false,
      halonSprayActive: false,
      rovReallocated: elapsed >= 0.65
    };
  }

  // Land domain: Asymmetric 3-legged hopping limp gait / differential tracked lurch!
  const isMoving = Math.abs(speed) > 0.25;
  const hopPhase = gaitDistance * 3.1;
  const hopPulse = isMoving ? Math.max(0, Math.sin(hopPhase)) : 0;
  const leanSign =
    latest.kind === 'limb_fl' || latest.kind === 'limb_rl' || latest.kind === 'limb_left' ? 1 : -1;

  return {
    hopYOffset: hopPulse * 0.22,
    rollOffset: leanSign * (0.14 + hopPulse * 0.16),
    pitchOffset: -0.08 + hopPulse * 0.15,
    speedMultiplier: 0.78, // Stubbornly keeps advancing at 78% speed!
    surgeBackfireActive: false,
    halonSprayActive: false,
    rovReallocated: false
  };
}

/**
 * Overrides URDF joint angle when a fault is active:
 * - Damaged limb locks stiffly raised off the terrain so it visibly drags/lifts its broken leg!
 * - Healthy limbs amplify their stride + hop push to compensate!
 * - Damaged ROV thruster freezes at 0 while healthy thrusters spin 1.75x faster!
 */
export function applyFaultToUrdfJointAngle(
  nominalAngle: number,
  jointName: string,
  jointIndex: number,
  faults: ActiveFaultRecord[],
  simTime: number,
  gaitDistance: number
): number {
  if (faults.length === 0) return nominalAngle;
  const n = jointName.toLowerCase();

  for (const f of faults) {
    if (f.kind === 'thruster') {
      // Freeze thruster #0 (or matching thruster), boost all remaining thrusters 1.75x!
      if (n.includes(f.partName.toLowerCase()) || jointIndex === 0) {
        return 0.0; // Dead locked rotor!
      }
      if (n.includes('thruster') || n.includes('prop')) {
        const fastWrap = (nominalAngle * 1.75 + simTime * 6.0) % (Math.PI * 2);
        return fastWrap > Math.PI ? fastWrap - Math.PI * 2 : fastWrap;
      }
    }

    const matchesBrokenLimb =
      (f.kind === 'limb_fl' && (n.startsWith('fl_') || (n.includes('front') && n.includes('left')))) ||
      (f.kind === 'limb_fr' && (n.startsWith('fr_') || (n.includes('front') && n.includes('right')))) ||
      (f.kind === 'limb_rl' && (n.startsWith('rl_') || (n.includes('back') && n.includes('left')))) ||
      (f.kind === 'limb_rr' && (n.startsWith('rr_') || (n.includes('back') && n.includes('right')))) ||
      (f.kind === 'limb_left' && n.includes('left') && (n.includes('hip') || n.includes('knee') || n.includes('ankle') || n.includes('front'))) ||
      (f.kind === 'limb_right' && n.includes('right') && (n.includes('hip') || n.includes('knee') || n.includes('ankle') || n.includes('front')));

    if (matchesBrokenLimb) {
      // Lock the damaged leg/flipper stiffly tucked upward!
      if (n.includes('thigh') || n.includes('hip_pitch')) return 1.18;
      if (n.includes('calf') || n.includes('knee')) return -2.05;
      if (n.includes('f_front') || n.includes('f_back') || n.includes('flipper')) return 0.78;
      return 0.45;
    }
  }

  // Healthy limbs execute deeper, high-effort hopping limp thrusts!
  const limpBoost = Math.sin(gaitDistance * 3.1) * 0.22;
  return nominalAngle * 1.22 + limpBoost;
}

/**
 * Computes severe multi-harmonic bus jitter [0..1] for the 60Hz Oscilloscope when any fault is active.
 */
export function computeFaultOscilloscopeHarmonic(
  nominalValue: number,
  simTime: number,
  faultActive: boolean,
  channelIndex: number
): number {
  if (!faultActive) return nominalValue;
  const harmonic =
    Math.sin(simTime * 63.0 + channelIndex * 2.1) * 0.26 +
    Math.cos(simTime * 117.0 - channelIndex * 1.4) * 0.17 +
    (Math.sin(simTime * 193.0) > 0.65 ? 0.22 : -0.12);
  return Math.max(0.04, Math.min(0.98, nominalValue + harmonic));
}

// ============================================================================
// MODULE 3: MULTI-GLB SWARM FORMATION & LINK-16 / UMBILICAL TETHER MATH
// ============================================================================

export type KillChainPhase = 0 | 1 | 2 | 3;

export interface SwarmWingmanPose {
  actorId: string;
  roleLabel: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  gaitDistance: number;
  isFiring: boolean;
  isScanning: boolean;
}

export interface SwarmTacticalState {
  phase: KillChainPhase;
  phaseLabel: string;
  phaseProgress: number; // 0..1 within current phase
  wingmen: SwarmWingmanPose[];
  lockedTargetWorld: [number, number, number];
}

/**
 * Computes coordinated multi-GLB swarm poses & 4-stage closed-loop Link-16 kill-chain state:
 * - Land: Triangle formation (Go2 Vanguard Scout + SAR Heavy Laser + G1 Bipedal Assault)
 * - Sea: RexROV2 Mother + BlueROV2 Forward Scout connected via flexible catenary umbilical
 * - Air: Twin-pod echelon supersonic formation
 */
export function evaluateSwarmTacticalState(
  leadActorId: string,
  domain: SandboxDomain,
  leadX: number,
  leadY: number,
  leadZ: number,
  leadYaw: number,
  leadGaitDist: number,
  simTime: number,
  nearestTarget: [number, number, number]
): SwarmTacticalState {
  const cyclePeriod = 8.0; // Full 4-stage tactical kill-chain every 8s
  const cycleT = simTime % cyclePeriod;
  const phase = Math.min(3, Math.floor((cycleT / cyclePeriod) * 4)) as KillChainPhase;
  const phaseProgress = ((cycleT / cyclePeriod) * 4) % 1;

  const fx = Math.cos(leadYaw);
  const fz = Math.sin(leadYaw);
  const rx = -fz;
  const rz = fx;

  if (domain === 'sea') {
    const partnerId = leadActorId === 'bluerov2' ? 'rexrov2' : 'bluerov2';
    const isPartnerScout = partnerId === 'bluerov2';
    // Scout swims ahead-right (+5.2m fwd, +2.6m stbd) sweeping trench; Mother holds overwatch behind-left
    const fwdOff = isPartnerScout ? 5.2 + Math.sin(simTime * 0.9) * 0.8 : -5.4;
    const sideOff = isPartnerScout ? 2.4 + Math.cos(simTime * 0.7) * 0.9 : -2.4;
    const wx = leadX + fx * fwdOff + rx * sideOff;
    const wz = leadZ + fz * fwdOff + rz * sideOff;
    const seabed = sampleSeabedHeight(wx, wz) + 1.15;
    const wy = Math.max(seabed, leadY + (isPartnerScout ? -0.45 : 0.65) + Math.sin(simTime * 1.6) * 0.22);

    const seaLabels: Record<KillChainPhase, string> = {
      0: '子母协同 I · BlueROV2 前出 Ping360 声呐扫图打光',
      1: '子母协同 II · 光纤脐带缆实时回传深海海沟三维点云',
      2: '子母协同 III · RexROV2 母机发射深海声呐探测信标',
      3: '子母协同 IV · Oberon7 七轴液压机械臂前伸协同采样'
    };

    return {
      phase,
      phaseLabel: seaLabels[phase],
      phaseProgress,
      lockedTargetWorld: nearestTarget,
      wingmen: [
        {
          actorId: partnerId,
          roleLabel: isPartnerScout ? 'BlueROV2 侦察子机' : 'RexROV2 重装母机',
          x: wx,
          y: wy,
          z: wz,
          yaw: leadYaw + Math.sin(simTime * 0.8) * 0.14,
          pitch: 0.04 * Math.cos(simTime * 1.5),
          roll: 0.06 * Math.sin(simTime * 1.2),
          gaitDistance: leadGaitDist + simTime * 2.2,
          isFiring: phase === 2 || phase === 3,
          isScanning: phase === 0 || phase === 1
        }
      ]
    };
  }

  if (domain === 'air') {
    const wx = leadX - fx * 4.2 + rx * 4.6;
    const wz = leadZ - fz * 4.2 + rz * 4.6;
    const wy = leadY + 1.1 + Math.sin(simTime * 2.1) * 0.35;
    return {
      phase,
      phaseLabel: '双机超音速梯队 · Link-16 编队火控同步中',
      phaseProgress,
      lockedTargetWorld: nearestTarget,
      wingmen: [
        {
          actorId: 'b737_cfm56',
          roleLabel: 'CFM56 僚机试车舱 #02',
          x: wx,
          y: wy,
          z: wz,
          yaw: leadYaw,
          pitch: 0,
          roll: Math.sin(simTime * 1.4) * 0.12,
          gaitDistance: leadGaitDist,
          isFiring: phase === 2,
          isScanning: phase === 0
        }
      ]
    };
  }

  // LAND UNMANNED ASSAULT TRIANGLE SWARM: Ensure Go2 + SAR + G1 are all present!
  const roster = ['unitree_go2', 'sar', 'unitree_g1'];
  const wingIds = roster.filter((id) => id !== leadActorId).slice(0, 2);
  // If leadActorId was mars2020 or unitree_z1, pick Go2 and G1 (or Go2 and SAR)
  const wLeftId = wingIds[0] || 'unitree_go2';
  const wRightId = wingIds[1] || 'unitree_g1';

  const roleMap: Record<string, string> = {
    unitree_go2: 'Go2 前哨侦察犬',
    sar: 'SAR 重装激光车',
    unitree_g1: 'G1 具身突击人形'
  };

  // Left-forward vanguard flank (+3.4m fwd, -3.2m left) & Right-forward assault flank (+2.8m fwd, +3.4m right)
  const lungeLeft = wLeftId === 'unitree_g1' && phase === 3 ? 2.2 * Math.sin(phaseProgress * Math.PI) : 0;
  const lungeRight = wRightId === 'unitree_g1' && phase === 3 ? 2.2 * Math.sin(phaseProgress * Math.PI) : 0;

  const lx = leadX + fx * (3.4 + lungeLeft) - rx * 3.2;
  const lz = leadZ + fz * (3.4 + lungeLeft) - rz * 3.2;
  const ly = sampleLandTerrainHeight(lx, lz);

  const rxPos = leadX + fx * (2.6 + lungeRight) + rx * 3.3;
  const rzPos = leadZ + fz * (2.6 + lungeRight) + rz * 3.3;
  const ryPos = sampleLandTerrainHeight(rxPos, rzPos);

  const yawToTarget = (x: number, z: number) =>
    Math.atan2(nearestTarget[2] - z, nearestTarget[0] - x);

  const landLabels: Record<KillChainPhase, string> = {
    0: '杀伤链 I · 宇树 Go2 前哨激光雷达广域锁敌',
    1: '杀伤链 II · DDS / Link-16 战术数据链秒传火控坐标',
    2: '杀伤链 III · 履带搜救车转向齐射高能破岩脉冲激光',
    3: '杀伤链 IV · 宇树 G1 人形侧翼高速突进释放全息 EMP'
  };

  return {
    phase,
    phaseLabel: landLabels[phase],
    phaseProgress,
    lockedTargetWorld: nearestTarget,
    wingmen: [
      {
        actorId: wLeftId,
        roleLabel: roleMap[wLeftId] || wLeftId,
        x: lx,
        y: ly,
        z: lz,
        yaw: phase >= 2 ? yawToTarget(lx, lz) : leadYaw,
        pitch: 0,
        roll: 0,
        gaitDistance: leadGaitDist + simTime * 1.8,
        isFiring: (wLeftId === 'sar' && phase === 2) || (wLeftId === 'unitree_g1' && phase === 3),
        isScanning: wLeftId === 'unitree_go2' && phase === 0
      },
      {
        actorId: wRightId,
        roleLabel: roleMap[wRightId] || wRightId,
        x: rxPos,
        y: ryPos,
        z: rzPos,
        yaw: phase >= 2 ? yawToTarget(rxPos, rzPos) : leadYaw,
        pitch: 0,
        roll: 0,
        gaitDistance: leadGaitDist + simTime * 1.8 + 1.1,
        isFiring: (wRightId === 'sar' && phase === 2) || (wRightId === 'unitree_g1' && phase === 3),
        isScanning: wRightId === 'unitree_go2' && phase === 0
      }
    ]
  };
}

/**
 * Computes a realistic 3D hydrodynamic Catenary Umbilical Tether between Mother ROV and Daughter ROV,
 * with gravity/buoyancy sag + ocean-current sinusoidal sway.
 */
export function computeCatenaryUmbilicalPoints(
  start: [number, number, number],
  end: [number, number, number],
  simTime: number,
  segments: number = 24
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const span = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const sagAmp = Math.min(1.85, Math.max(0.35, span * 0.18));

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const env = Math.sin(u * Math.PI); // Zero at both bulkhead sockets, max in middle!
    // Parabolic/catenary sag + gentle underwater current sway
    const swayX = Math.sin(simTime * 2.1 + u * 5.2) * 0.24 * env;
    const swayZ = Math.cos(simTime * 1.7 + u * 4.6) * 0.24 * env;
    const sagY = -sagAmp * env + Math.sin(simTime * 2.8 + u * 6.0) * 0.08 * env;

    pts.push([
      start[0] + (end[0] - start[0]) * u + swayX,
      start[1] + (end[1] - start[1]) * u + sagY,
      start[2] + (end[2] - start[2]) * u + swayZ
    ]);
  }
  return pts;
}

// ============================================================================
// MODULE 4: MACHINE-EYE NATIVE VISIONS (Pure LiDAR SLAM / FLIR White-Hot / Acoustic Echo)
// ============================================================================

export type SandboxVisionMode = 'normal' | 'slam' | 'flir' | 'acoustic';

/**
 * Maps elevation (meters) to high-contrast LiDAR SLAM rainbow height palette RGB [0..1].
 */
export function computeSlamElevationColor(heightMeters: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, (heightMeters + 3.5) / 9.5));
  if (u < 0.33) {
    const k = u / 0.33;
    return [0.05, 0.45 + 0.50 * k, 0.98 - 0.25 * k]; // Deep Azure -> Cyan
  }
  if (u < 0.66) {
    const k = (u - 0.33) / 0.33;
    return [0.10 + 0.85 * k, 0.95, 0.65 - 0.55 * k]; // Cyan -> Emerald -> Chartreuse
  }
  const k = (u - 0.66) / 0.34;
  return [0.98, 0.88 - 0.68 * k, 0.12 + 0.25 * k]; // Amber -> High-Elevation Crimson-Rose
}

/**
 * Maps component role & activity to Military FLIR White-Hot luminance [0..1]
 * (1.0 = incandescent white hot actuator/exhaust, 0.08 = cold regolith/seafloor).
 */
export function computeFlirWhiteHotLuminance(
  role: 'terrain' | 'obstacle' | 'robot_chassis' | 'robot_actuator' | 'exhaust_or_target',
  throttleNorm: number = 0.5
): number {
  switch (role) {
    case 'terrain':
      return 0.11;
    case 'obstacle':
      return 0.24;
    case 'robot_chassis':
      return 0.62;
    case 'robot_actuator':
      return Math.min(1.0, 0.78 + throttleNorm * 0.22);
    case 'exhaust_or_target':
      return 0.98;
  }
}
