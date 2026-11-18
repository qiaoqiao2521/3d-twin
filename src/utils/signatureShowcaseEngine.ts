import { UrdfJointDef } from './manifestUtils';
import { SandboxDomain } from './actionSandboxEngine';

// ============================================================================
// 1. MULTI-MODE EMBODIED LOCOMOTION & VECTOR DASH ENGINE (4 MODES PER ROBOT)
// ============================================================================

export type LocomotionModeId = 'standard' | 'assault' | 'agile' | 'acrobatic';

export interface LocomotionModeSpec {
  id: LocomotionModeId;
  keyHint: '1' | '2' | '3' | '4';
  shortLabel: string;
  fullTitle: string;
  speedMultiplier: number;
  turnMultiplier: number;
  strideFreqMultiplier: number;
  heightOffsetMeters: number;
  pitchBiasRad: number;
  rollBankMultiplier: number;
  lateralDriftFactor: number;
}

export interface VectorDashState {
  active: boolean;
  elapsed: number;
  duration: number;
  cooldown: number;
  dirX: number;
  dirZ: number;
  impulseSpeed: number;
  rollKickSign: number;
}

const ROBOT_LOCOMOTION_MODES: Record<string, LocomotionModeSpec[]> = {
  unitree_go2: [
    {
      id: 'standard',
      keyHint: '1',
      shortLabel: '对角小跑',
      fullTitle: '模态 1 · 对角稳态小跑 (Trotting)',
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      strideFreqMultiplier: 1.0,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.0,
      rollBankMultiplier: 1.0,
      lateralDriftFactor: 0.0
    },
    {
      id: 'assault',
      keyHint: '2',
      shortLabel: '奔袭跃进',
      fullTitle: '模态 2 · 四足飞跃疾驰 (Bounding Gallop)',
      speedMultiplier: 1.48,
      turnMultiplier: 0.88,
      strideFreqMultiplier: 1.38,
      heightOffsetMeters: 0.04,
      pitchBiasRad: -0.06,
      rollBankMultiplier: 1.35,
      lateralDriftFactor: 0.0
    },
    {
      id: 'agile',
      keyHint: '3',
      shortLabel: '匍匐潜行',
      fullTitle: '模态 3 · 低姿静默潜行 (Stealth Crawl)',
      speedMultiplier: 0.64,
      turnMultiplier: 1.45,
      strideFreqMultiplier: 0.78,
      heightOffsetMeters: -0.13,
      pitchBiasRad: 0.04,
      rollBankMultiplier: 0.5,
      lateralDriftFactor: 0.35
    },
    {
      id: 'acrobatic',
      keyHint: '4',
      shortLabel: '高姿越障',
      fullTitle: '模态 4 · 高抬腿攀岩越障 (Pronk Climb)',
      speedMultiplier: 1.12,
      turnMultiplier: 1.25,
      strideFreqMultiplier: 1.22,
      heightOffsetMeters: 0.09,
      pitchBiasRad: -0.04,
      rollBankMultiplier: 1.15,
      lateralDriftFactor: 0.18
    }
  ],
  unitree_g1: [
    {
      id: 'standard',
      keyHint: '1',
      shortLabel: '稳态双足',
      fullTitle: '模态 1 · 29-DOF 拟人稳态步态 (Biped Walk)',
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      strideFreqMultiplier: 1.0,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.0,
      rollBankMultiplier: 1.0,
      lateralDriftFactor: 0.0
    },
    {
      id: 'assault',
      keyHint: '2',
      shortLabel: '战术冲刺',
      fullTitle: '模态 2 · 前倾爆发奔跑 (Tactical Sprint)',
      speedMultiplier: 1.52,
      turnMultiplier: 0.92,
      strideFreqMultiplier: 1.42,
      heightOffsetMeters: -0.03,
      pitchBiasRad: 0.14,
      rollBankMultiplier: 1.3,
      lateralDriftFactor: 0.0
    },
    {
      id: 'agile',
      keyHint: '3',
      shortLabel: '滑步格斗',
      fullTitle: '模态 3 · 屈膝侧滑战术姿 (Combat Strafe)',
      speedMultiplier: 0.86,
      turnMultiplier: 1.55,
      strideFreqMultiplier: 1.15,
      heightOffsetMeters: -0.16,
      pitchBiasRad: 0.08,
      rollBankMultiplier: 0.75,
      lateralDriftFactor: 0.42
    },
    {
      id: 'acrobatic',
      keyHint: '4',
      shortLabel: '凌空跃击',
      fullTitle: '模态 4 · 反作用轮高弹跳姿 (Parkour Bound)',
      speedMultiplier: 1.24,
      turnMultiplier: 1.2,
      strideFreqMultiplier: 1.25,
      heightOffsetMeters: 0.06,
      pitchBiasRad: -0.05,
      rollBankMultiplier: 1.25,
      lateralDriftFactor: 0.15
    }
  ],
  sea_default: [
    {
      id: 'standard',
      keyHint: '1',
      shortLabel: '定深巡航',
      fullTitle: '模态 1 · 矢量推进定深巡航 (Depth Hold)',
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      strideFreqMultiplier: 1.0,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.0,
      rollBankMultiplier: 1.0,
      lateralDriftFactor: 0.0
    },
    {
      id: 'assault',
      keyHint: '2',
      shortLabel: '极速潜航',
      fullTitle: '模态 2 · 全推力流线突进 (Hydro Surge)',
      speedMultiplier: 1.55,
      turnMultiplier: 0.85,
      strideFreqMultiplier: 1.5,
      heightOffsetMeters: 0.0,
      pitchBiasRad: -0.09,
      rollBankMultiplier: 1.35,
      lateralDriftFactor: 0.0
    },
    {
      id: 'agile',
      keyHint: '3',
      shortLabel: '全向横移',
      fullTitle: '模态 3 · 6-DOF 侧推悬停检视 (Omni Strafe)',
      speedMultiplier: 0.82,
      turnMultiplier: 1.6,
      strideFreqMultiplier: 1.1,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.03,
      rollBankMultiplier: 0.6,
      lateralDriftFactor: 0.55
    },
    {
      id: 'acrobatic',
      keyHint: '4',
      shortLabel: '涡环机动',
      fullTitle: '模态 4 · 深海螺旋机动 (Vortex Roll)',
      speedMultiplier: 1.28,
      turnMultiplier: 1.35,
      strideFreqMultiplier: 1.35,
      heightOffsetMeters: 0.12,
      pitchBiasRad: 0.06,
      rollBankMultiplier: 2.1,
      lateralDriftFactor: 0.25
    }
  ],
  air_default: [
    {
      id: 'standard',
      keyHint: '1',
      shortLabel: '巡航编队',
      fullTitle: '模态 1 · 跨音速稳态巡航 (Transonic Cruise)',
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      strideFreqMultiplier: 1.0,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.0,
      rollBankMultiplier: 1.0,
      lateralDriftFactor: 0.0
    },
    {
      id: 'assault',
      keyHint: '2',
      shortLabel: '加力突防',
      fullTitle: '模态 2 · 全加力超音速突防 (Afterburner)',
      speedMultiplier: 1.52,
      turnMultiplier: 0.84,
      strideFreqMultiplier: 1.45,
      heightOffsetMeters: 0.0,
      pitchBiasRad: -0.05,
      rollBankMultiplier: 1.4,
      lateralDriftFactor: 0.0
    },
    {
      id: 'agile',
      keyHint: '3',
      shortLabel: '矢量侧滑',
      fullTitle: '模态 3 · 推力矢量高机动偏航 (Thrust Vector)',
      speedMultiplier: 0.92,
      turnMultiplier: 1.65,
      strideFreqMultiplier: 1.15,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.11,
      rollBankMultiplier: 1.75,
      lateralDriftFactor: 0.38
    },
    {
      id: 'acrobatic',
      keyHint: '4',
      shortLabel: '眼镜蛇姿',
      fullTitle: '模态 4 · 大迎角过失速机动 (High-Alpha)',
      speedMultiplier: 0.76,
      turnMultiplier: 1.45,
      strideFreqMultiplier: 1.25,
      heightOffsetMeters: 0.35,
      pitchBiasRad: 0.32,
      rollBankMultiplier: 1.5,
      lateralDriftFactor: 0.15
    }
  ],
  land_heavy: [
    {
      id: 'standard',
      keyHint: '1',
      shortLabel: '全地形巡航',
      fullTitle: '模态 1 · 摇臂/摆臂自适应巡航 (All-Terrain)',
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      strideFreqMultiplier: 1.0,
      heightOffsetMeters: 0.0,
      pitchBiasRad: 0.0,
      rollBankMultiplier: 1.0,
      lateralDriftFactor: 0.0
    },
    {
      id: 'assault',
      keyHint: '2',
      shortLabel: '强袭推进',
      fullTitle: '模态 2 · 高扭矩强袭突进 (Torque Surge)',
      speedMultiplier: 1.45,
      turnMultiplier: 0.9,
      strideFreqMultiplier: 1.35,
      heightOffsetMeters: 0.02,
      pitchBiasRad: -0.04,
      rollBankMultiplier: 1.2,
      lateralDriftFactor: 0.0
    },
    {
      id: 'agile',
      keyHint: '3',
      shortLabel: '超信地旋回',
      fullTitle: '模态 3 · 零半径差速精瞄 (Zero-Turn Pivot)',
      speedMultiplier: 0.72,
      turnMultiplier: 1.75,
      strideFreqMultiplier: 1.1,
      heightOffsetMeters: -0.04,
      pitchBiasRad: 0.02,
      rollBankMultiplier: 0.65,
      lateralDriftFactor: 0.2
    },
    {
      id: 'acrobatic',
      keyHint: '4',
      shortLabel: '高姿越障',
      fullTitle: '模态 4 · 悬架/摆臂抬升攀越 (High-Clearance)',
      speedMultiplier: 0.94,
      turnMultiplier: 1.18,
      strideFreqMultiplier: 1.2,
      heightOffsetMeters: 0.11,
      pitchBiasRad: -0.07,
      rollBankMultiplier: 1.1,
      lateralDriftFactor: 0.0
    }
  ]
};

export function getLocomotionModesForRobot(
  robotId: string,
  domain: SandboxDomain = 'land'
): LocomotionModeSpec[] {
  if (robotId === 'unitree_go2') return ROBOT_LOCOMOTION_MODES.unitree_go2;
  if (robotId === 'unitree_g1') return ROBOT_LOCOMOTION_MODES.unitree_g1;
  if (domain === 'sea' || robotId === 'bluerov2' || robotId === 'rexrov2') {
    return ROBOT_LOCOMOTION_MODES.sea_default;
  }
  if (domain === 'air' || robotId === 'b737_cfm56') {
    return ROBOT_LOCOMOTION_MODES.air_default;
  }
  return ROBOT_LOCOMOTION_MODES.land_heavy;
}

export function getLocomotionModeSpec(
  robotId: string,
  domain: SandboxDomain,
  modeId: LocomotionModeId
): LocomotionModeSpec {
  const list = getLocomotionModesForRobot(robotId, domain);
  return list.find((m) => m.id === modeId) || list[0];
}

export function cycleLocomotionMode(current: LocomotionModeId): LocomotionModeId {
  const order: LocomotionModeId[] = ['standard', 'assault', 'agile', 'acrobatic'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export function computeLocomotionUrdfJointDelta(
  robotId: string,
  joint: UrdfJointDef,
  modeId: LocomotionModeId,
  gaitDistance: number,
  simTime: number
): number {
  if (modeId === 'standard') return 0;
  const n = joint.name.toLowerCase();

  if (robotId === 'unitree_go2') {
    const isFront = n.startsWith('fl_') || n.startsWith('fr_');
    const boundPhase = Math.sin(gaitDistance * 3.1 + (isFront ? 0 : Math.PI));
    if (modeId === 'assault') {
      if (n.includes('thigh')) return boundPhase * 0.34 - 0.08;
      if (n.includes('calf')) return -boundPhase * 0.42 + 0.12;
    } else if (modeId === 'agile') {
      if (n.includes('thigh')) return 0.38;
      if (n.includes('calf')) return -0.52;
      if (n.includes('hip')) return (n.startsWith('fl_') || n.startsWith('rl_') ? 1 : -1) * 0.14;
    } else if (modeId === 'acrobatic') {
      const highStep = Math.max(0, Math.sin(gaitDistance * 3.6 + (isFront ? 0.5 : -0.5)));
      if (n.includes('thigh')) return -0.18 + highStep * 0.46;
      if (n.includes('calf')) return 0.16 - highStep * 0.58;
    }
  } else if (robotId === 'unitree_g1') {
    const isLeft = n.includes('left');
    const phase = gaitDistance * 2.8 + (isLeft ? 0 : Math.PI);
    if (modeId === 'assault') {
      if (n.includes('waist_pitch') || n.includes('torso')) return 0.22;
      if (n.includes('hip_pitch')) return Math.sin(phase) * 0.32 - 0.12;
      if (n.includes('knee')) return Math.max(0, -Math.sin(phase)) * 0.45 + 0.12;
      if (n.includes('shoulder_pitch')) return -Math.sin(phase) * 0.48;
      if (n.includes('elbow')) return -0.55;
    } else if (modeId === 'agile') {
      if (n.includes('hip_pitch')) return -0.36;
      if (n.includes('knee')) return 0.68;
      if (n.includes('ankle_pitch')) return -0.32;
      if (n.includes('shoulder_pitch')) return -0.45;
      if (n.includes('elbow')) return -0.75;
    } else if (modeId === 'acrobatic') {
      const hop = Math.sin(simTime * 5.2);
      if (n.includes('hip_pitch')) return -0.22 + hop * 0.24;
      if (n.includes('knee')) return 0.38 - hop * 0.28;
      if (n.includes('shoulder_roll')) return (isLeft ? 1 : -1) * 0.32;
    }
  } else if (robotId === 'sar' || robotId === 'mars2020') {
    if (modeId === 'acrobatic') {
      if (n.includes('flipper') || n.includes('f_front') || n.includes('rocker')) {
        return -0.42 + Math.sin(simTime * 3.0) * 0.12;
      }
    } else if (modeId === 'assault') {
      if (n.includes('flipper') || n.includes('f_back')) return 0.22;
    }
  } else if (robotId === 'unitree_z1') {
    if (modeId === 'assault' && n.includes('joint2')) return 0.35;
    if (modeId === 'acrobatic' && n.includes('joint3')) return Math.sin(simTime * 4.2) * 0.48;
  }
  return 0;
}

export function createInitialVectorDashState(): VectorDashState {
  return {
    active: false,
    elapsed: 0,
    duration: 0.34,
    cooldown: 0,
    dirX: 1,
    dirZ: 0,
    impulseSpeed: 0,
    rollKickSign: 1
  };
}

export function triggerVectorDash(
  state: VectorDashState,
  yaw: number,
  strafeSign: number,
  baseBoostSpeed: number
): VectorDashState {
  if (state.cooldown > 0.02) return state;
  const dashAngle = yaw + strafeSign * (Math.PI * 0.42);
  return {
    active: true,
    elapsed: 0,
    duration: 0.34,
    cooldown: 0.85,
    dirX: Math.cos(dashAngle),
    dirZ: Math.sin(dashAngle),
    impulseSpeed: Math.max(10, baseBoostSpeed * 1.65),
    rollKickSign: strafeSign !== 0 ? strafeSign : 1
  };
}

export function stepVectorDash(
  state: VectorDashState,
  dt: number
): { next: VectorDashState; dispX: number; dispZ: number; rollOffset: number } {
  const nextCooldown = Math.max(0, state.cooldown - dt);
  if (!state.active || dt <= 0) {
    return {
      next: { ...state, cooldown: nextCooldown },
      dispX: 0,
      dispZ: 0,
      rollOffset: 0
    };
  }
  const elapsed = state.elapsed + dt;
  const u = Math.min(1, elapsed / Math.max(0.05, state.duration));
  const envelope = Math.sin(u * Math.PI);
  const speedNow = state.impulseSpeed * envelope;
  const active = elapsed < state.duration;
  return {
    next: {
      ...state,
      active,
      elapsed: active ? elapsed : 0,
      cooldown: nextCooldown
    },
    dispX: state.dirX * speedNow * dt,
    dispZ: state.dirZ * speedNow * dt,
    rollOffset: state.rollKickSign * envelope * 0.28
  };
}

// ============================================================================
// 2. SIGNATURE "ULTIMATE SKILL" 4-PHASE VISUAL SHOWCASE ENGINE [KEY Q]
//    Visually integrates our entire Digital Twin stack in one 3.6s sequence:
//    L1-L3 Armor Pop + Real URDF Stunt + MPC Rollout + Power Arteries +
//    Odradek Terrain Scan + 360° Blueprint Azimuth Dial + Converging Beams!
// ============================================================================

export type UltimateSkillPhase =
  | 'idle'
  | 'charge_awaken'
  | 'kinematic_stunt'
  | 'twin_burst'
  | 'armor_lock';

export interface RobotUltimateMeta {
  skillName: string;
  subtitle: string;
  accentHex: number;
  showcaseSystems: string[];
}

export interface UltimateSkillState {
  active: boolean;
  elapsed: number;
  duration: number;
  shotIndex: 1 | 2 | 3 | 4;
  phase: UltimateSkillPhase;
  phaseLabel: string;
  progress01: number;
  showcaseClipRatio: number;
  armorExplosionRatio: number;
  coreGlowIntensity: number;
  timeDilation: number;
  altitudeOffset: number;
  pitchOffset: number;
  rollOffset: number;
  yawSpinOffset: number;
  azDialRadiusScale: number;
  domePulse01: number;
  beamConvergence01: number;
  justEnteredStunt: boolean;
  justTriggeredBurst: boolean;
  justFinished: boolean;
}

const ULTIMATE_META_BY_ROBOT: Record<string, RobotUltimateMeta> = {
  unitree_go2: {
    skillName: '超导爆甲·360°电磁后空翻震地',
    subtitle: '12-DOF 四足逆解蓄力后空翻 + L1-L3 全息解构 + 全域脉冲震波',
    accentHex: 0x00e5ff,
    showcaseSystems: ['12-DOF URDF 后空翻', 'L1-L3 动态爆甲', 'MPC 轨迹扇', '全域电磁震波']
  },
  unitree_g1: {
    skillName: '29轴破穹·凌空旋风核能重击',
    subtitle: '双足屈膝腾空 360° 回旋劈击 + 全关节功率流脉动 + 聚能等离子束',
    accentHex: 0x38bdf8,
    showcaseSystems: ['29-DOF 全身协同', '悬停正交解构', '关节功率动脉', '聚能等离子束']
  },
  sar: {
    skillName: '四摆臂全展·多波束全域矩阵镇压',
    subtitle: '履带摆臂极限抬升 + 奥德拉克地形解算 + 多目标协同激光齐射',
    accentHex: 0xf59e0b,
    showcaseSystems: ['四摆臂越障展开', '奥德拉克矩阵', 'L1 护甲透视', '多目标激光齐射']
  },
  mars2020: {
    skillName: 'SuperCam 超光谱·核源天基信标齐射',
    subtitle: 'MMRTG 核热源过载 + 摇臂悬架蓄力 + 桅杆超光谱等离子聚焦',
    accentHex: 0xf97316,
    showcaseSystems: ['MMRTG 核源脉冲', '摇臂转向架联动', '蓝图方位罗盘', '超光谱聚焦束']
  },
  bluerov2: {
    skillName: '深海超空泡·360°涡环声纳齐射',
    subtitle: '8推进器矢量横滚机动 + 外壳透明内窥 + 蓝绿激光声学脉冲波',
    accentHex: 0x06b6d4,
    showcaseSystems: ['矢量涡环横滚', '耐压舱爆甲内窥', 'Ping360 声学波', '超空泡脉冲束']
  },
  rexrov2: {
    skillName: '深海重工·机械臂等离子全向切割风暴',
    subtitle: 'Oberon7 机械臂展开 + 重型矢量悬停旋回 + 高能电弧齐射',
    accentHex: 0x22d3ee,
    showcaseSystems: ['Oberon7 机械臂联动', '深海悬停解构', '功率流监控', '高能电弧脉冲']
  },
  b737_cfm56: {
    skillName: '普加乔夫眼镜蛇·双转子全弹道齐射',
    subtitle: '大迎角 75° 眼镜蛇仰立 + 短舱反推全开内窥高低压涡轮 + 全向导引束',
    accentHex: 0x60a5fa,
    showcaseSystems: ['75° 眼镜蛇机动', 'N1/N2 双转子透视', '反推罩全行程', '超音速激波环']
  },
  unitree_z1: {
    skillName: '六轴奇异点突破·超精密光刻矩阵',
    subtitle: '6-DOF 谐波关节高速画圆 + 法兰盘解构透视 + 等离子光刻聚焦',
    accentHex: 0x38bdf8,
    showcaseSystems: ['6-DOF 逆运动学', '谐波减速器内窥', '蓝图精密标尺', '高能光刻电弧']
  }
};

export function getRobotUltimateMeta(robotId: string): RobotUltimateMeta {
  return ULTIMATE_META_BY_ROBOT[robotId] || ULTIMATE_META_BY_ROBOT.sar;
}

export function createInitialUltimateSkillState(): UltimateSkillState {
  return {
    active: false,
    elapsed: 0,
    duration: 4.2,
    shotIndex: 1,
    phase: 'idle',
    phaseLabel: '',
    progress01: 0,
    showcaseClipRatio: 1.0,
    armorExplosionRatio: 0,
    coreGlowIntensity: 0,
    timeDilation: 1.0,
    altitudeOffset: 0,
    pitchOffset: 0,
    rollOffset: 0,
    yawSpinOffset: 0,
    azDialRadiusScale: 0,
    domePulse01: 0,
    beamConvergence01: 0,
    justEnteredStunt: false,
    justTriggeredBurst: false,
    justFinished: false
  };
}

export function triggerUltimateSkill(): UltimateSkillState {
  return {
    ...createInitialUltimateSkillState(),
    active: true,
    elapsed: 0.001,
    shotIndex: 1,
    phase: 'charge_awaken',
    phaseLabel: '镜头 I · 俯掠推轨 + 激光断层内窥蓄力',
    showcaseClipRatio: 0.34,
    armorExplosionRatio: 0.04,
    coreGlowIntensity: 0.35,
    timeDilation: 0.54,
    azDialRadiusScale: 0.22
  };
}

export function stepUltimateSkill(
  prev: UltimateSkillState,
  wallDt: number,
  robotId: string
): UltimateSkillState {
  if (!prev.active) {
    if (prev.justFinished) {
      return { ...prev, justFinished: false };
    }
    return prev;
  }

  const dt = Math.max(0, Math.min(0.65, wallDt));
  const elapsed = prev.elapsed + dt;
  const dur = prev.duration;

  if (elapsed >= dur) {
    return {
      ...createInitialUltimateSkillState(),
      justFinished: true
    };
  }

  const u = elapsed / dur;
  let shotIndex: 1 | 2 | 3 | 4 = 1;
  let phase: UltimateSkillPhase = 'charge_awaken';
  let phaseLabel = '镜头 I · 俯掠推轨 + 激光断层内窥蓄力';
  if (elapsed >= 1.1 && elapsed < 2.65) {
    shotIndex = 2;
    phase = 'kinematic_stunt';
    phaseLabel = '镜头 II · 希区柯克甩镜 + URDF 极限绝技';
  } else if (elapsed >= 2.65 && elapsed < 3.55) {
    shotIndex = 3;
    phase = 'twin_burst';
    phaseLabel = '镜头 III · 战术俯仰拉远 + 全域脉冲锁定';
  } else if (elapsed >= 3.55) {
    shotIndex = 4;
    phase = 'armor_lock';
    phaseLabel = '镜头 IV · 英雄定帧 + 磁力合甲归位';
  }

  const justEnteredStunt = prev.phase === 'charge_awaken' && phase === 'kinematic_stunt';
  const justTriggeredBurst = prev.phase === 'kinematic_stunt' && phase === 'twin_burst';

  // Shot I synchronized solid CAD cross-section laser hold & upward sweep (0.34 -> 1.00 across 0.0..1.10s)
  let showcaseClipRatio = 1.0;
  if (elapsed < 0.45) {
    showcaseClipRatio = 0.34 + (elapsed / 0.45) * 0.14;
  } else if (elapsed < 1.1) {
    const sc = (elapsed - 0.45) / 0.65;
    const smoothSc = sc * sc * (3 - 2 * sc);
    showcaseClipRatio = 0.48 + 0.52 * smoothSc;
  }

  // Smooth L1-L3 explosion envelope: rises to 0.36, holds during showcase, snaps shut cleanly in Shot IV
  let armorExplosionRatio = 0;
  if (elapsed < 1.1) {
    const t = elapsed / 1.1;
    armorExplosionRatio = t * t * (3 - 2 * t) * 0.36;
  } else if (elapsed < 3.55) {
    armorExplosionRatio = 0.36 + 0.045 * Math.sin((elapsed - 1.1) * 4.2);
  } else {
    const t = Math.min(1, (elapsed - 3.55) / (dur - 3.55));
    armorExplosionRatio = 0.36 * (1 - t * t);
  }

  const coreGlowIntensity = Math.sin(Math.min(1, u) * Math.PI);

  // Time dilation: dramatic slow-in on Shot I, crisp full-speed stunt in Shot II, slow-mo peak at Shot III start
  let timeDilation = 1.0;
  if (phase === 'charge_awaken') timeDilation = 0.56;
  else if (phase === 'twin_burst' && elapsed < 2.95) timeDilation = 0.38;

  // Bespoke Per-Robot 3D Chassis Stunt Trajectory!
  let altitudeOffset = 0;
  let pitchOffset = 0;
  let rollOffset = 0;
  let yawSpinOffset = 0;

  if (phase === 'charge_awaken') {
    const c = elapsed / 1.1;
    if (robotId === 'unitree_go2' || robotId === 'unitree_g1') {
      altitudeOffset = -0.14 * Math.sin(c * Math.PI * 0.5);
      pitchOffset = 0.16 * Math.sin(c * Math.PI * 0.5);
    } else {
      altitudeOffset = 0.12 * c;
    }
  } else if (phase === 'kinematic_stunt') {
    const s = (elapsed - 1.1) / 1.55; // 0..1
    const arc = Math.sin(s * Math.PI);
    const smoothS = s * s * (3 - 2 * s);
    if (robotId === 'unitree_go2') {
      altitudeOffset = arc * 1.85;
      pitchOffset = -smoothS * Math.PI * 2;
    } else if (robotId === 'unitree_g1') {
      altitudeOffset = arc * 1.95;
      yawSpinOffset = smoothS * Math.PI * 2;
      pitchOffset = Math.sin(s * Math.PI * 2) * 0.22;
    } else if (robotId === 'bluerov2' || robotId === 'rexrov2') {
      altitudeOffset = arc * 0.95;
      rollOffset = smoothS * Math.PI * 2;
      pitchOffset = Math.sin(s * Math.PI) * -0.24;
    } else if (robotId === 'b737_cfm56') {
      altitudeOffset = arc * 2.2;
      pitchOffset = Math.sin(s * Math.PI) * 1.22;
    } else {
      altitudeOffset = arc * 0.55;
      yawSpinOffset = smoothS * Math.PI * 2;
      pitchOffset = -arc * 0.16;
    }
  } else if (phase === 'twin_burst') {
    const b = (elapsed - 2.65) / 0.9;
    altitudeOffset = Math.max(0, (1 - b) * 0.18);
  }

  // Azimuth Blueprint Ground Dial & Shockwave Dome & Multi-Target Beam progress
  const azDialRadiusScale =
    elapsed < 0.55
      ? elapsed / 0.55
      : elapsed > 3.65
        ? Math.max(0, 1 - (elapsed - 3.65) / 0.55)
        : 1.0;

  const domePulse01 =
    elapsed >= 2.55 && elapsed <= 3.85 ? Math.min(1, (elapsed - 2.55) / 1.3) : 0;

  const beamConvergence01 =
    elapsed >= 2.45 && elapsed <= 3.7
      ? Math.sin(((elapsed - 2.45) / 1.25) * Math.PI)
      : 0;

  return {
    active: true,
    elapsed,
    duration: dur,
    shotIndex,
    phase,
    phaseLabel,
    progress01: u,
    showcaseClipRatio,
    armorExplosionRatio,
    coreGlowIntensity,
    timeDilation,
    altitudeOffset,
    pitchOffset,
    rollOffset,
    yawSpinOffset,
    azDialRadiusScale,
    domePulse01,
    beamConvergence01,
    justEnteredStunt,
    justTriggeredBurst,
    justFinished: false
  };
}

export function computeUltimateUrdfJointDelta(
  robotId: string,
  joint: UrdfJointDef,
  skill: UltimateSkillState
): number {
  if (!skill.active) return 0;
  const n = joint.name.toLowerCase();

  if (robotId === 'unitree_go2') {
    if (skill.phase === 'charge_awaken') {
      const c = Math.min(1, skill.elapsed / 1.1);
      if (n.includes('thigh')) return 0.55 * c;
      if (n.includes('calf')) return -0.78 * c;
    } else if (skill.phase === 'kinematic_stunt') {
      const s = Math.max(0, Math.min(1, (skill.elapsed - 1.1) / 1.55));
      const tuck = Math.sin(s * Math.PI);
      if (n.includes('thigh')) return -0.35 + tuck * 0.65;
      if (n.includes('calf')) return 0.25 - tuck * 0.85;
    } else if (skill.phase === 'twin_burst') {
      if (n.includes('hip')) return (n.startsWith('fl_') || n.startsWith('rl_') ? 1 : -1) * 0.22;
    }
  } else if (robotId === 'unitree_g1') {
    const isLeft = n.includes('left');
    if (skill.phase === 'charge_awaken') {
      const c = Math.min(1, skill.elapsed / 1.1);
      if (n.includes('hip_pitch')) return -0.48 * c;
      if (n.includes('knee')) return 0.82 * c;
      if (n.includes('shoulder_pitch')) return -0.75 * c;
      if (n.includes('elbow')) return -0.85 * c;
    } else if (skill.phase === 'kinematic_stunt') {
      const s = Math.max(0, Math.min(1, (skill.elapsed - 1.1) / 1.55));
      const heroSpread = Math.sin(s * Math.PI);
      if (n.includes('shoulder_roll')) return (isLeft ? 1 : -1) * heroSpread * 0.95;
      if (n.includes('shoulder_pitch')) return -heroSpread * 0.85;
      if (n.includes('hip_pitch')) return (isLeft ? -1 : 0.65) * heroSpread * 0.58;
      if (n.includes('knee')) return isLeft ? 0.65 * heroSpread : 0.15;
    } else if (skill.phase === 'twin_burst') {
      if (n.includes('shoulder_roll')) return (isLeft ? 1 : -1) * 0.52;
      if (n.includes('shoulder_pitch')) return -0.62;
    }
  } else if (robotId === 'sar' || robotId === 'mars2020') {
    const env = Math.sin(skill.progress01 * Math.PI);
    if (n.includes('flipper') || n.includes('f_front') || n.includes('f_back')) {
      return -0.68 * env;
    }
    if (n.includes('lidar') || n.includes('mast') || n.includes('sensor')) {
      return skill.elapsed * 8.5;
    }
  } else if (robotId === 'unitree_z1' || robotId === 'rexrov2') {
    const env = Math.sin(skill.progress01 * Math.PI);
    if (n.includes('joint1') || n.includes('azimuth')) return Math.sin(skill.elapsed * 3.5) * 1.1;
    if (n.includes('joint2') || n.includes('shoulder')) return 0.62 * env;
    if (n.includes('joint3') || n.includes('elbow')) return -0.58 * env;
  }
  return 0;
}

// ============================================================================
// 3. SIGNATURE DIRECTOR CAMERA CHOREOGRAPHY ENGINE [KEY K]
// ============================================================================

export type DirectorCameraMode =
  | 'off'
  | 'hero_orbit'
  | 'dolly_vertigo'
  | 'joint_whip'
  | 'fpv_flyby';

export interface DirectorCameraPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  up: [number, number, number];
  fovDeg: number;
  modeLabel: string;
}

const DIRECTOR_MODE_LABELS: Record<DirectorCameraMode, string> = {
  off: '运镜: 标准跟拍',
  hero_orbit: '运镜: 英雄低仰环绕',
  dolly_vertigo: '运镜: 希区柯克眩晕变焦',
  joint_whip: '运镜: 关节特写甩镜',
  fpv_flyby: '运镜: 掠袭贴地追焦'
};

export function getDirectorModeLabel(mode: DirectorCameraMode): string {
  return DIRECTOR_MODE_LABELS[mode];
}

export function cycleDirectorCameraMode(current: DirectorCameraMode): DirectorCameraMode {
  const order: DirectorCameraMode[] = [
    'off',
    'hero_orbit',
    'dolly_vertigo',
    'joint_whip',
    'fpv_flyby'
  ];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export function computeDirectorCameraPose(params: {
  mode: DirectorCameraMode;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  actorYaw: number;
  modelRadius: number;
  elapsed: number;
  ultimateActive: boolean;
  ultimateProgress01: number;
}): DirectorCameraPose {
  const {
    mode,
    anchorX,
    anchorY,
    anchorZ,
    actorYaw,
    modelRadius,
    elapsed,
    ultimateActive,
    ultimateProgress01
  } = params;

  const r = Math.max(1.2, modelRadius);

  // Unified 4-Shot Camera + Action + Cutaway Showcase Choreography when [Q] is active!
  if (ultimateActive) {
    const u = Math.max(0, Math.min(1, ultimateProgress01));
    if (u < 0.262) {
      // Shot I (0.00 - 1.10s): Elevated 28-deg downward telephoto push-in looking directly onto the solid 45-deg CNC laser cross-section cap!
      const s1 = u / 0.262;
      const ease1 = s1 * s1 * (3 - 2 * s1);
      const az = -actorYaw + 0.55 + ease1 * 0.35;
      const dist = r * (2.08 - ease1 * 0.28);
      return {
        position: [
          anchorX + Math.cos(az) * dist,
          anchorY + r * (0.58 - ease1 * 0.14),
          anchorZ + Math.sin(az) * dist
        ],
        lookAt: [anchorX, anchorY + r * (0.02 + ease1 * 0.14), anchorZ],
        up: [0, 1, 0],
        fovDeg: 38,
        modeLabel: '镜头 I · 俯掠推轨断层内窥'
      };
    }

    if (u < 0.631) {
      // Shot II (1.10 - 2.65s): Dynamic +135° whip-tracking arc + Hitchcock Dolly-Zoom FOV punch + generous airborne headroom
      const s2 = (u - 0.262) / (0.631 - 0.262);
      const ease2 = s2 * s2 * (3 - 2 * s2);
      const stuntArc = Math.sin(s2 * Math.PI);
      const az = -actorYaw + 0.9 + ease2 * 2.35;
      const fovDeg = 42 + stuntArc * 18; // 42° -> 60° -> 42° kinetic FOV punch
      const dist = r * (2.12 + stuntArc * 0.46);
      const dutch = Math.sin(s2 * Math.PI) * 0.11; // ~6.3° kinetic Dutch roll
      return {
        position: [
          anchorX + Math.cos(az) * dist,
          anchorY + r * (0.28 + stuntArc * 0.18),
          anchorZ + Math.sin(az) * dist
        ],
        lookAt: [anchorX, anchorY + r * 0.22, anchorZ],
        up: [Math.sin(dutch), Math.cos(dutch), 0],
        fovDeg,
        modeLabel: '镜头 II · 希区柯克特技跟拍'
      };
    }

    if (u < 0.845) {
      // Shot III (2.65 - 3.55s): Smooth crane pull-back framing 360° Blueprint Azimuth Dial + Shockwave + Beams
      const s3 = (u - 0.631) / (0.845 - 0.631);
      const ease3 = s3 * s3 * (3 - 2 * s3);
      const az = -actorYaw + 3.25 + ease3 * 0.95;
      const dist = r * (2.25 + ease3 * 0.35);
      return {
        position: [
          anchorX + Math.cos(az) * dist,
          anchorY + r * (0.28 + ease3 * 0.42),
          anchorZ + Math.sin(az) * dist
        ],
        lookAt: [anchorX, anchorY + r * 0.24, anchorZ],
        up: [0, 1, 0],
        fovDeg: 54,
        modeLabel: '镜头 III · 战术俯仰全域视野'
      };
    }

    // Shot IV (3.55 - 4.20s): Settle into iconic 3/4 hero stance as L1-L3 armor latches shut
    const s4 = (u - 0.845) / (1 - 0.845);
    const ease4 = s4 * s4 * (3 - 2 * s4);
    const az = -actorYaw + 4.2 + ease4 * 2.65;
    const dist = r * (2.6 - ease4 * 0.38);
    return {
      position: [
        anchorX + Math.cos(az) * dist,
        anchorY + r * (0.7 - ease4 * 0.28),
        anchorZ + Math.sin(az) * dist
      ],
      lookAt: [anchorX, anchorY + r * 0.28, anchorZ],
      up: [0, 1, 0],
      fovDeg: 54 - ease4 * 10,
      modeLabel: '镜头 IV · 英雄定帧归位'
    };
  }

  if (mode === 'dolly_vertigo') {
    // True Hitchcock Vertigo Dolly-Zoom: subject framing stays constant while FOV widens/narrows!
    const osc = 0.5 + 0.5 * Math.sin(elapsed * 1.45);
    const fovDeg = 28 + osc * 48; // 28° telephoto -> 76° wide
    const halfFovRad = (fovDeg * Math.PI) / 360;
    const baseHalfTan = Math.tan((50 * Math.PI) / 360);
    const dist = (r * 2.55 * baseHalfTan) / Math.max(0.18, Math.tan(halfFovRad));
    const angle = -actorYaw + Math.PI * 0.22 + Math.sin(elapsed * 0.45) * 0.32;
    return {
      position: [
        anchorX + Math.cos(angle) * dist,
        anchorY + r * 0.42,
        anchorZ + Math.sin(angle) * dist
      ],
      lookAt: [anchorX, anchorY + r * 0.26, anchorZ],
      up: [0, 1, 0],
      fovDeg,
      modeLabel: DIRECTOR_MODE_LABELS.dolly_vertigo
    };
  }

  if (mode === 'joint_whip') {
    // Rhythmic close-up whip-pan between front/side/rear mechanical quadrants
    const beat = elapsed * 0.72;
    const seg = Math.floor(beat) % 3;
    const frac = beat - Math.floor(beat);
    const whip = frac < 0.25 ? (frac / 0.25) * (frac / 0.25) : 1.0;
    const targetAngles = [0.45, 2.35, -1.65];
    const prevAngle = targetAngles[(seg + 2) % 3];
    const curAngle = prevAngle + (targetAngles[seg] - prevAngle) * whip - actorYaw;
    const dist = r * (1.65 + 0.25 * Math.cos(elapsed * 1.8));
    const focusY = anchorY + r * (seg === 0 ? 0.45 : seg === 1 ? 0.18 : 0.62);
    const dutch = Math.sin(elapsed * 1.4) * 0.08;
    return {
      position: [
        anchorX + Math.cos(curAngle) * dist,
        focusY + r * 0.18,
        anchorZ + Math.sin(curAngle) * dist
      ],
      lookAt: [anchorX, focusY, anchorZ],
      up: [Math.sin(dutch), Math.cos(dutch), 0],
      fovDeg: 42,
      modeLabel: DIRECTOR_MODE_LABELS.joint_whip
    };
  }

  if (mode === 'fpv_flyby') {
    // Low-skimming high-speed dynamic fly-by sweep with banking Dutch roll
    const sweep = elapsed * 1.15;
    const angle = -actorYaw + Math.sin(sweep) * 1.35;
    const dist = r * (2.05 + 0.85 * Math.cos(sweep * 0.8));
    const bank = Math.cos(sweep) * 0.16;
    return {
      position: [
        anchorX - Math.cos(angle) * dist,
        anchorY + r * (0.22 + 0.35 * (0.5 + 0.5 * Math.sin(sweep * 1.3))),
        anchorZ - Math.sin(angle) * dist
      ],
      lookAt: [
        anchorX + Math.cos(-actorYaw) * r * 0.45,
        anchorY + r * 0.32,
        anchorZ + Math.sin(-actorYaw) * r * 0.45
      ],
      up: [Math.sin(bank), Math.cos(bank), 0],
      fovDeg: 62,
      modeLabel: DIRECTOR_MODE_LABELS.fpv_flyby
    };
  }

  // Manual signature 'hero_orbit'
  const orbitRate = elapsed * 0.68;
  const az = -actorYaw + 0.55 + orbitRate;
  const dist = r * 2.35;
  const dutchRoll = Math.sin(orbitRate) * 0.07;
  return {
    position: [
      anchorX + Math.cos(az) * dist,
      anchorY + r * 0.28,
      anchorZ + Math.sin(az) * dist
    ],
    lookAt: [anchorX, anchorY + r * 0.38, anchorZ],
    up: [Math.sin(dutchRoll), Math.cos(dutchRoll), 0],
    fovDeg: 52,
    modeLabel: DIRECTOR_MODE_LABELS.hero_orbit
  };
}

// ============================================================================
// 4. INTERACTIVE 3D TACTICAL FIELD TARGETS & HITSTOP / COMBO SYSTEM
// ============================================================================

export interface InteractiveFieldTarget {
  id: string;
  codeName: string;
  roleLabel: string;
  x: number;
  y: number;
  z: number;
  baseY: number;
  hitRadius: number;
  maxShield: number;
  shield: number;
  maxHp: number;
  hp: number;
  alive: boolean;
  hitFlash01: number;
  shatterProgress01: number;
  respawnTimer: number;
  accentHex: number;
}

export interface TacticalScoreState {
  destroyedCount: number;
  comboCount: number;
  comboTimer: number;
  hitstopTimer: number;
  lockedTargetId: string | null;
}

export function createInitialTacticalScoreState(): TacticalScoreState {
  return {
    destroyedCount: 0,
    comboCount: 0,
    comboTimer: 0,
    hitstopTimer: 0,
    lockedTargetId: null
  };
}

export function createArenaInteractiveTargets(
  domain: SandboxDomain,
  sampleGroundY: (x: number, z: number) => number
): InteractiveFieldTarget[] {
  const presets =
    domain === 'sea'
      ? [
          { id: 'tgt_sea_1', codeName: '深海声学信标塔 α', roleLabel: '谐振护盾靶', x: 12.0, z: -2.8, accentHex: 0x00e5ff },
          { id: 'tgt_sea_2', codeName: '热液采矿中继站 β', roleLabel: '高压阀体靶', x: 18.5, z: 4.2, accentHex: 0xf59e0b },
          { id: 'tgt_sea_3', codeName: '潜航器电磁浮标 γ', roleLabel: '机动感应靶', x: -14, z: 16, accentHex: 0x38bdf8 },
          { id: 'tgt_sea_4', codeName: '海沟声纳校准阵 δ', roleLabel: '重装核心靶', x: -18, z: -13, accentHex: 0xf97316 }
        ]
      : domain === 'air'
        ? [
            { id: 'tgt_air_1', codeName: '高空雷达浮空靶 α', roleLabel: '超音速拦截靶', x: 21.0, z: -4.2, accentHex: 0x00e5ff },
            { id: 'tgt_air_2', codeName: '电子对抗飞艇靶 β', roleLabel: '干扰护盾靶', x: 32.0, z: 5.8, accentHex: 0xf59e0b },
            { id: 'tgt_air_3', codeName: '平流层气象阵列 γ', roleLabel: '精准锁定靶', x: -26, z: 22, accentHex: 0x38bdf8 },
            { id: 'tgt_air_4', codeName: '机动靶机信标 δ', roleLabel: '高G机动靶', x: -32, z: -18, accentHex: 0xf97316 }
          ]
        : [
            { id: 'tgt_land_1', codeName: '聚变反应堆护盾桩 α', roleLabel: '电磁护盾靶', x: 11.2, z: -2.5, accentHex: 0x00e5ff },
            { id: 'tgt_land_2', codeName: '重装装甲标定靶 β', roleLabel: '复合装甲靶', x: 17.4, z: 4.0, accentHex: 0xf59e0b },
            { id: 'tgt_land_3', codeName: '远距中继雷达塔 γ', roleLabel: '高地信标靶', x: -13, z: 15, accentHex: 0x38bdf8 },
            { id: 'tgt_land_4', codeName: '高危晶格能量核 δ', roleLabel: '核心弱点靶', x: -17, z: -12, accentHex: 0xf97316 }
          ];

  return presets.map((p, idx) => {
    const gy = sampleGroundY(p.x, p.z);
    const y = domain === 'air' ? gy + 6 + (idx % 2) * 3 : domain === 'sea' ? gy + 3.2 : gy;
    return {
      id: p.id,
      codeName: p.codeName,
      roleLabel: p.roleLabel,
      x: p.x,
      y,
      z: p.z,
      baseY: y,
      hitRadius: domain === 'air' ? 2.4 : 1.75,
      maxShield: 60,
      shield: 60,
      maxHp: 100,
      hp: 100,
      alive: true,
      hitFlash01: 0,
      shatterProgress01: 0,
      respawnTimer: 0,
      accentHex: p.accentHex
    };
  });
}

export function damageInteractiveTarget(
  targets: InteractiveFieldTarget[],
  score: TacticalScoreState,
  targetId: string,
  damage: number
): {
  targets: InteractiveFieldTarget[];
  score: TacticalScoreState;
  hitOccurred: boolean;
  justDestroyed: boolean;
} {
  let hitOccurred = false;
  let justDestroyed = false;

  const nextTargets = targets.map((t) => {
    if (t.id !== targetId || !t.alive) return t;
    hitOccurred = true;
    const shieldAbsorb = Math.min(t.shield, damage);
    const nextShield = t.shield - shieldAbsorb;
    const hullDamage = damage - shieldAbsorb;
    const nextHp = Math.max(0, t.hp - hullDamage);
    if (nextHp <= 0) {
      justDestroyed = true;
      return {
        ...t,
        shield: 0,
        hp: 0,
        alive: false,
        hitFlash01: 1.0,
        shatterProgress01: 0.02,
        respawnTimer: 6.0
      };
    }
    return {
      ...t,
      shield: nextShield,
      hp: nextHp,
      hitFlash01: 1.0
    };
  });

  if (!hitOccurred) {
    return { targets, score, hitOccurred: false, justDestroyed: false };
  }

  const nextCombo = score.comboCount + 1;
  const nextScore: TacticalScoreState = {
    destroyedCount: score.destroyedCount + (justDestroyed ? 1 : 0),
    comboCount: nextCombo,
    comboTimer: 5.0,
    hitstopTimer: justDestroyed ? 0.065 : 0.038,
    lockedTargetId: targetId
  };

  return {
    targets: nextTargets,
    score: nextScore,
    hitOccurred: true,
    justDestroyed
  };
}

export function stepInteractiveTargets(
  targets: InteractiveFieldTarget[],
  score: TacticalScoreState,
  realDt: number,
  simTime: number
): { targets: InteractiveFieldTarget[]; score: TacticalScoreState } {
  const dt = Math.max(0, Math.min(0.1, realDt));
  const nextTargets = targets.map((t, idx) => {
    const floatY = t.baseY + Math.sin(simTime * 1.8 + idx * 1.4) * 0.08;
    if (!t.alive) {
      const nextRespawn = Math.max(0, t.respawnTimer - dt);
      if (nextRespawn <= 0) {
        return {
          ...t,
          y: floatY,
          shield: t.maxShield,
          hp: t.maxHp,
          alive: true,
          hitFlash01: 0,
          shatterProgress01: 0,
          respawnTimer: 0
        };
      }
      return {
        ...t,
        y: floatY,
        hitFlash01: Math.max(0, t.hitFlash01 - dt * 3.5),
        shatterProgress01: Math.min(1, t.shatterProgress01 + dt * 1.65),
        respawnTimer: nextRespawn
      };
    }

    // Slow shield recharge when not recently hit
    const rechargedShield =
      t.hitFlash01 <= 0.01 ? Math.min(t.maxShield, t.shield + dt * 4.5) : t.shield;
    return {
      ...t,
      y: floatY,
      shield: rechargedShield,
      hitFlash01: Math.max(0, t.hitFlash01 - dt * 4.2)
    };
  });

  const nextComboTimer = Math.max(0, score.comboTimer - dt);
  const nextScore: TacticalScoreState = {
    ...score,
    comboTimer: nextComboTimer,
    comboCount: nextComboTimer > 0 ? score.comboCount : 0,
    hitstopTimer: Math.max(0, score.hitstopTimer - dt)
  };

  return { targets: nextTargets, score: nextScore };
}

export function findBestInteractiveTarget(
  targets: InteractiveFieldTarget[],
  fromX: number,
  fromY: number,
  fromZ: number,
  yaw: number,
  preferredLockId: string | null,
  minimumHeadingDot = -1
): InteractiveFieldTarget | null {
  if (preferredLockId) {
    const locked = targets.find((t) => t.id === preferredLockId && t.alive);
    if (locked) return locked;
  }
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  let best: InteractiveFieldTarget | null = null;
  let bestScore = Infinity;

  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.x - fromX;
    const dz = t.z - fromZ;
    const dist = Math.hypot(dx, t.y - fromY, dz);
    if (dist < 0.5) continue;
    const dirDot = (dx * fx + dz * fz) / Math.max(0.5, Math.hypot(dx, dz));
    if (dirDot < minimumHeadingDot) continue;
    // Prefer targets ahead of the robot's heading
    const weightedDist = dist * (1.35 - 0.55 * dirDot);
    if (weightedDist < bestScore) {
      bestScore = weightedDist;
      best = t;
    }
  }
  return best;
}
