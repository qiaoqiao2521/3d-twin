import { sampleLandTerrainHeight, sampleLandChassisSupportHeight, isGroundDriveVehicle, getSandboxActorSpec, stepGroundDrive } from './actionSandboxEngine';

import {
  POLAR_BRIDGE, POLAR_GATE, POLAR_RIDGE_COVER, createPolarMission,
  samplePolarArenaHeight, stepPolarMission, type PolarMissionState
} from './marsPolarMission';

export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';
export type GameOutcome = 'none' | 'victory' | 'defeat';
export type BattlefieldMapId = 'jezero_crater' | 'polar_ice_canyon';

export interface BattlefieldMapSpec {
  id: BattlefieldMapId;
  codeName: string;
  title: string;
  subtitle: string;
  accentHex: string;
}

export const BATTLEFIELD_MAP_SPECS: BattlefieldMapSpec[] = [
  {
    id: 'jezero_crater',
    codeName: 'JEZERO-ALPHA',
    title: '杰泽罗赤红战区',
    subtitle: '赤铁矿沙丘与玄武岩掩体 · 镇守领主 ARES-09 核能泰坦',
    accentHex: '#ff3b5c'
  },
  {
    id: 'polar_ice_canyon',
    codeName: 'BOREALIS-HIVE',
    title: '极冠冰封异形巢谷',
    subtitle: 'Infinigen 冰川尖峰裂谷 · 镇守领主 XENO-OMEGA 异形女皇',
    accentHex: '#38bdf8'
  }
];

export type PlayerMechId =
  | 'unitree_g1'
  | 'unitree_go2'
  | 'nasa_valkyrie'
  | 'spot_arm'
  | 'husky_ugv'
  | 'sar'
  | 'mars2020'
  | 'unitree_z1'
  | 'unitree_h1'
  | 'unitree_b2'
  | 'fourier_gr1'
  | 'talos_humanoid'
  | 'cassie_biped'
  | 'anymal_c'
  | 'baxter_dual_arm'
  | 'hello_stretch';

export const HUMANOID_COMBAT_MECHS = new Set<PlayerMechId>([
  'unitree_g1',
  'nasa_valkyrie',
  'unitree_h1',
  'fourier_gr1',
  'talos_humanoid',
  'cassie_biped'
]);

export const QUADRUPED_COMBAT_MECHS = new Set<PlayerMechId>([
  'unitree_go2',
  'spot_arm',
  'unitree_b2',
  'anymal_c'
]);

export function isLeggedCombatMech(mechId: PlayerMechId): boolean {
  return HUMANOID_COMBAT_MECHS.has(mechId) || QUADRUPED_COMBAT_MECHS.has(mechId);
}
export type CombatWeaponId = 'pulse_rifle' | 'railgun' | 'missile_pod' | 'compound_bow';
export type EnemyArchetypeId =
  | 'go2_hound'
  | 'g1_vanguard'
  | 'sar_siege'
  | 'aero_hunter'
  | 'xeno_spider'
  | 'xeno_runner'
  | 'xeno_spitter'
  | 'deathless_vanguard'
  | 'ares_boss'
  | 'xeno_queen_boss';
export type BossAttackKind =
  | 'none'
  | 'balteus_salvo'
  | 'coral_laser_sweep'
  | 'orbital_pillars'
  | 'queen_acid_barrage'
  | 'queen_tail_scythe'
  | 'queen_brood_call';
export type AttackPhase = 'idle' | 'windup' | 'active' | 'recovery';

export const BIOLOGICAL_XENO_ARCHETYPES = new Set<EnemyArchetypeId>([
  'xeno_spider',
  'xeno_runner',
  'xeno_spitter',
  'xeno_queen_boss'
]);

export function isBiologicalXenoEnemy(archetype: EnemyArchetypeId): boolean {
  return BIOLOGICAL_XENO_ARCHETYPES.has(archetype);
}

export interface PlayableMechSpec {
  id: PlayerMechId;
  codeName: string;
  title: string;
  roleTag: string;
  glbUrls: string[];
  urdfUrl?: string;
  targetMaxDim: number;
  maxHp: number;
  maxShield: number;
  cruiseSpeed: number;
  sprintSpeed: number;
  dashImpulse: number;
}

export interface CombatWeaponSpec {
  id: CombatWeaponId;
  slotKey: '1' | '2' | '3' | '4';
  name: string;
  roleHint: string;
  cooldownSec: number;
  damage: number;
  staggerDamage: number;
  projectileSpeed: number;
  spreadRad: number;
  accentHex: string;
}

export const PLAYABLE_MECH_SPECS: PlayableMechSpec[] = [
  {
    id: 'unitree_g1',
    codeName: 'G1-VALKYRIE',
    title: '宇树 G1 突击机甲',
    roleTag: '高机动双足 · 均衡火力',
    glbUrls: ['/robotics_glb/unitree_g1_humanoid.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/g1_description/g1_29dof_with_hand_rev_1_0.urdf',
    targetMaxDim: 2.35,
    maxHp: 220,
    maxShield: 140,
    cruiseSpeed: 8.6,
    sprintSpeed: 13.5,
    dashImpulse: 22.0
  },
  {
    id: 'nasa_valkyrie',
    codeName: 'R5-VALKYRIE',
    title: 'NASA 女武神宇航重甲',
    roleTag: '深空宇航双足 · 高容钛白护盾',
    glbUrls: ['/robotics_glb/nasa_valkyrie_r5.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/nasa-urdf-robots/val_description/model/robots/valkyrie_sim_angled_legj1s.urdf',
    targetMaxDim: 2.55,
    maxHp: 275,
    maxShield: 190,
    cruiseSpeed: 8.6,
    sprintSpeed: 13.8,
    dashImpulse: 22.2
  },
  {
    id: 'spot_arm',
    codeName: 'SPOT-CERBERUS',
    title: '波士顿动力 Spot 战犬',
    roleTag: '敏捷四足 + 背部六轴蛇形臂',
    glbUrls: ['/robotics_glb/boston_dynamics_spot_arm.glb'],
    targetMaxDim: 2.1,
    maxHp: 215,
    maxShield: 155,
    cruiseSpeed: 10.2,
    sprintSpeed: 16.0,
    dashImpulse: 25.0
  },
  {
    id: 'husky_ugv',
    codeName: 'HUSKY-VULCAN',
    title: 'Husky 四驱装甲重炮车',
    roleTag: 'Clearpath 4×4 越野 · 稳态重火台',
    glbUrls: ['/robotics_glb/clearpath_husky_ugv.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/husky/husky_description/urdf/husky.urdf.xacro',
    targetMaxDim: 2.45,
    maxHp: 280,
    maxShield: 185,
    cruiseSpeed: 8.4,
    sprintSpeed: 13.2,
    dashImpulse: 20.0
  },
  {
    id: 'unitree_go2',
    codeName: 'GO2-FENRIR',
    title: '宇树 Go2 猎杀机械犬',
    roleTag: '超高速四足 · 极速闪避',
    glbUrls: ['/robotics_glb/unitree_go2_quadruped.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/go2_description/urdf/go2_description.urdf',
    targetMaxDim: 1.95,
    maxHp: 185,
    maxShield: 130,
    cruiseSpeed: 10.4,
    sprintSpeed: 16.2,
    dashImpulse: 25.5
  },
  {
    id: 'sar',
    codeName: 'SAR-BASTION',
    title: 'SAR 重装履带战车',
    roleTag: '重甲堡垒 · 高容错护盾',
    glbUrls: ['/robotics_glb/search_and_rescue_tracked_robot.glb'],
    urdfUrl: '/baselines/01-履带越障搜救机器人/Search-and-Rescue-Robot/urdf/sar_urdf.urdf',
    targetMaxDim: 2.55,
    maxHp: 290,
    maxShield: 180,
    cruiseSpeed: 7.4,
    sprintSpeed: 11.8,
    dashImpulse: 18.5
  },
  {
    id: 'mars2020',
    codeName: 'M20-HYPERION',
    title: '毅力号 核能重炮车',
    roleTag: '核动力护盾 · 远程压制',
    glbUrls: [
      '/robotics_glb/mars2020_mobility_drive.glb',
      '/twins/models/L2_turret_mast_robotics.glb',
      '/twins/models/L3_chassis_mmrtg_lab.glb'
    ],
    targetMaxDim: 2.7,
    maxHp: 270,
    maxShield: 195,
    cruiseSpeed: 7.2,
    sprintSpeed: 11.4,
    dashImpulse: 18.0
  },
  {
    id: 'unitree_z1',
    codeName: 'Z1-STRIKER',
    title: 'Z1 六轴电弧战车',
    roleTag: '灵巧机械臂 · 破防专精',
    glbUrls: ['/robotics_glb/unitree_z1_manipulator.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/z1_description/xacro/z1.urdf',
    targetMaxDim: 2.15,
    maxHp: 210,
    maxShield: 150,
    cruiseSpeed: 8.2,
    sprintSpeed: 12.8,
    dashImpulse: 21.0
  },
  {
    id: 'unitree_h1',
    codeName: 'H1-TITAN',
    title: '宇树 H1 重装人形',
    roleTag: '全尺寸双足 · 高功率突击',
    glbUrls: ['/robotics_glb/unitree_h1_humanoid.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/h1_description/urdf/h1_with_hand.urdf',
    targetMaxDim: 2.55,
    maxHp: 255,
    maxShield: 165,
    cruiseSpeed: 8.8,
    sprintSpeed: 14.0,
    dashImpulse: 22.5
  },
  {
    id: 'unitree_b2',
    codeName: 'B2-JUGGERNAUT',
    title: '宇树 B2 重载突击犬',
    roleTag: '工业重载四足 · 装甲冲锋',
    glbUrls: ['/robotics_glb/unitree_b2_quadruped.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/b2_description/urdf/b2_description.urdf',
    targetMaxDim: 2.25,
    maxHp: 245,
    maxShield: 160,
    cruiseSpeed: 9.8,
    sprintSpeed: 15.6,
    dashImpulse: 24.5
  },
  {
    id: 'fourier_gr1',
    codeName: 'GR1-SERAPH',
    title: '傅利叶 GR-1 具身机甲',
    roleTag: '协同双足 · 精准压制',
    glbUrls: ['/robotics_glb/fourier_gr1_humanoid.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/Wiki-GRx-Models-FourierN1/_首选基准原件_PRIMARY/gr1t1_fourier_hand_6dof.urdf',
    targetMaxDim: 2.4,
    maxHp: 230,
    maxShield: 155,
    cruiseSpeed: 8.5,
    sprintSpeed: 13.4,
    dashImpulse: 21.5
  },
  {
    id: 'talos_humanoid',
    codeName: 'TALOS-AEGIS',
    title: 'TALOS 重型双足堡垒',
    roleTag: '32-DOF 力控 · 重盾反击',
    glbUrls: ['/robotics_glb/talos_full_humanoid.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/talos-data/urdf/talos_full_v2.urdf',
    targetMaxDim: 2.55,
    maxHp: 285,
    maxShield: 190,
    cruiseSpeed: 7.6,
    sprintSpeed: 12.2,
    dashImpulse: 19.5
  },
  {
    id: 'cassie_biped',
    codeName: 'CASSIE-STRIDER',
    title: 'Cassie 疾行双足侦察机',
    roleTag: '反关节疾行 · 极速闪避',
    glbUrls: ['/robotics_glb/cassie_biped_robot.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/cassie_description/urdf/cassie_v4.urdf',
    targetMaxDim: 2.15,
    maxHp: 175,
    maxShield: 135,
    cruiseSpeed: 10.6,
    sprintSpeed: 16.8,
    dashImpulse: 26.0
  },
  {
    id: 'anymal_c',
    codeName: 'ANYMAL-SENTINEL',
    title: 'ANYmal C 全天候巡检机甲',
    roleTag: '全向四足 · 稳态侦察',
    glbUrls: ['/robotics_glb/anymal_c_quadruped.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/anymal_c_simple_description/urdf/anymal.urdf',
    targetMaxDim: 2.05,
    maxHp: 225,
    maxShield: 150,
    cruiseSpeed: 9.2,
    sprintSpeed: 14.5,
    dashImpulse: 23.0
  },
  {
    id: 'baxter_dual_arm',
    codeName: 'BAXTER-DUALIS',
    title: 'Baxter 双臂重火力平台',
    roleTag: '双 7-DOF 臂 · 交叉齐射',
    glbUrls: ['/robotics_glb/baxter_dual_arm_robot.glb'],
    urdfUrl: '/baselines/08-工业与协作机械臂及灵巧夹爪/baxter_common/baxter_description/urdf/baxter.urdf',
    targetMaxDim: 2.5,
    maxHp: 265,
    maxShield: 175,
    cruiseSpeed: 7.4,
    sprintSpeed: 11.6,
    dashImpulse: 18.5
  },
  {
    id: 'hello_stretch',
    codeName: 'STRETCH-SCOUT',
    title: 'Stretch 移动伸缩狙击台',
    roleTag: '高架立柱 · 远程狙击',
    glbUrls: ['/robotics_glb/hello_stretch_mobile_manipulator.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/stretch_description/urdf/stretch.urdf',
    targetMaxDim: 2.25,
    maxHp: 195,
    maxShield: 145,
    cruiseSpeed: 9.0,
    sprintSpeed: 14.2,
    dashImpulse: 22.0
  }
];

export const COMBAT_WEAPONS: CombatWeaponSpec[] = [
  {
    id: 'pulse_rifle',
    slotKey: '1',
    name: '高频脉冲步枪',
    roleHint: '全自动压制 · 护盾速破',
    cooldownSec: 0.095,
    damage: 24,
    staggerDamage: 7.5,
    projectileSpeed: 68,
    spreadRad: 0.016,
    accentHex: '#00e5ff'
  },
  {
    id: 'railgun',
    slotKey: '2',
    name: '超导磁轨狙击炮',
    roleHint: '高穿甲重击 · 高额破防',
    cooldownSec: 0.58,
    damage: 118,
    staggerDamage: 36,
    projectileSpeed: 125,
    spreadRad: 0.002,
    accentHex: '#f59e0b'
  },
  {
    id: 'missile_pod',
    slotKey: '3',
    name: '蜂群追踪导弹舱',
    roleHint: '四联装制导 · 范围爆破',
    cooldownSec: 0.88,
    damage: 42,
    staggerDamage: 15,
    projectileSpeed: 36,
    spreadRad: 0.14,
    accentHex: '#fb7185'
  },
  {
    id: 'compound_bow',
    slotKey: '4',
    name: '电磁复合穿甲弓',
    roleHint: '破盾穿甲箭 · 弱点高暴击',
    cooldownSec: 0.44,
    damage: 134,
    staggerDamage: 46,
    projectileSpeed: 112,
    spreadRad: 0.001,
    accentHex: '#10b981'
  }
];

export interface CombatEnemySpec {
  archetype: EnemyArchetypeId;
  codeName: string;
  glbUrls: string[];
  urdfUrl?: string;
  scaleDim: number;
  maxHp: number;
  maxShield: number;
  maxStagger: number;
  speed: number;
  hitRadius: number;
  scoreValue: number;
  accentHex: string;
}

export const ENEMY_ARCHETYPE_SPECS: Record<EnemyArchetypeId, CombatEnemySpec> = {
  go2_hound: {
    archetype: 'go2_hound',
    codeName: '狂暴猎犬 · GO2',
    glbUrls: ['/robotics_glb/unitree_go2_quadruped.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/go2_description/urdf/go2_description.urdf',
    scaleDim: 1.85,
    maxHp: 95,
    maxShield: 0,
    maxStagger: 55,
    speed: 8.4,
    hitRadius: 1.05,
    scoreValue: 150,
    accentHex: '#f43f5e'
  },
  g1_vanguard: {
    archetype: 'g1_vanguard',
    codeName: '铁卫突击兵 · G1',
    glbUrls: ['/robotics_glb/unitree_g1_humanoid.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/g1_description/g1_29dof_with_hand_rev_1_0.urdf',
    scaleDim: 2.4,
    maxHp: 145,
    maxShield: 55,
    maxStagger: 80,
    speed: 5.8,
    hitRadius: 1.18,
    scoreValue: 240,
    accentHex: '#fb7185'
  },
  sar_siege: {
    archetype: 'sar_siege',
    codeName: '重装迫击战车 · SAR',
    glbUrls: ['/robotics_glb/search_and_rescue_tracked_robot.glb'],
    urdfUrl: '/baselines/01-履带越障搜救机器人/Search-and-Rescue-Robot/urdf/sar_urdf.urdf',
    scaleDim: 2.65,
    maxHp: 210,
    maxShield: 90,
    maxStagger: 110,
    speed: 4.1,
    hitRadius: 1.45,
    scoreValue: 320,
    accentHex: '#f97316'
  },
  aero_hunter: {
    archetype: 'aero_hunter',
    codeName: '苍穹截击无人机 · Skydio X2',
    glbUrls: ['/robotics_glb/skydio_x2_drone.glb'],
    scaleDim: 2.15,
    maxHp: 120,
    maxShield: 45,
    maxStagger: 65,
    speed: 9.2,
    hitRadius: 1.25,
    scoreValue: 260,
    accentHex: '#38bdf8'
  },
  xeno_spider: {
    archetype: 'xeno_spider',
    codeName: '异星抱脸虫蛛 · ARACHNID',
    glbUrls: ['/robotics_glb/xeno_arachnid_spider.glb'],
    scaleDim: 1.4,
    maxHp: 64,
    maxShield: 0,
    maxStagger: 36,
    speed: 10.6,
    hitRadius: 0.9,
    scoreValue: 135,
    accentHex: '#a3e635'
  },
  xeno_runner: {
    archetype: 'xeno_runner',
    codeName: '异形疾行猎手 · XENOMORPH',
    glbUrls: ['/robotics_glb/xenomorph_hunter.glb'],
    scaleDim: 2.65,
    maxHp: 138,
    maxShield: 0,
    maxStagger: 72,
    speed: 9.8,
    hitRadius: 1.16,
    scoreValue: 265,
    accentHex: '#84cc16'
  },
  xeno_spitter: {
    archetype: 'xeno_spitter',
    codeName: '强酸喷吐异形 · ACID-XENO',
    glbUrls: ['/robotics_glb/xenomorph_hunter.glb'],
    scaleDim: 2.5,
    maxHp: 126,
    maxShield: 0,
    maxStagger: 68,
    speed: 6.6,
    hitRadius: 1.14,
    scoreValue: 280,
    accentHex: '#4ade80'
  },
  deathless_vanguard: {
    archetype: 'deathless_vanguard',
    codeName: '不死重盾禁卫 · DEATHLESS',
    glbUrls: ['/robotics_glb/deathless_shield_vanguard.glb'],
    scaleDim: 2.58,
    maxHp: 225,
    maxShield: 85,
    maxStagger: 125,
    speed: 5.2,
    hitRadius: 1.28,
    scoreValue: 360,
    accentHex: '#38bdf8'
  },
  ares_boss: {
    archetype: 'ares_boss',
    codeName: 'ARES-09 · 赤星重装核能泰坦',
    glbUrls: ['/robotics_glb/talos_full_humanoid.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/talos-data/urdf/talos_full_v2.urdf',
    scaleDim: 5.8,
    maxHp: 2150,
    maxShield: 520,
    maxStagger: 260,
    speed: 4.8,
    hitRadius: 2.85,
    scoreValue: 2500,
    accentHex: '#ff2a55'
  },
  xeno_queen_boss: {
    archetype: 'xeno_queen_boss',
    codeName: 'XENO-OMEGA · 巢穴异形禁卫女皇',
    glbUrls: ['/robotics_glb/xenomorph_queen_boss.glb'],
    scaleDim: 6.2,
    maxHp: 2350,
    maxShield: 0,
    maxStagger: 280,
    speed: 6.2,
    hitRadius: 2.95,
    scoreValue: 2800,
    accentHex: '#84cc16'
  }
};

export interface CombatEnemyEntity {
  polarBridgeEntry?: boolean;
  uid: number;
  archetype: EnemyArchetypeId;
  codeName: string;
  isBoss: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  knockVx: number;
  knockVz: number;
  yaw: number;
  gaitDist: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  shield: number;
  maxShield: number;
  stagger: number;
  maxStagger: number;
  staggeredTimer: number; // > 0 means ACS OVERLOAD 2.5x Direct Hit window!
  dropPodProgress: number; // 0..1 during 0.45s orbital drop-in!
  koTimer: number; // > 0 during 0.42s KO topple/dissolve before removal
  hitFlashTimer: number;
  // Localized Energy Shield Ripple & Shatter Stun (replaces wireframe dome!)
  shieldRippleTimer: number;
  lastShieldHitLocalDir: [number, number, number];
  shieldShatterTimer: number;
  shieldBreakStunTimer: number;
  // Physical Spring Hit-Stagger & Wingman Slow (replaces blind-white full-body flash!)
  hitTiltPitch: number;
  hitTiltRoll: number;
  hitTiltVelP: number;
  hitTiltVelR: number;
  slowTimer: number;
  strafeSign: number;
  aiCooldown: number;
  attackPhase: AttackPhase;
  phaseTimer: number;
  // Boss-specific state
  bossPhase: 1 | 2;
  bossPhaseTransitionTimer: number;
  bossAttackKind: BossAttackKind;
  laserSweepStartYaw: number;
  laserSweepCurrentYaw: number;
  telegraphTargetX: number;
  telegraphTargetZ: number;
}

export type WingmanBehaviorMode = 'escort' | 'pounce_leap' | 'bite_slash';

export interface WingmanGo2State {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  gaitDist: number;
  mode: WingmanBehaviorMode;
  targetUid: number | null;
  modeTimer: number;
  biteTickTimer: number;
  slashFlashTimer: number;
  commandCooldown: number;
}

export interface CombatDamagePopup {
  id: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  amount: number;
  isCrit: boolean;
  isShield: boolean;
  life: number;
}

export interface CombatProjectile {
  active: boolean;
  fromPlayer: boolean;
  kind:
    | 'pulse'
    | 'rail'
    | 'missile'
    | 'bow_arrow'
    | 'enemy_plasma'
    | 'boss_missile'
    | 'xeno_acid';
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  staggerDamage: number;
  life: number;
  maxLife: number;
  homingTargetUid: number | null;
  piercedUids: number[];
  sourceX: number;
  sourceZ: number;
}

export interface GroundTelegraphHazard {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  elapsed: number;
  windupDuration: number;
  damage: number;
  kind: 'mortar' | 'orbital_pillar' | 'boss_phase_nova' | 'player_orbital_ion' | 'acid_pool';
  detonated: boolean;
  lingerTimer: number;
  acidTickTimer?: number;
}

export interface CombatPickup {
  id: number;
  kind: 'repair_core' | 'overcharge_cell';
  x: number;
  y: number;
  z: number;
  life: number;
}

export interface DirectionalThreatArc {
  id: number;
  worldX: number;
  worldZ: number;
  life: number;
  maxLife: number;
  intensity: number;
}

export interface KillfeedEntry {
  id: number;
  weaponLabel: string;
  victimName: string;
  points: number;
  isBoss: boolean;
  ttl: number;
}

export interface HitmarkerFeedback {
  timer: number;
  isCrit: boolean;
  isShield: boolean;
  isKill: boolean;
  lastDamage: number;
}

export interface RunSummarySnapshot {
  outcome: 'victory' | 'defeat';
  score: number;
  bestScore: number;
  kills: number;
  waveReached: number;
  clearTimeSec: number;
  bossHpRemainingPct: number | null;
  mechTitle: string;
}

export interface MarsCombatWorldState {
  shellState: GameShellState;
  outcome: GameOutcome;
  outcomeDelayTimer: number;
  runSnapshot: RunSummarySnapshot | null;
  mapId: BattlefieldMapId;
  polarMission: PolarMissionState | null;

  // Player state
  mechId: PlayerMechId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  aimYaw: number;
  aimPitch: number;
  driveYawRate: number;
  gaitDist: number;
  isGrounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  shield: number;
  maxShield: number;
  shieldRegenDelay: number;
  boostEnergy: number; // 0..100
  dashTimer: number;
  dashCooldown: number;
  invulnTimer: number;
  empCooldown: number;
  empWaveTimer: number;
  empWaveOrigin: [number, number, number];
  ultimateCharge: number; // 0..100
  ultimateBeamTimer: number;
  ultimateBeamTarget: [number, number, number];

  // Weapons, Gun Recoil Spring, Melee War-Axe & Tactical Postures
  activeWeapon: CombatWeaponId;
  weaponCooldown: number;
  meleeSwingTimer: number;
  meleeCooldown: number;
  spreadBloom: number;
  recoilPos: number;
  recoilVel: number;
  heavyPostureTimer: number;
  dodgeBankRad: number;
  wingmanCommandTimer: number;
  muzzleFlashTimer: number;
  lastMuzzleWorld: [number, number, number];

  // Allied Wingman Go2 Companion
  wingman: WingmanGo2State;

  // Progression & Spawning
  elapsedPlaySec: number;
  wave: number;
  score: number;
  bestScore: number;
  combo: number;
  comboTimer: number;
  kills: number;
  vanguardKillsTarget: number;
  spawnTimer: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  bossBannerTimer: number;
  nextUid: number;
  nextProjCursor: number;

  // Hitstop One-Shot Input Buffers (guarantee zero dropped presses during hitstop freeze)
  bufferedDash: boolean;
  bufferedEmp: boolean;
  bufferedMissile: boolean;
  bufferedMelee: boolean;
  bufferedWingman: boolean;
  bufferedUltimate: boolean;
  bufferedSummonBoss: boolean;
  bufferedSummonQueen: boolean;
  bufferedVent: boolean;

  // Juice & Feedback
  hitstopTimer: number;
  cameraTrauma: number;
  hitmarker: HitmarkerFeedback;
  threats: DirectionalThreatArc[];
  killfeed: KillfeedEntry[];
  damagePopups: CombatDamagePopup[];

  // Entities
  enemies: CombatEnemyEntity[];
  projectiles: CombatProjectile[];
  hazards: GroundTelegraphHazard[];
  pickups: CombatPickup[];

  // Per-step emitted audio/VFX events consumed by view
  events: {
    firedWeapon: CombatWeaponId | 'orbital_ion' | 'melee_axe' | null;
    hitConfirmed: { crit: boolean; kill: boolean; shield: boolean; shieldShattered?: boolean } | null;
    bossCue:
      | 'boss_warning'
      | 'acs_stagger_break'
      | 'laser_charge'
      | 'emp_nova'
      | 'xeno_screech'
      | 'shield_clang'
      | null;
    wingmanPounced: boolean;
    ejectedShell: {
      x: number;
      y: number;
      z: number;
      rightX: number;
      rightZ: number;
      isHeavy: boolean;
    } | null;
    sparkImpacts: {
      x: number;
      y: number;
      z: number;
      nx: number;
      ny: number;
      nz: number;
      isShield: boolean;
      isCrit: boolean;
      isShatter: boolean;
      isAcidBlood?: boolean;
      isPhysicalBlock?: boolean;
    }[];
    explosions: { x: number; y: number; z: number; scale: number; colorHex: string }[];
  };
}

export interface CombatFrameAim {
  aimWorldPoint: [number, number, number] | null;
  muzzleWorldPoint?: [number, number, number] | null;
  reticleEnemyUid?: number | null;
}

export interface CombatStepInput extends CombatFrameAim {
  moveForward: number; // -1..1
  moveRight: number; // -1..1
  sprintHeld: boolean;
  fireHeld: boolean;
  missileJustPressed: boolean;
  meleeJustPressed?: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  dashJustPressed: boolean;
  empJustPressed: boolean;
  wingmanCommandJustPressed?: boolean;
  ultimateJustPressed: boolean;
  summonBossJustPressed: boolean;
  summonQueenJustPressed?: boolean;
  ventJustPressed?: boolean;
  interactPressed?: boolean;
  aimYaw: number;
  aimPitch: number;
}

export interface MarsBattlefieldObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
  kind: 'tower' | 'boulder' | 'gate';
}

const MAX_PROJECTILES = 96;
const ARENA_RADIUS = 68;
const PLAYER_COLLISION_RADIUS = 0.96;

const MIDFIELD_BOULDER_LAYOUT: readonly [number, number, number, number][] = [
  [15.5, 0.72, 1.65, 2.35],
  [22.0, 1.16, 1.95, 2.75],
  [16.8, 2.08, 1.70, 2.45],
  [27.5, 2.58, 2.15, 3.05],
  [18.5, 3.58, 1.75, 2.55],
  [31.0, 4.08, 2.25, 3.15],
  [15.0, 5.16, 1.60, 2.30],
  [25.5, 5.68, 2.05, 2.85],
  [34.5, 0.92, 2.20, 3.10],
  [36.0, 2.32, 2.30, 3.25]
];

/**
 * Deterministic physical battlefield cover obstacles:
 * - 6 Colony Defense Relay Towers at r = 56m
 * - 10 Tactical Midfield Basalt Cover Boulders across r = 14..38m
 * Shared 1:1 between physics/ballistics (`marsCombatEngine.ts`), camera collision (`MarsSciFiCombatGame.tsx`), and 3D scene (`marsCombatSceneFX.ts`).
 */
export const MARS_BATTLEFIELD_OBSTACLES: MarsBattlefieldObstacle[] = [
  ...Array.from({ length: 6 }, (_, i) => {
    const ang = (i / 6) * Math.PI * 2 + 0.38;
    const rad = 56;
    return {
      x: Number((Math.cos(ang) * rad).toFixed(3)),
      z: Number((Math.sin(ang) * rad).toFixed(3)),
      radius: 1.65,
      height: 8.4,
      kind: 'tower' as const
    };
  }),
  ...MIDFIELD_BOULDER_LAYOUT.map(([rad, ang, radius, height]) => ({
    x: Number((Math.cos(ang) * rad).toFixed(3)),
    z: Number((Math.sin(ang) * rad).toFixed(3)),
    radius,
    height,
    kind: 'boulder' as const
  }))
];

const polarCoverOpen: MarsBattlefieldObstacle[] = [
  ...MARS_BATTLEFIELD_OBSTACLES.filter(o => o.kind === 'tower'),
  ...POLAR_RIDGE_COVER,
  { x: 12, z: -7, radius: 1.9, height: 2.6, kind: 'boulder' },
  { x: 29, z: -13, radius: 2.1, height: 2.9, kind: 'boulder' },
  { x: 34, z: 14, radius: 2.4, height: 2.9, kind: 'boulder' }
];
const polarCoverClosed: MarsBattlefieldObstacle[] = [...polarCoverOpen, POLAR_GATE];

export function getMarsBattlefieldObstacles(mapId: BattlefieldMapId, gateOpen = false) {
  return mapId === 'polar_ice_canyon' ? gateOpen ? polarCoverOpen : polarCoverClosed : MARS_BATTLEFIELD_OBSTACLES;
}

/**
 * Samples the rendered Martian arena surface height (including `r > 70m` crater-rim uplift).
 */
export function sampleMarsArenaSurfaceHeight(x: number, z: number, mapId: BattlefieldMapId = 'jezero_crater'): number {
  const r = Math.hypot(x, z);
  const rimRise = r > 70 ? Math.pow((r - 70) / 28, 1.85) * 6.5 : 0;
  const baseline = sampleLandTerrainHeight(x, z);
  return (mapId === 'polar_ice_canyon' ? samplePolarArenaHeight(x, z, baseline) : baseline) + rimRise;
}

export function sampleMarsCombatFloor(x: number, z: number, mapId: BattlefieldMapId, gateOpen = false): number {
  if (mapId === 'jezero_crater') return sampleLandTerrainHeight(x, z);
  const height = sampleMarsArenaSurfaceHeight(x, z, mapId);
  const b = POLAR_BRIDGE;
  return gateOpen && Math.abs(x - b.x) <= b.length / 2 && Math.abs(z - b.z) <= b.width / 2
    ? Math.max(height, b.floorY)
    : height;
}
export function sampleMarsCombatNormal(x: number, z: number, mapId: BattlefieldMapId, gateOpen = false): [number, number, number] {
  const s = 0.18;
  const dx = sampleMarsCombatFloor(x - s, z, mapId, gateOpen) - sampleMarsCombatFloor(x + s, z, mapId, gateOpen);
  const dz = sampleMarsCombatFloor(x, z - s, mapId, gateOpen) - sampleMarsCombatFloor(x, z + s, mapId, gateOpen);
  const norm = Math.hypot(dx, 2 * s, dz);
  return [dx / norm, 2 * s / norm, dz / norm];
}
function worldFloor(state: MarsCombatWorldState, x: number, z: number): number {
  return sampleMarsCombatFloor(x, z, state.mapId, state.polarMission?.gateOpen);
}
function chassisFloor(state: MarsCombatWorldState): number {
  const {x, z, yaw, mechId, mapId} = state;
  if (mapId === 'jezero_crater') return sampleLandChassisSupportHeight(x, z, yaw, mechId);
  const wide = mechId === 'mars2020' || mechId === 'sar' || mechId === 'husky_ugv';
  const len = wide ? 0.56 : 0.34, wid = wide ? 0.46 : 0.26;
  const c = Math.cos(yaw), n = Math.sin(yaw);
  const center = worldFloor(state, x, z);
  const h1 = worldFloor(state, x + c*len - n*wid, z + n*len + c*wid);
  const h2 = worldFloor(state, x + c*len + n*wid, z + n*len - c*wid);
  const h3 = worldFloor(state, x - c*len - n*wid, z - n*len + c*wid);
  const h4 = worldFloor(state, x - c*len + n*wid, z - n*len - c*wid);
  return Math.max(center, .104*(center + h1 + h2 + h3 + h4) + .48*Math.max(h1,h2,h3,h4));
}

/**
 * Unconditionally stable analytical closed-form underdamped spring integrator.
 * Immune to explicit-Euler explosion at any dt (even dt = 0.05s or 1.0s).
 */
export function stepAnalyticalDampedSpring(
  pos: number,
  vel: number,
  omega: number,
  zeta: number,
  dt: number
): [number, number] {
  if (dt <= 0) return [pos, vel];
  const clampedZeta = Math.min(0.999, Math.max(0.001, zeta));
  const omegaD = omega * Math.sqrt(1 - clampedZeta * clampedZeta);
  const decay = Math.exp(-clampedZeta * omega * dt);
  const cosD = Math.cos(omegaD * dt);
  const sinD = Math.sin(omegaD * dt);
  const bCoeff = (vel + clampedZeta * omega * pos) / omegaD;
  const nextPos = decay * (pos * cosD + bCoeff * sinD);
  const nextVel =
    decay *
    ((bCoeff * omegaD - clampedZeta * omega * pos) * cosD -
      (pos * omegaD + clampedZeta * omega * bCoeff) * sinD);
  return [nextPos, nextVel];
}

/**
 * Bounded angular turn-rate helper (wraps shortest arc in [-PI, PI]).
 */
export function turnTowardsAngle(currentYaw: number, targetYaw: number, maxDeltaRad: number): number {
  let diff = targetYaw - currentYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDeltaRad) return targetYaw;
  let next = currentYaw + Math.sign(diff) * maxDeltaRad;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

/**
 * Computes exact closest point on 3D segment A->B to target center C (with optional Y-axis ellipsoid scale).
 */
export function closestPointOnSegment3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  yScale: number = 1.0
): { px: number; py: number; pz: number; dist: number; t: number } {
  const abx = bx - ax;
  const aby = (by - ay) * yScale;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = (cy - ay) * yScale;
  const acz = cz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t =
    abLenSq > 1e-8 ? Math.max(0, Math.min(1, (acx * abx + acy * aby + acz * abz) / abLenSq)) : 0;
  const px = ax + (bx - ax) * t;
  const py = ay + (by - ay) * t;
  const pz = az + (bz - az) * t;
  const dist = Math.hypot(px - cx, (py - cy) * yScale, pz - cz);
  return { px, py, pz, dist, t };
}

/**
 * Exact 2D ray-segment entry t in [0, 1] against a horizontal circle (cx, cz, radius), or null if no hit.
 */
export function segmentIntersectsCircle2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  radius: number
): number | null {
  const fx = ax - cx;
  const fz = az - cz;
  const rSq = radius * radius;
  if (fx * fx + fz * fz <= rSq) return 0;
  const dx = bx - ax;
  const dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - rSq;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function getPlayableMechSpec(id: PlayerMechId): PlayableMechSpec {
  return PLAYABLE_MECH_SPECS.find((m) => m.id === id) || PLAYABLE_MECH_SPECS[0];
}

export function getCombatWeaponSpec(id: CombatWeaponId): CombatWeaponSpec {
  return COMBAT_WEAPONS.find((w) => w.id === id) || COMBAT_WEAPONS[0];
}

export function createInitialMarsCombatState(
  mechId: PlayerMechId = 'unitree_g1',
  bestScore: number = 0,
  autostart: boolean = false,
  mapId: BattlefieldMapId = 'jezero_crater'
): MarsCombatWorldState {
  const spec = getPlayableMechSpec(mechId);
  const startY = mapId === 'jezero_crater' ? sampleLandChassisSupportHeight(0, 0, 0, mechId) : sampleMarsCombatFloor(0, 0, mapId);

  const projectiles: CombatProjectile[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    projectiles.push({
      active: false,
      fromPlayer: true,
      kind: 'pulse',
      x: 0,
      y: -999,
      z: 0,
      prevX: 0,
      prevY: -999,
      prevZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      damage: 0,
      staggerDamage: 0,
      life: 0,
      maxLife: 1,
      homingTargetUid: null,
      piercedUids: [],
      sourceX: 0,
      sourceZ: 0
    });
  }

  const state: MarsCombatWorldState = {
    shellState: autostart ? 'playing' : 'title',
    outcome: 'none',
    outcomeDelayTimer: 0,
    runSnapshot: null,
    mapId,
    polarMission: mapId === 'polar_ice_canyon' ? createPolarMission() : null,

    mechId,
    x: 0,
    y: startY,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    aimYaw: 0,
    aimPitch: -0.05,
    driveYawRate: 0,
    gaitDist: 0,
    isGrounded: true,
    coyoteTimer: 0.1,
    jumpBufferTimer: 0,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    ghostHp: spec.maxHp,
    shield: spec.maxShield,
    maxShield: spec.maxShield,
    shieldRegenDelay: 0,
    boostEnergy: 100,
    dashTimer: 0,
    dashCooldown: 0,
    invulnTimer: 0,
    empCooldown: 0,
    empWaveTimer: 0,
    empWaveOrigin: [0, startY, 0],
    ultimateCharge: 100, // Ready on deployment so player can test Orbital Strike immediately!
    ultimateBeamTimer: 0,
    ultimateBeamTarget: [0, 0, -18],

    activeWeapon: 'pulse_rifle',
    weaponCooldown: 0,
    meleeSwingTimer: 0,
    meleeCooldown: 0,
    spreadBloom: 0,
    recoilPos: 0,
    recoilVel: 0,
    heavyPostureTimer: 0,
    dodgeBankRad: 0,
    wingmanCommandTimer: 0,
    muzzleFlashTimer: 0,
    lastMuzzleWorld: [0.9, startY + 1.25, 0.25],

    wingman: {
      x: 2.15,
      y: sampleMarsCombatFloor(2.15, 2.35, mapId),
      z: 2.35,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      gaitDist: 0,
      mode: 'escort',
      targetUid: null,
      modeTimer: 0,
      biteTickTimer: 0,
      slashFlashTimer: 0,
      commandCooldown: 0
    },

    elapsedPlaySec: 0,
    wave: 1,
    score: 0,
    bestScore,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    vanguardKillsTarget: 6,
    spawnTimer: 0.8,
    bossSpawned: false,
    bossDefeated: false,
    bossBannerTimer: 0,
    nextUid: 1,
    nextProjCursor: 0,

    bufferedDash: false,
    bufferedEmp: false,
    bufferedMissile: false,
    bufferedMelee: false,
    bufferedWingman: false,
    bufferedUltimate: false,
    bufferedSummonBoss: false,
    bufferedSummonQueen: false,
    bufferedVent: false,

    hitstopTimer: 0,
    cameraTrauma: 0,
    hitmarker: { timer: 0, isCrit: false, isShield: false, isKill: false, lastDamage: 0 },
    threats: [],
    killfeed: [],
    damagePopups: [],

    enemies: [],
    projectiles,
    hazards: [],
    pickups: [],

    events: {
      firedWeapon: null,
      hitConfirmed: null,
      bossCue: null,
      wingmanPounced: false,
      ejectedShell: null,
      sparkImpacts: [],
      explosions: []
    }
  };

  if (autostart) {
    spawnRandomEnemyWave(state, 3, 101);
  }
  return state;
}

/**
 * Deterministic-capable pseudo-random helper when seed is passed, or Math.random in live play.
 */
function randRange(min: number, max: number, seed?: number): number {
  if (seed !== undefined) {
    const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    const f = s - Math.floor(s);
    return min + f * (max - min);
  }
  return min + Math.random() * (max - min);
}

/**
 * Spawns enemy robots or Xenomorph bio-swarm units around the player's current position.
 */
export function spawnEnemyDropPod(
  state: MarsCombatWorldState,
  archetype: EnemyArchetypeId,
  angleRad?: number,
  distMeters?: number
): CombatEnemyEntity {
  const spec = ENEMY_ARCHETYPE_SPECS[archetype];
  const isBossArch = archetype === 'ares_boss' || archetype === 'xeno_queen_boss';
  const ang = angleRad ?? randRange(0, Math.PI * 2);
  const dist = distMeters ?? (isBossArch ? 30 : randRange(22, 42));
  const rawX = state.x + Math.cos(ang) * dist;
  const rawZ = state.z + Math.sin(ang) * dist;
  const clampedR = Math.hypot(rawX, rawZ);
  const scaleBack = clampedR > ARENA_RADIUS - 4 ? (ARENA_RADIUS - 4) / clampedR : 1;
  let x = rawX * scaleBack;
  let z = rawZ * scaleBack;
  if (archetype !== 'aero_hunter') {
    for (const obs of getMarsBattlefieldObstacles(state.mapId, state.polarMission?.gateOpen)) {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const d = Math.hypot(dx, dz);
      const minClear = obs.radius + spec.hitRadius * 0.9 + 0.35;
      if (d < minClear) {
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        x = obs.x + nx * minClear;
        z = obs.z + nz * minClear;
      }
    }
  }
  const groundY = worldFloor(state, x, z);
  const y = archetype === 'aero_hunter' ? groundY + 6.8 : groundY;

  const waveMult = isBossArch ? 1 : 1 + (state.wave - 1) * 0.16;
  const maxHp = Math.round(spec.maxHp * waveMult);
  const maxShield = Math.round(spec.maxShield * waveMult);

  const entity: CombatEnemyEntity = {
    uid: state.nextUid++,
    archetype,
    codeName: spec.codeName,
    isBoss: isBossArch,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    knockVx: 0,
    knockVz: 0,
    yaw: Math.atan2(state.z - z, state.x - x),
    gaitDist: 0,
    hp: maxHp,
    maxHp,
    ghostHp: maxHp,
    shield: maxShield,
    maxShield,
    stagger: 0,
    maxStagger: spec.maxStagger,
    staggeredTimer: 0,
    dropPodProgress: 0,
    koTimer: 0,
    hitFlashTimer: 0,
    shieldRippleTimer: 0,
    lastShieldHitLocalDir: [0, 0.35, 0.94],
    shieldShatterTimer: 0,
    shieldBreakStunTimer: 0,
    hitTiltPitch: 0,
    hitTiltRoll: 0,
    hitTiltVelP: 0,
    hitTiltVelR: 0,
    slowTimer: 0,
    strafeSign: state.nextUid % 2 === 0 ? 1 : -1,
    aiCooldown: isBossArch ? 1.25 : randRange(0.9, 2.1, state.nextUid),
    attackPhase: 'idle',
    phaseTimer: 0,
    bossPhase: 1,
    bossPhaseTransitionTimer: 0,
    bossAttackKind: 'none',
    laserSweepStartYaw: 0,
    laserSweepCurrentYaw: 0,
    telegraphTargetX: state.x,
    telegraphTargetZ: state.z
  };

  state.enemies.push(entity);
  return entity;
}

export function spawnRandomEnemyWave(
  state: MarsCombatWorldState,
  count: number,
  baseSeed?: number
): void {
  const pool: EnemyArchetypeId[] =
    state.mapId === 'polar_ice_canyon'
      ? [
          'xeno_runner',
          'xeno_spider',
          'xeno_spitter',
          'deathless_vanguard',
          'aero_hunter'
        ]
      : state.wave === 1
        ? [
            'xeno_runner',
            'deathless_vanguard',
            'go2_hound',
            'xeno_spider',
            'g1_vanguard',
            'sar_siege'
          ]
        : [
            'xeno_runner',
            'xeno_spitter',
            'deathless_vanguard',
            'aero_hunter',
            'xeno_spider',
            'go2_hound',
            'g1_vanguard',
            'sar_siege'
          ];

  for (let i = 0; i < count; i++) {
    const pickIdx =
      baseSeed !== undefined
        ? Math.floor(randRange(0, pool.length * 0.999, baseSeed + i * 17))
        : i < pool.length && count >= 3
          ? i
          : Math.floor(Math.random() * pool.length);
    const arch = pool[pickIdx];
    const fanOffset = count > 1 ? (i - (count - 1) * 0.5) * 0.44 : 0;
    const jitter = randRange(-0.14, 0.14, baseSeed !== undefined ? baseSeed + i * 31 : undefined);
    const ang = state.aimYaw + fanOffset + jitter;
    const dist = randRange(16, 24, baseSeed !== undefined ? baseSeed + i * 47 : undefined);
    spawnEnemyDropPod(state, arch, ang, dist);
  }
}

export function summonAresBoss(state: MarsCombatWorldState): CombatEnemyEntity | null {
  if (state.polarMission) return null;
  const existing = state.enemies.find((e) => e.isBoss && e.koTimer <= 0);
  if (existing) return existing;
  state.bossSpawned = true;
  state.bossBannerTimer = 2.8;
  state.cameraTrauma = Math.max(state.cameraTrauma, 0.65);
  state.events.bossCue = 'boss_warning';
  const boss = spawnEnemyDropPod(state, 'ares_boss', state.aimYaw, 21);
  boss.aiCooldown = 0.25;
  state.events.explosions.push({
    x: boss.x,
    y: boss.y + 0.8,
    z: boss.z,
    scale: 3.6,
    colorHex: '#ff2a55'
  });
  return boss;
}

export function summonXenoQueenBoss(state: MarsCombatWorldState): CombatEnemyEntity | null {
  if (state.polarMission && state.polarMission.phase !== 'boss') return null;
  const existing = state.enemies.find((e) => e.isBoss && e.koTimer <= 0);
  if (existing) return existing;
  state.bossSpawned = true;
  state.bossBannerTimer = 2.8;
  state.cameraTrauma = Math.max(state.cameraTrauma, 0.72);
  state.events.bossCue = 'xeno_screech';
  // Mission Queen drops beyond the capture pad regardless of player camera direction.
  const dropX = 53 - state.x, dropZ = 7 - state.z;
  const queen = state.polarMission?.phase === 'boss'
    ? spawnEnemyDropPod(state, 'xeno_queen_boss', Math.atan2(dropZ, dropX), Math.hypot(dropX, dropZ))
    : spawnEnemyDropPod(state, 'xeno_queen_boss', state.aimYaw, 22);
  queen.aiCooldown = 0.3;
  state.events.explosions.push({
    x: queen.x,
    y: queen.y + 1.1,
    z: queen.z,
    scale: 3.9,
    colorHex: '#84cc16'
  });
  return queen;
}

function allocProjectile(state: MarsCombatWorldState): CombatProjectile | null {
  const len = state.projectiles.length;
  if (len === 0) return null;
  for (let offset = 0; offset < len; offset++) {
    const idx = (state.nextProjCursor + offset) % len;
    if (!state.projectiles[idx].active) {
      state.nextProjCursor = (idx + 1) % len;
      state.projectiles[idx].piercedUids.length = 0;
      return state.projectiles[idx];
    }
  }
  const evictIdx = state.nextProjCursor % len;
  state.nextProjCursor = (evictIdx + 1) % len;
  state.projectiles[evictIdx].piercedUids.length = 0;
  return state.projectiles[evictIdx];
}

/**
 * Computes relative screen-space threat angle in radians (0 = ahead, +PI/2 = right, -PI/2 = left, PI = behind).
 */
export function computeRelativeThreatAngleRad(
  playerX: number,
  playerZ: number,
  playerAimYaw: number,
  sourceX: number,
  sourceZ: number
): number {
  const worldAng = Math.atan2(sourceZ - playerZ, sourceX - playerX);
  let rel = worldAng - playerAimYaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return rel;
}

function applyDamageToPlayer(
  state: MarsCombatWorldState,
  rawDamage: number,
  sourceX: number,
  sourceZ: number
): void {
  if (state.invulnTimer > 0 || state.outcome !== 'none' || state.shellState !== 'playing') return;

  state.shieldRegenDelay = 3.4;
  let remaining = rawDamage;
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, remaining);
    state.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) {
    state.hp = Math.max(0, state.hp - remaining);
  }

  state.cameraTrauma = Math.min(1, state.cameraTrauma + Math.min(0.55, rawDamage / 65));
  state.threats.push({
    id: state.nextUid++,
    worldX: sourceX,
    worldZ: sourceZ,
    life: 1.15,
    maxLife: 1.15,
    intensity: Math.min(1, 0.45 + rawDamage / 60)
  });
  if (state.threats.length > 6) {
    state.threats.shift();
  }

  if (state.hp <= 0 && state.outcome === 'none') {
    state.outcome = 'defeat';
    state.outcomeDelayTimer = 0.55;
    state.hitstopTimer = 0.065;
    const boss = state.enemies.find((e) => e.isBoss);
    const nextBest = Math.max(state.bestScore, state.score);
    state.bestScore = nextBest;
    state.runSnapshot = {
      outcome: 'defeat',
      score: state.score,
      bestScore: nextBest,
      kills: state.kills,
      waveReached: state.wave,
      clearTimeSec: Math.round(state.elapsedPlaySec),
      bossHpRemainingPct: boss ? Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)) : null,
      mechTitle: getPlayableMechSpec(state.mechId).title
    };
  }
}

export function damageEnemyEntity(
  state: MarsCombatWorldState,
  enemy: CombatEnemyEntity,
  baseDamage: number,
  staggerDamage: number,
  weaponLabel: string,
  hitWorldPoint?: [number, number, number],
  shieldMultiplier: number = 1.0,
  options?: { fromWingman?: boolean; isWeakPointCrit?: boolean; piercesPhysicalShield?: boolean }
): void {
  if (enemy.koTimer > 0) return;

  const centerY = enemy.y + (enemy.isBoss ? 2.15 : enemy.archetype === 'aero_hunter' ? 0 : 0.95);
  const hx = hitWorldPoint ? hitWorldPoint[0] : enemy.x + Math.cos(enemy.yaw) * 0.65;
  const hy = hitWorldPoint ? hitWorldPoint[1] : centerY + 0.15;
  const hz = hitWorldPoint ? hitWorldPoint[2] : enemy.z + Math.sin(enemy.yaw) * 0.65;

  // Compute unit hit normal in enemy local frame for Localized Hexagonal Shield & Directional Tower-Shield Block!
  const relWX = hx - enemy.x;
  const relWY = hy - centerY;
  const relWZ = hz - enemy.z;
  const relLen = Math.max(0.01, Math.hypot(relWX, relWY, relWZ));
  const worldNx = relWX / relLen;
  const worldNy = relWY / relLen;
  const worldNz = relWZ / relLen;
  const cosY = Math.cos(enemy.yaw);
  const sinY = Math.sin(enemy.yaw);
  const localDirX = worldNx * cosY + worldNz * sinY;
  const localDirZ = -worldNx * sinY + worldNz * cosY;

  // Deathless Vanguard Directional Frontal Tower-Shield Block (±62° arc when unstaggered & non-piercing)
  let effectiveBaseDamage = baseDamage;
  let effectiveStagger = staggerDamage;
  let isPhysicalBlock = false;
  if (
    enemy.archetype === 'deathless_vanguard' &&
    enemy.staggeredTimer <= 0 &&
    enemy.shieldBreakStunTimer <= 0 &&
    !options?.piercesPhysicalShield &&
    !options?.fromWingman &&
    localDirX > 0.47
  ) {
    isPhysicalBlock = true;
    effectiveBaseDamage = Math.max(2, Math.round(baseDamage * 0.22));
    effectiveStagger = staggerDamage * 0.3;
    enemy.shieldRippleTimer = 0.42;
    enemy.lastShieldHitLocalDir = [localDirX, worldNy, localDirZ];
    if (!state.events.bossCue) {
      state.events.bossCue = 'shield_clang';
    }
  }

  const isWeakPoint = Boolean(options?.isWeakPointCrit) && !isPhysicalBlock;
  const isDirectStaggerHit = enemy.staggeredTimer > 0 || enemy.shieldBreakStunTimer > 0;
  const staggerMult = enemy.staggeredTimer > 0 ? 2.5 : enemy.shieldBreakStunTimer > 0 ? 1.35 : 1.0;
  const weakPointMult = isWeakPoint && enemy.shield <= 0 ? 1.35 : 1.0;
  const displayedDamage = Math.round(effectiveBaseDamage * staggerMult * weakPointMult);
  let finalDmg = displayedDamage;
  let hitShield = isPhysicalBlock;
  let shieldShattered = false;

  let popupAmount = displayedDamage;
  if (enemy.shield > 0) {
    hitShield = true;
    enemy.shieldRippleTimer = 0.48;
    enemy.lastShieldHitLocalDir = [localDirX, worldNy, localDirZ];

    const shieldDmg = Math.round(finalDmg * shieldMultiplier);
    popupAmount = shieldDmg;
    if (shieldDmg >= enemy.shield) {
      const remainderRatio = Math.max(0, (shieldDmg - enemy.shield) / Math.max(1, shieldDmg));
      enemy.shield = 0;
      finalDmg = Math.round(finalDmg * remainderRatio);
      shieldShattered = true;
      enemy.shieldShatterTimer = 0.58;
      enemy.shieldBreakStunTimer = enemy.isBoss ? 1.35 : 1.15;
      enemy.attackPhase = 'idle';
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.045);
      state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.28);
    } else {
      enemy.shield -= shieldDmg;
      finalDmg = 0;
    }
  }

  if (finalDmg > 0) {
    enemy.hp = Math.max(0, enemy.hp - finalDmg);
  }

  enemy.hitFlashTimer = 0.08;
  // Physical Hit-Stagger Spring Impulse + Dedicated Knockback Velocity Channel (never overwritten by AI!)
  const massFactor =
    enemy.isBoss
      ? 0.22
      : enemy.archetype === 'sar_siege' || (isPhysicalBlock && enemy.archetype === 'deathless_vanguard')
        ? 0.45
        : 1.0;
  const impulseMag = Math.min(2.2, (0.55 + effectiveBaseDamage / 85) * massFactor);
  enemy.hitTiltVelP += (-localDirX * 6.8 + 1.8) * impulseMag;
  enemy.hitTiltVelR += localDirZ * 6.2 * impulseMag;
  const knockSpd = (2.1 + effectiveBaseDamage * 0.028) * massFactor;
  enemy.knockVx -= worldNx * knockSpd;
  enemy.knockVz -= worldNz * knockSpd;

  const isCritHit = isDirectStaggerHit || shieldShattered || (isWeakPoint && !hitShield);
  const isAcidBlood = isBiologicalXenoEnemy(enemy.archetype) && !hitShield;

  state.events.sparkImpacts.push({
    x: hx,
    y: hy,
    z: hz,
    nx: worldNx,
    ny: Math.max(0.15, worldNy),
    nz: worldNz,
    isShield: hitShield,
    isCrit: isCritHit,
    isShatter: shieldShattered,
    isAcidBlood,
    isPhysicalBlock
  });

  state.damagePopups.push({
    id: state.nextUid++,
    worldX: hx + (Math.random() - 0.5) * 0.35,
    worldY: hy + 0.35,
    worldZ: hz + (Math.random() - 0.5) * 0.35,
    amount: popupAmount,
    isCrit: isCritHit,
    isShield: hitShield && !shieldShattered,
    life: 0.72
  });
  if (state.damagePopups.length > 12) {
    state.damagePopups.shift();
  }

  state.ultimateCharge = Math.min(100, state.ultimateCharge + (enemy.isBoss ? 2.8 : 4.5));

  // Accumulate Armored Core 6 ACS Stagger bar when not already staggered
  if (enemy.staggeredTimer <= 0 && enemy.hp > 0) {
    enemy.stagger = Math.min(enemy.maxStagger, enemy.stagger + effectiveStagger * (isWeakPoint ? 1.25 : 1.0));
    if (enemy.stagger >= enemy.maxStagger) {
      enemy.stagger = enemy.maxStagger;
      enemy.staggeredTimer = enemy.isBoss ? 3.8 : 2.4;
      enemy.attackPhase = 'idle';
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.065);
      state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.42);
      state.events.bossCue = 'acs_stagger_break';
      state.events.explosions.push({
        x: enemy.x,
        y: enemy.y + (enemy.isBoss ? 1.8 : 0.9),
        z: enemy.z,
        scale: enemy.isBoss ? 2.8 : 1.4,
        colorHex: '#f59e0b'
      });
    }
  }

  // Boss 50% HP Phase 2 Coral / Queen Bio-Frenzy Overdrive transition (preserves active ACS stagger punish window!)
  if (enemy.isBoss && enemy.bossPhase === 1 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
    enemy.bossPhase = 2;
    enemy.bossPhaseTransitionTimer = enemy.staggeredTimer > 0 ? 0.45 : 1.25;
    if (enemy.staggeredTimer <= 0) {
      enemy.stagger = 0;
    }
    state.hitstopTimer = Math.max(state.hitstopTimer, 0.07);
    state.cameraTrauma = Math.max(state.cameraTrauma, 0.72);
    state.events.bossCue = enemy.archetype === 'xeno_queen_boss' ? 'xeno_screech' : 'boss_warning';
    state.hazards.push({
      id: state.nextUid++,
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      radius: 10.5,
      elapsed: 0,
      windupDuration: 1.05,
      damage: 42,
      kind: 'boss_phase_nova',
      detonated: false,
      lingerTimer: 0.45
    });
  }

  const killed = enemy.hp <= 0;
  if (!options?.fromWingman || killed) {
    state.hitmarker = {
      timer: killed ? 0.22 : 0.12,
      isCrit: isCritHit,
      isShield: hitShield && !isCritHit,
      isKill: killed,
      lastDamage: popupAmount
    };
    state.events.hitConfirmed = {
      crit: isCritHit,
      kill: killed,
      shield: hitShield,
      shieldShattered
    };
  }

  if (killed) {
    enemy.koTimer = 0.42;
    state.hitstopTimer = Math.max(state.hitstopTimer, enemy.isBoss ? 0.08 : 0.04);
    state.cameraTrauma = Math.min(1, state.cameraTrauma + (enemy.isBoss ? 0.85 : 0.25));
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = 5.0;
    const spec = ENEMY_ARCHETYPE_SPECS[enemy.archetype];
    const pts = Math.round(spec.scoreValue * (1 + Math.min(1.5, (state.combo - 1) * 0.15)));
    state.score += pts;
    state.bestScore = Math.max(state.bestScore, state.score);

    state.killfeed.unshift({
      id: state.nextUid++,
      weaponLabel,
      victimName: enemy.codeName,
      points: pts,
      isBoss: enemy.isBoss,
      ttl: 3.4
    });
    if (state.killfeed.length > 4) state.killfeed.pop();

    state.events.explosions.push({
      x: enemy.x,
      y: enemy.y + (enemy.isBoss ? 1.8 : 0.8),
      z: enemy.z,
      scale: enemy.isBoss ? 4.2 : 1.65,
      colorHex: spec.accentHex
    });

    state.pickups.push({
      id: state.nextUid++,
      kind: state.kills % 2 === 0 ? 'repair_core' : 'overcharge_cell',
      x: enemy.x,
      y: worldFloor(state, enemy.x, enemy.z) + 0.55,
      z: enemy.z,
      life: 18
    });

    if (enemy.isBoss && state.outcome === 'none') {
      state.bossDefeated = true;
      state.outcome = 'victory';
      state.outcomeDelayTimer = 0.65;
      state.runSnapshot = {
        outcome: 'victory',
        score: state.score,
        bestScore: state.bestScore,
        kills: state.kills,
        waveReached: state.wave,
        clearTimeSec: Math.max(1, Math.round(state.elapsedPlaySec)),
        bossHpRemainingPct: 0,
        mechTitle: getPlayableMechSpec(state.mechId).title
      };
    }
  }
}

function applyMissileSplashDamage(
  state: MarsCombatWorldState,
  bx: number,
  by: number,
  bz: number,
  directHitUid: number | null,
  baseDamage: number,
  baseStagger: number
): void {
  const splashRadius = 3.6;
  for (const e of state.enemies) {
    if (e.koTimer > 0 || e.dropPodProgress < 0.7 || e.uid === directHitUid) continue;
    const d = Math.hypot(e.x - bx, e.z - bz);
    if (d <= splashRadius) {
      const falloff = Math.max(0.35, 1 - d / splashRadius);
      damageEnemyEntity(
        state,
        e,
        Math.round(baseDamage * 0.58 * falloff),
        Math.round(baseStagger * 0.6 * falloff),
        '蜂群导弹爆破溅射',
        [e.x, Math.max(by, e.y + 0.8), e.z],
        1.0
      );
    }
  }
}

/**
 * Advances one simulation frame of the Mars Sci-Fi Mech Combat Game.
 * Clamps rawDt <= 0.05s, buffers edge inputs across hitstop frames, and uses analytical springs.
 */
export function stepMarsCombatWorld(
  state: MarsCombatWorldState,
  rawDt: number,
  input: CombatStepInput,
  sampleView?: () => CombatFrameAim
): void {
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  state.events.firedWeapon = null;
  state.events.hitConfirmed = null;
  state.events.bossCue = null;
  state.events.wingmanPounced = false;
  state.events.ejectedShell = null;
  state.events.sparkImpacts.length = 0;
  state.events.explosions.length = 0;

  if (state.shellState !== 'playing') return;

  // Buffer all one-shot edge triggers BEFORE hitstop early-return so zero player inputs are dropped!
  if (input.jumpJustPressed) state.jumpBufferTimer = 0.14;
  if (input.dashJustPressed) state.bufferedDash = true;
  if (input.empJustPressed) state.bufferedEmp = true;
  if (input.missileJustPressed) state.bufferedMissile = true;
  if (input.meleeJustPressed) state.bufferedMelee = true;
  if (input.wingmanCommandJustPressed) state.bufferedWingman = true;
  if (input.ultimateJustPressed) state.bufferedUltimate = true;
  if (input.summonBossJustPressed) state.bufferedSummonBoss = true;
  if (input.summonQueenJustPressed) state.bufferedSummonQueen = true;
  if (input.ventJustPressed) state.bufferedVent = true;
  if (input.interactPressed && state.polarMission) state.polarMission.interactBuffered = true;

  // Real-time visual feedback timers continue ticking during hitstop
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.45);
  if (state.hitmarker.timer > 0) state.hitmarker.timer = Math.max(0, state.hitmarker.timer - dt);
  if (state.bossBannerTimer > 0) state.bossBannerTimer = Math.max(0, state.bossBannerTimer - dt);
  if (state.empWaveTimer > 0) state.empWaveTimer = Math.max(0, state.empWaveTimer - dt);
  if (state.ultimateBeamTimer > 0) state.ultimateBeamTimer = Math.max(0, state.ultimateBeamTimer - dt);
  if (state.muzzleFlashTimer > 0) state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - dt);
  if (state.heavyPostureTimer > 0) state.heavyPostureTimer = Math.max(0, state.heavyPostureTimer - dt);
  if (state.wingmanCommandTimer > 0) state.wingmanCommandTimer = Math.max(0, state.wingmanCommandTimer - dt);
  if (state.meleeSwingTimer > 0) state.meleeSwingTimer = Math.max(0, state.meleeSwingTimer - dt);

  // Unconditionally stable analytical gun recoil spring (omega_n = 36 rad/s, zeta = 0.72)
  const [nextRecPos, nextRecVel] = stepAnalyticalDampedSpring(
    state.recoilPos,
    state.recoilVel,
    36.0,
    0.72,
    dt
  );
  state.recoilPos = Math.max(-0.08, Math.min(0.45, nextRecPos));
  state.recoilVel = nextRecVel;

  for (let i = state.threats.length - 1; i >= 0; i--) {
    state.threats[i].life -= dt;
    if (state.threats[i].life <= 0) state.threats.splice(i, 1);
  }
  for (let i = state.killfeed.length - 1; i >= 0; i--) {
    state.killfeed[i].ttl -= dt;
    if (state.killfeed[i].ttl <= 0) state.killfeed.splice(i, 1);
  }
  for (let i = state.damagePopups.length - 1; i >= 0; i--) {
    state.damagePopups[i].life -= dt;
    state.damagePopups[i].worldY += dt * 1.45;
    if (state.damagePopups[i].life <= 0) state.damagePopups.splice(i, 1);
  }

  // Frame-rate independent delayed trailing ghost HP bar
  state.ghostHp += (state.hp - state.ghostHp) * (1 - Math.exp(-4.5 * dt));

  // Outcome transition beat
  if (state.outcome !== 'none') {
    state.outcomeDelayTimer -= dt;
    if (state.outcomeDelayTimer <= 0) {
      state.shellState = 'gameover';
      return;
    }
  }

  // Sim-level Hitstop freeze (buffered inputs stay latched for the exact frame hitstop ends!)
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return;
  }

  // Consume latched one-shot inputs now that simulation is advancing
  const dashTriggered = state.bufferedDash;
  const empTriggered = state.bufferedEmp;
  const missileTriggered = state.bufferedMissile;
  const meleeTriggered = state.bufferedMelee;
  const wingmanTriggered = state.bufferedWingman;
  const ultimateTriggered = state.bufferedUltimate;
  const summonBossTriggered = state.bufferedSummonBoss;
  const summonQueenTriggered = state.bufferedSummonQueen;
  const ventTriggered = state.bufferedVent;
  state.bufferedDash = false;
  state.bufferedEmp = false;
  state.bufferedMissile = false;
  state.bufferedMelee = false;
  state.bufferedWingman = false;
  state.bufferedUltimate = false;
  state.bufferedSummonBoss = false;
  state.bufferedSummonQueen = false;
  state.bufferedVent = false;

  state.elapsedPlaySec += dt;
  state.aimYaw = input.aimYaw;
  state.aimPitch = input.aimPitch;

  if (!state.polarMission && summonQueenTriggered && !state.bossSpawned) {
    summonXenoQueenBoss(state);
  } else if (!state.polarMission && summonBossTriggered && !state.bossSpawned) {
    summonAresBoss(state);
  }

  if (ventTriggered) {
    state.spreadBloom = 0;
    state.recoilPos *= 0.25;
    state.boostEnergy = Math.min(100, state.boostEnergy + 10);
  }

  // Combo decay
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  // Cooldowns & regeneration
  state.weaponCooldown = Math.max(0, state.weaponCooldown - dt);
  state.meleeCooldown = Math.max(0, state.meleeCooldown - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.invulnTimer = Math.max(0, state.invulnTimer - dt);
  state.empCooldown = Math.max(0, state.empCooldown - dt);
  state.spreadBloom = Math.max(0, state.spreadBloom - dt * 2.8);
  state.ultimateCharge = Math.min(100, state.ultimateCharge + dt * 1.4);

  if (state.shieldRegenDelay > 0) {
    state.shieldRegenDelay -= dt;
  } else if (state.shield < state.maxShield && state.outcome === 'none') {
    state.shield = Math.min(state.maxShield, state.shield + dt * 24);
  }

  // 1. Player Movement, Coyote Jump, Frame-Rate Independent Jump Cut & Vector Quick-Boost Dash
  const mechSpec = getPlayableMechSpec(state.mechId);
  const fwdX = Math.cos(state.aimYaw);
  const fwdZ = Math.sin(state.aimYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  let wishX = fwdX * input.moveForward + rightX * input.moveRight;
  let wishZ = fwdZ * input.moveForward + rightZ * input.moveRight;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const driving = isGroundDriveVehicle(state.mechId);
  const signedSpeed = state.vx * Math.cos(state.yaw) + state.vz * Math.sin(state.yaw);

  // Vector Quick-Boost Dash [C / Alt / Shift-Tap] with i-frames
  if (dashTriggered && state.dashCooldown <= 0 && state.boostEnergy >= 28) {
    state.dashCooldown = 0.68;
    state.dashTimer = 0.22;
    state.invulnTimer = 0.34;
    state.boostEnergy = Math.max(0, state.boostEnergy - 28);
    const driveSign = Math.sign(input.moveForward || signedSpeed) || 1;
    const dX = driving ? Math.cos(state.yaw) * driveSign : wishLen > 0.05 ? wishX : fwdX;
    const dZ = driving ? Math.sin(state.yaw) * driveSign : wishLen > 0.05 ? wishZ : fwdZ;
    state.vx = dX * mechSpec.dashImpulse;
    state.vz = dZ * mechSpec.dashImpulse;
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.16);
  }

  if (driving) {
    const sprint = input.sprintHeld && input.moveForward !== 0 && state.boostEnergy > 5;
    const speed = state.vx * Math.cos(state.yaw) + state.vz * Math.sin(state.yaw);
    const surge = state.dashTimer > 0 ? speed : undefined;
    if (surge === undefined) state.boostEnergy = Math.max(0, Math.min(100, state.boostEnergy + dt * (sprint ? -18 : 22)));
    state.dashTimer = Math.max(0, state.dashTimer - dt);
    if (state.isGrounded) {
      const drive = stepGroundDrive(speed, state.driveYawRate, input.moveForward, input.moveRight,
        sprint ? mechSpec.sprintSpeed : mechSpec.cruiseSpeed, getSandboxActorSpec(state.mechId).turnRate, dt, surge);
      state.driveYawRate = drive.yawRate;
      state.yaw += drive.yawRate * dt;
      state.vx = Math.cos(state.yaw) * drive.speed;
      state.vz = Math.sin(state.yaw) * drive.speed;
    }
  } else if (state.dashTimer > 0) {
    state.dashTimer -= dt;
  } else {
    const isSprinting = input.sprintHeld && wishLen > 0.1 && state.boostEnergy > 5;
    if (isSprinting) {
      state.boostEnergy = Math.max(0, state.boostEnergy - dt * 18);
    } else {
      state.boostEnergy = Math.min(100, state.boostEnergy + dt * 22);
    }
    const targetSpeed = isSprinting ? mechSpec.sprintSpeed : mechSpec.cruiseSpeed;
    const targetVx = wishX * targetSpeed * Math.min(1, wishLen);
    const targetVz = wishZ * targetSpeed * Math.min(1, wishLen);
    const accelRate = state.isGrounded ? 12 : 7.5;
    const accelK = 1 - Math.exp(-accelRate * dt);
    state.vx += (targetVx - state.vx) * accelK;
    state.vz += (targetVz - state.vz) * accelK;
  }

  // Jump buffering + Coyote time + Frame-rate independent variable jump cut
  if (!input.jumpJustPressed) {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.isGrounded) state.coyoteTimer = 0.11;
  else state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);

  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = 10.6;
    state.isGrounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
  } else if (!input.jumpHeld && state.vy > 2.5) {
    state.vy *= Math.pow(0.55, dt * 60);
  }

  if (!state.isGrounded) {
    const grav = state.vy < 0 ? 24.5 : 20.5;
    state.vy -= grav * dt;
  }

  const previousX = state.x;
  const previousZ = state.z;
  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.y += state.vy * dt;
  resolvePlayerArenaContacts(state, previousX, previousZ);

  const floorY = chassisFloor(state);
  if (state.y <= floorY + 0.02 && state.vy <= 0) {
    state.y = floorY;
    state.vy = 0;
    state.isGrounded = true;
  } else if (state.y > floorY + 0.08) {
    state.isGrounded = false;
  }

  const horizSpeed = Math.hypot(state.vx, state.vz);
  const chassisFwdX = Math.cos(state.yaw);
  const chassisFwdZ = Math.sin(state.yaw);
  const movedX = state.x - previousX;
  const movedZ = state.z - previousZ;
  const signedTravel = movedX * chassisFwdX + movedZ * chassisFwdZ;
  state.gaitDist += driving ? signedTravel : Math.hypot(movedX, movedZ) * (signedTravel < -0.35 * dt ? -1 : 1);

  if (!driving) {
    const desiredYaw = horizSpeed > 1.05 ? Math.atan2(state.vz, state.vx) : state.aimYaw;
    state.yaw += wrapAnglePi(desiredYaw - state.yaw) * (1 - Math.exp(-10 * dt));
  }

  const latVel = state.vx * rightX + state.vz * rightZ;
  const targetBank = driving ? 0 :
    state.dashTimer > 0
      ? Math.max(-0.46, Math.min(0.46, (Math.abs(latVel) > 1.5 ? Math.sign(latVel) : 1) * 0.42))
      : Math.max(-0.16, Math.min(0.16, latVel * 0.012));
  state.dodgeBankRad += (targetBank - state.dodgeBankRad) * (1 - Math.exp(-14 * dt));

  const view = sampleView?.() ?? input;

  // 2A. Allied Wingman Go2 Tactical Command [Q / Middle Mouse] (prefers grounded targets so Go2 never levitates!)
  state.wingman.commandCooldown = Math.max(0, state.wingman.commandCooldown - dt);
  if (wingmanTriggered && state.wingman.commandCooldown <= 0) {
    let bestEnemy: CombatEnemyEntity | null = null;
    let bestScoreDist = Infinity;
    const refX = view.aimWorldPoint ? view.aimWorldPoint[0] : state.x + fwdX * 18;
    const refZ = view.aimWorldPoint ? view.aimWorldPoint[2] : state.z + fwdZ * 18;
    const hasGrounded = state.enemies.some((e) => e.koTimer <= 0 && e.archetype !== 'aero_hunter');
    for (const e of state.enemies) {
      if (e.koTimer > 0) continue;
      if (hasGrounded && e.archetype === 'aero_hunter') continue;
      const dAim = Math.hypot(e.x - refX, e.z - refZ);
      const weight = e.isBoss ? dAim * 0.75 : dAim;
      if (weight < bestScoreDist) {
        bestScoreDist = weight;
        bestEnemy = e;
      }
    }
    state.wingmanCommandTimer = 0.42;
    state.wingman.commandCooldown = 4.2;
    state.events.wingmanPounced = true;
    if (bestEnemy && bestEnemy.archetype !== 'aero_hunter') {
      state.wingman.mode = 'pounce_leap';
      state.wingman.targetUid = bestEnemy.uid;
      state.wingman.modeTimer = 0.52;
      const dxW = bestEnemy.x - state.wingman.x;
      const dzW = bestEnemy.z - state.wingman.z;
      const dW = Math.max(0.5, Math.hypot(dxW, dzW));
      state.wingman.vx = (dxW / dW) * 28.0;
      state.wingman.vz = (dzW / dW) * 28.0;
      state.wingman.vy = 7.4;
      state.wingman.yaw = Math.atan2(dzW, dxW);
    }
  }

  // 2B. Player Tactical Abilities: [E] EMP Nova & [V] Orbital Ion Cannon
  if (empTriggered && state.empCooldown <= 0) {
    state.empCooldown = 7.5;
    state.empWaveTimer = 0.65;
    state.heavyPostureTimer = 0.35;
    state.empWaveOrigin = [state.x, state.y + 0.5, state.z];
    state.shield = Math.min(state.maxShield, state.shield + 48);
    state.events.bossCue = 'emp_nova';
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.3);

    for (const p of state.projectiles) {
      if (p.active && !p.fromPlayer) {
        if (Math.hypot(p.x - state.x, p.z - state.z) <= 13.5) {
          p.active = false;
        }
      }
    }
    for (const e of state.enemies) {
      if (e.koTimer <= 0 && Math.hypot(e.x - state.x, e.z - state.z) <= 12.5) {
        damageEnemyEntity(state, e, 48, 52, 'EMP 脉冲新星', [e.x, e.y + 0.9, e.z], 1.6, {
          piercesPhysicalShield: true
        });
      }
    }
  }

  if (ultimateTriggered && state.ultimateCharge >= 100) {
    state.ultimateCharge = 0;
    state.heavyPostureTimer = 0.35;
    let tx = state.x + fwdX * 22;
    let tz = state.z + fwdZ * 22;
    const priorityEnemy =
      state.enemies.find((e) => e.isBoss && e.koTimer <= 0) ||
      state.enemies.find((e) => e.koTimer <= 0);
    if (priorityEnemy) {
      tx = priorityEnemy.x;
      tz = priorityEnemy.z;
    } else if (view.aimWorldPoint) {
      tx = view.aimWorldPoint[0];
      tz = view.aimWorldPoint[2];
    }
    const ty = worldFloor(state, tx, tz);
    state.ultimateBeamTimer = 1.65;
    state.ultimateBeamTarget = [tx, ty, tz];
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.65);
    state.events.firedWeapon = 'orbital_ion';
    state.events.explosions.push({ x: tx, y: ty + 1.0, z: tz, scale: 3.8, colorHex: '#00e5ff' });

    for (const e of state.enemies) {
      if (e.koTimer <= 0 && Math.hypot(e.x - tx, e.z - tz) <= 9.5) {
        damageEnemyEntity(state, e, 360, 145, '天基歼星离子炮', [e.x, e.y + 1.2, e.z], 2.0, {
          piercesPhysicalShield: true
        });
      }
    }
  }

  // 2C. Dedicated High-Frequency Combat War-Axe Cleave [X] (Shatters Shields + Cleaves Swarms + Leeches Shield!)
  if (meleeTriggered && state.meleeCooldown <= 0 && state.outcome === 'none') {
    state.meleeCooldown = 0.82;
    state.meleeSwingTimer = 0.32;
    state.heavyPostureTimer = 0.28;
    state.events.firedWeapon = 'melee_axe';
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.24);
    state.vx += fwdX * 11.5;
    state.vz += fwdZ * 11.5;

    for (const p of state.projectiles) {
      if (p.active && !p.fromPlayer) {
        const dxP = p.x - state.x;
        const dzP = p.z - state.z;
        const dP = Math.hypot(dxP, dzP);
        if (dP <= 3.6 && dxP * fwdX + dzP * fwdZ >= 0) {
          p.active = false;
        }
      }
    }

    let cleavedAny = false;
    for (const e of state.enemies) {
      if (e.koTimer > 0 || e.dropPodProgress < 0.65) continue;
      const dxE = e.x - state.x;
      const dzE = e.z - state.z;
      const distE = Math.hypot(dxE, dzE);
      const reach = 4.35 + ENEMY_ARCHETYPE_SPECS[e.archetype].hitRadius * 0.55;
      if (distE <= reach) {
        const dot = distE > 0.05 ? (dxE / distE) * fwdX + (dzE / distE) * fwdZ : 1.0;
        if (distE <= 1.7 || dot >= 0.16) {
          cleavedAny = true;
          state.shield = Math.min(state.maxShield, state.shield + 18);
          if (e.archetype === 'deathless_vanguard') {
            e.shieldBreakStunTimer = Math.max(e.shieldBreakStunTimer, 1.15);
            e.attackPhase = 'idle';
          }
          damageEnemyEntity(
            state,
            e,
            168,
            68,
            '高周波战斧顺劈',
            [e.x, e.y + 1.05, e.z],
            2.25,
            { piercesPhysicalShield: true, isWeakPointCrit: true }
          );
        }
      }
    }
    if (cleavedAny) {
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.038);
    }
  }

  // 3. Player Primary Weapon Fire (LMB) & Quick Homing Missile Salvo (RMB / F) — 100% True Muzzle World Pos!
  const fireMissileSalvo = missileTriggered;
  const effectiveMuzzle: [number, number, number] = view.muzzleWorldPoint
    ? view.muzzleWorldPoint
    : [
        state.x + fwdX * 0.92 + rightX * 0.28,
        state.y + 1.28,
        state.z + fwdZ * 0.92 + rightZ * 0.28
      ];
  state.lastMuzzleWorld = effectiveMuzzle;

  if ((input.fireHeld || fireMissileSalvo) && state.weaponCooldown <= 0 && state.outcome === 'none') {
    const wSpec = getCombatWeaponSpec(fireMissileSalvo ? 'missile_pod' : state.activeWeapon);
    state.weaponCooldown = wSpec.cooldownSec;
    state.events.firedWeapon = wSpec.id;
    state.muzzleFlashTimer = wSpec.id === 'railgun' ? 0.085 : wSpec.id === 'compound_bow' ? 0.04 : 0.052;

    if (wSpec.id === 'railgun') {
      state.recoilVel += 8.8;
      state.heavyPostureTimer = 0.35;
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.025);
    } else if (wSpec.id === 'missile_pod') {
      state.recoilVel += 6.2;
      state.heavyPostureTimer = 0.35;
    } else if (wSpec.id === 'compound_bow') {
      state.recoilVel += 2.6;
      state.heavyPostureTimer = 0.22;
    } else {
      state.recoilVel += 3.9;
    }

    const muzzleX = effectiveMuzzle[0];
    const muzzleY = effectiveMuzzle[1];
    const muzzleZ = effectiveMuzzle[2];

    if (wSpec.id !== 'compound_bow') {
      state.events.ejectedShell = {
        x: muzzleX - fwdX * 0.28 + rightX * 0.08,
        y: muzzleY + 0.04,
        z: muzzleZ - fwdZ * 0.28 + rightZ * 0.08,
        rightX,
        rightZ,
        isHeavy: wSpec.id !== 'pulse_rifle'
      };
    }

    let dirX = Math.cos(state.aimPitch) * Math.cos(state.aimYaw);
    let dirY = Math.sin(state.aimPitch);
    let dirZ = Math.cos(state.aimPitch) * Math.sin(state.aimYaw);
    if (view.aimWorldPoint) {
      const dx = view.aimWorldPoint[0] - muzzleX;
      const dy = view.aimWorldPoint[1] - muzzleY;
      const dz = view.aimWorldPoint[2] - muzzleZ;
      const dLen = Math.hypot(dx, dy, dz);
      // Reject close behind-back parallax points (< 0.8m or pointing >75 deg behind aimYaw)
      const aimDot = (dx / Math.max(0.001, dLen)) * fwdX + (dz / Math.max(0.001, dLen)) * fwdZ;
      if (dLen > 0.0001 && (sampleView || (dLen > 0.8 && aimDot > 0.15))) {
        dirX = dx / dLen;
        dirY = dy / dLen;
        dirZ = dz / dLen;
      }
    }

    if (wSpec.id === 'missile_pod') {
      const liveTargets = state.enemies.filter((enemy) =>
        enemy.koTimer <= 0 && (view.reticleEnemyUid === undefined || enemy.uid === view.reticleEnemyUid)
      );
      for (let m = 0; m < 4; m++) {
        const proj = allocProjectile(state);
        if (!proj) break;
        const fanAng = (m - 1.5) * 0.22;
        const horizontal = Math.hypot(dirX, dirZ) || 1;
        const side = Math.sin(fanAng);
        const forward = Math.cos(fanAng);
        const vxDir = dirX * forward - (dirZ / horizontal) * side;
        const vzDir = dirZ * forward + (dirX / horizontal) * side;
        const lockEnemy = liveTargets.length > 0 ? liveTargets[m % liveTargets.length] : null;
        proj.active = true;
        proj.fromPlayer = true;
        proj.kind = 'missile';
        proj.x = muzzleX;
        proj.y = muzzleY;
        proj.z = muzzleZ;
        proj.prevX = proj.x;
        proj.prevY = proj.y;
        proj.prevZ = proj.z;
        proj.vx = vxDir * wSpec.projectileSpeed;
        proj.vy = dirY * forward * wSpec.projectileSpeed;
        proj.vz = vzDir * wSpec.projectileSpeed;
        proj.damage = wSpec.damage;
        proj.staggerDamage = wSpec.staggerDamage;
        proj.life = 2.6;
        proj.maxLife = 2.6;
        proj.homingTargetUid = lockEnemy ? lockEnemy.uid : null;
        proj.sourceX = state.x;
        proj.sourceZ = state.z;
      }
      state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.16);
    } else {
      const proj = allocProjectile(state);
      if (proj) {
        const spread = wSpec.spreadRad + state.spreadBloom;
        const jYaw = (Math.random() - 0.5) * spread;
        const jPitch = (Math.random() - 0.5) * spread * 0.6;
        const cY = Math.cos(jYaw);
        const sY = Math.sin(jYaw);
        const sx = dirX * cY - dirZ * sY;
        const sz = dirX * sY + dirZ * cY;
        const sy = dirY + jPitch;
        const inv = 1 / Math.max(0.001, Math.hypot(sx, sy, sz));

        proj.active = true;
        proj.fromPlayer = true;
        proj.kind =
          wSpec.id === 'railgun'
            ? 'rail'
            : wSpec.id === 'compound_bow'
              ? 'bow_arrow'
              : 'pulse';
        proj.x = muzzleX;
        proj.y = muzzleY;
        proj.z = muzzleZ;
        proj.prevX = muzzleX;
        proj.prevY = muzzleY;
        proj.prevZ = muzzleZ;
        proj.vx = sx * inv * wSpec.projectileSpeed;
        proj.vy = sy * inv * wSpec.projectileSpeed;
        proj.vz = sz * inv * wSpec.projectileSpeed;
        proj.damage = wSpec.damage;
        proj.staggerDamage = wSpec.staggerDamage;
        proj.life = 1.65;
        proj.maxLife = 1.65;
        proj.homingTargetUid = null;
        proj.sourceX = state.x;
        proj.sourceZ = state.z;
      }
      state.spreadBloom = Math.min(
        0.045,
        state.spreadBloom + (wSpec.id === 'railgun' ? 0.02 : wSpec.id === 'compound_bow' ? 0.008 : 0.006)
      );
      if (wSpec.id === 'railgun' || wSpec.id === 'compound_bow') {
        state.cameraTrauma = Math.min(1, state.cameraTrauma + (wSpec.id === 'railgun' ? 0.24 : 0.14));
      }
    }
  }

  // 4. Random Wave Spawner & Boss Escalation (Jezero -> ARES-09 Titan; Polar Ice Canyon -> XENO-OMEGA Queen!)
  const activeVanguardCount = state.enemies.filter((e) => !e.isBoss && e.koTimer <= 0).length;
  if (!state.bossSpawned) {
    const polarReady = state.polarMission && stepPolarMission(state.polarMission, dt, state.x, state.z, state.isGrounded);
    if (state.polarMission?.phase === 'hold' && state.polarMission.holdElapsed > 0 && !state.polarMission.bridgeWaveSent) {
      state.polarMission.bridgeWaveSent = true;
      if (!state.polarMission.jammerActive) {
        const x = POLAR_BRIDGE.x - POLAR_BRIDGE.length / 2 - 1.6;
        const z = POLAR_BRIDGE.z;
        const dx = x - state.x, dz = z - state.z;
        const incoming = spawnEnemyDropPod(state, 'xeno_runner', Math.atan2(dz, dx), Math.hypot(dx, dz));
        incoming.polarBridgeEntry = true;
      }
    }

    if (state.outcome === 'none' && (polarReady || (!state.polarMission && state.kills >= state.vanguardKillsTarget))) {
      state.wave = 2;
      if (state.polarMission) summonXenoQueenBoss(state);
      else summonAresBoss(state);
    } else {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && activeVanguardCount < 5) {
        state.spawnTimer = 3.8;
        spawnRandomEnemyWave(state, activeVanguardCount < 2 ? 2 : 1);
      }
    }
  } else if (!state.bossDefeated) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && activeVanguardCount < 2) {
      state.spawnTimer = 9.5;
      spawnRandomEnemyWave(state, 1);
    }
  }

  // 5. Step Enemy AI Policies & Boss Multi-Phase Attacks (with Crowd Attack Token Pool <= 3)
  let activeCrowdAttackers = state.enemies.filter(
    (e) => !e.isBoss && e.koTimer <= 0 && e.attackPhase !== 'idle'
  ).length;
  const knockDecay = Math.exp(-8.5 * dt);

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.ghostHp += (e.hp - e.ghostHp) * (1 - Math.exp(-4.5 * dt));
    if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
    if (e.shieldRippleTimer > 0) e.shieldRippleTimer = Math.max(0, e.shieldRippleTimer - dt);
    if (e.shieldShatterTimer > 0) e.shieldShatterTimer = Math.max(0, e.shieldShatterTimer - dt);
    if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

    // Unconditionally stable analytical hit-stagger spring (omega_n = 18 rad/s, zeta = 0.55)
    const [nextTP, nextVP] = stepAnalyticalDampedSpring(e.hitTiltPitch, e.hitTiltVelP, 18.0, 0.55, dt);
    const [nextTR, nextVR] = stepAnalyticalDampedSpring(e.hitTiltRoll, e.hitTiltVelR, 18.0, 0.55, dt);
    e.hitTiltPitch = Math.max(-0.42, Math.min(0.42, nextTP));
    e.hitTiltVelP = nextVP;
    e.hitTiltRoll = Math.max(-0.42, Math.min(0.42, nextTR));
    e.hitTiltVelR = nextVR;

    if (e.koTimer > 0) {
      e.koTimer -= dt;
      if (e.koTimer <= 0) {
        state.enemies.splice(i, 1);
      }
      continue;
    }

    if (e.dropPodProgress < 1) {
      e.dropPodProgress = Math.min(1, e.dropPodProgress + dt / 0.45);
      continue;
    }

    // Shield-Break Paralysis / Mini-Stun window (with proper terrain height & knockback!)
    if (e.shieldBreakStunTimer > 0) {
      e.shieldBreakStunTimer = Math.max(0, e.shieldBreakStunTimer - dt);
      const stunDrag = Math.pow(0.8, dt * 60);
      e.vx *= stunDrag;
      e.vz *= stunDrag;
      e.x += (e.vx + e.knockVx) * dt;
      e.z += (e.vz + e.knockVz) * dt;
      e.knockVx *= knockDecay;
      e.knockVz *= knockDecay;
      const gStunY = worldFloor(state, e.x, e.z);
      e.y = e.archetype === 'aero_hunter' ? gStunY + 6.4 : gStunY;
      continue;
    }

    // ACS Staggered punish window (still absorbs physical knockback impulses!)
    if (e.staggeredTimer > 0) {
      e.staggeredTimer -= dt;
      e.x += e.knockVx * dt;
      e.z += e.knockVz * dt;
      e.knockVx *= knockDecay;
      e.knockVz *= knockDecay;
      const gStagY = worldFloor(state, e.x, e.z);
      e.y = e.archetype === 'aero_hunter' ? gStagY + 6.4 : gStagY;
      if (e.staggeredTimer <= 0) {
        e.stagger = 0;
      }
      continue;
    } else if (e.stagger > 0) {
      e.stagger = Math.max(0, e.stagger - dt * 4.5);
    }

    if (e.bossPhaseTransitionTimer > 0) {
      e.bossPhaseTransitionTimer -= dt;
      continue;
    }

    const dxP = state.x - e.x;
    const dzP = state.z - e.z;
    const distP = Math.max(0.01, Math.hypot(dxP, dzP));
    const dirPX = dxP / distP;
    const dirPZ = dzP / distP;
    const spec = ENEMY_ARCHETYPE_SPECS[e.archetype];
    const slowMult = e.slowTimer > 0 ? 0.48 : 1.0;

    if (e.polarBridgeEntry && state.polarMission?.gateOpen && e.x < POLAR_BRIDGE.x + POLAR_BRIDGE.length / 2 + 0.8) {
      // On the first defense surge, this runner uses the newly opened span before pursuing the player.
      const routeYaw = Math.atan2(POLAR_BRIDGE.z - e.z, Math.max(0.25, POLAR_BRIDGE.x + POLAR_BRIDGE.length / 2 + 1 - e.x));
      e.vx = Math.cos(routeYaw) * spec.speed;
      e.vz = Math.sin(routeYaw) * spec.speed;
      e.yaw = turnTowardsAngle(e.yaw, routeYaw, 6 * dt);
    } else if (e.archetype === 'xeno_queen_boss') {
      // XENO-OMEGA CROWNED ALIEN QUEEN BOSS AI & 3 SIGNATURE TELEGRAPHED ATTACKS
      const speedMult = (e.bossPhase === 2 ? 1.32 : 1.0) * slowMult;
      if (e.attackPhase === 'idle') {
        if (distP > 14) {
          const stalkAng = Math.atan2(dzP, dxP) + e.strafeSign * 0.28;
          e.vx = Math.cos(stalkAng) * spec.speed * speedMult;
          e.vz = Math.sin(stalkAng) * spec.speed * speedMult;
        } else {
          e.vx = (-dirPZ * e.strafeSign * 0.8 + (distP < 8 ? -dirPX * 0.35 : 0)) * spec.speed;
          e.vz = (dirPX * e.strafeSign * 0.8 + (distP < 8 ? -dirPZ * 0.35 : 0)) * spec.speed;
        }
        e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 4.6 * dt);
        e.aiCooldown -= dt * speedMult;

        if (e.aiCooldown <= 0) {
          const cycle: BossAttackKind[] = [
            'queen_acid_barrage',
            'queen_tail_scythe',
            'queen_brood_call'
          ];
          const prevIdx = cycle.indexOf(e.bossAttackKind);
          const nextIdx = (prevIdx + 1) % cycle.length;
          e.bossAttackKind = cycle[nextIdx];
          e.attackPhase = 'windup';
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          state.events.bossCue = 'xeno_screech';

          if (e.bossAttackKind === 'queen_acid_barrage') {
            e.phaseTimer = 0.62;
          } else if (e.bossAttackKind === 'queen_tail_scythe') {
            e.phaseTimer = 0.68;
          } else {
            e.phaseTimer = 0.55;
          }
        }
      } else if (e.attackPhase === 'windup') {
        const drag = Math.pow(0.82, dt * 60);
        e.vx *= drag;
        e.vz *= drag;
        e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 6.2 * dt);
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          if (e.bossAttackKind === 'queen_acid_barrage') {
            const globCount = e.bossPhase === 2 ? 10 : 7;
            for (let g = 0; g < globCount; g++) {
              const p = allocProjectile(state);
              if (!p) break;
              const spreadYaw = (g - (globCount - 1) * 0.5) * 0.19;
              const angG = Math.atan2(dzP, dxP) + spreadYaw;
              const spdG = 23 + (g % 3) * 3.2;
              p.active = true;
              p.fromPlayer = false;
              p.kind = 'xeno_acid';
              p.x = e.x + Math.cos(e.yaw) * 1.8;
              p.y = e.y + 3.4;
              p.z = e.z + Math.sin(e.yaw) * 1.8;
              p.prevX = p.x;
              p.prevY = p.y;
              p.prevZ = p.z;
              p.vx = Math.cos(angG) * spdG;
              p.vy = 5.4 + (g % 2) * 2.1;
              p.vz = Math.sin(angG) * spdG;
              p.damage = 16;
              p.staggerDamage = 0;
              p.life = 2.8;
              p.maxLife = 2.8;
              p.homingTargetUid = null;
              p.sourceX = e.x;
              p.sourceZ = e.z;
            }
            e.phaseTimer = 0.35;
          } else if (e.bossAttackKind === 'queen_tail_scythe') {
            e.phaseTimer = 0.44;
            e.vx = Math.cos(e.yaw) * 25.5;
            e.vz = Math.sin(e.yaw) * 25.5;
          } else {
            // Queen Brood Call: summons spider/runner broodlings (bounded so arena stays crisp!)
            const nonBossLive = state.enemies.filter((x) => !x.isBoss && x.koTimer <= 0).length;
            const toSpawn = Math.max(0, Math.min(e.bossPhase === 2 ? 3 : 2, 6 - nonBossLive));
            for (let b = 0; b < toSpawn; b++) {
              const bArch: EnemyArchetypeId = b % 2 === 0 ? 'xeno_spider' : 'xeno_runner';
              const bAng = e.yaw + (b - 0.5) * 0.85;
              const brood = spawnEnemyDropPod(state, bArch, bAng, 14);
              brood.x = e.x + Math.cos(bAng) * 4.2;
              brood.z = e.z + Math.sin(bAng) * 4.2;
              brood.y = worldFloor(state, brood.x, brood.z);
              brood.dropPodProgress = 0.85;
            }
            e.phaseTimer = 0.35;
          }
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (e.bossAttackKind === 'queen_tail_scythe') {
          const playerClear = state.y - worldFloor(state, state.x, state.z);
          if (distP < 5.6 && playerClear < 1.65 && state.invulnTimer <= 0) {
            applyDamageToPlayer(state, 32, e.x, e.z);
            state.invulnTimer = 0.38;
          }
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = e.bossPhase === 2 ? 0.6 : 0.95;
        }
      } else {
        const drag = Math.pow(0.82, dt * 60);
        e.vx *= drag;
        e.vz *= drag;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = e.bossPhase === 2 ? 1.45 : 2.1;
        }
      }
    } else if (e.isBoss) {
      // ARES-09 TALOS TITAN BOSS AI & 3 SIGNATURE TELEGRAPHED ATTACKS
      const speedMult = (e.bossPhase === 2 ? 1.28 : 1.0) * slowMult;
      if (e.attackPhase === 'idle') {
        if (distP > 18) {
          e.vx = dirPX * spec.speed * speedMult;
          e.vz = dirPZ * spec.speed * speedMult;
        } else {
          e.vx = (-dirPZ * e.strafeSign * 0.75 + (distP < 11 ? -dirPX * 0.4 : 0)) * spec.speed;
          e.vz = (dirPX * e.strafeSign * 0.75 + (distP < 11 ? -dirPZ * 0.4 : 0)) * spec.speed;
        }
        e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 3.8 * dt);
        e.aiCooldown -= dt * speedMult;

        if (e.aiCooldown <= 0) {
          const cycle: BossAttackKind[] = ['balteus_salvo', 'coral_laser_sweep', 'orbital_pillars'];
          const prevIdx = cycle.indexOf(e.bossAttackKind);
          const nextIdx = (prevIdx + 1 + Math.floor(randRange(0, 2))) % cycle.length;
          e.bossAttackKind = cycle[nextIdx];
          e.attackPhase = 'windup';

          if (e.bossAttackKind === 'balteus_salvo') {
            e.phaseTimer = 0.65;
          } else if (e.bossAttackKind === 'coral_laser_sweep') {
            e.phaseTimer = 0.78;
            e.laserSweepStartYaw = Math.atan2(dzP, dxP) - 0.68;
            e.laserSweepCurrentYaw = e.laserSweepStartYaw;
            state.events.bossCue = 'laser_charge';
          } else {
            e.phaseTimer = 0.5;
            const pillarCount = e.bossPhase === 2 ? 4 : 3;
            for (let k = 0; k < pillarCount; k++) {
              const ox = k === 0 ? state.vx * 0.35 : randRange(-7.5, 7.5);
              const oz = k === 0 ? state.vz * 0.35 : randRange(-7.5, 7.5);
              const hx = state.x + ox;
              const hz = state.z + oz;
              state.hazards.push({
                id: state.nextUid++,
                x: hx,
                y: worldFloor(state, hx, hz),
                z: hz,
                radius: 3.4,
                elapsed: 0,
                windupDuration: 0.88,
                damage: 34,
                kind: 'orbital_pillar',
                detonated: false,
                lingerTimer: 0.4
              });
            }
          }
        }
      } else if (e.attackPhase === 'windup') {
        const drag = Math.pow(0.85, dt * 60);
        e.vx *= drag;
        e.vz *= drag;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          if (e.bossAttackKind === 'balteus_salvo') {
            const count = e.bossPhase === 2 ? 14 : 10;
            for (let m = 0; m < count; m++) {
              const p = allocProjectile(state);
              if (!p) break;
              const ringAng = (m / count) * Math.PI * 2;
              p.active = true;
              p.fromPlayer = false;
              p.kind = 'boss_missile';
              p.x = e.x + Math.cos(ringAng) * 1.6;
              p.y = e.y + 3.2;
              p.z = e.z + Math.sin(ringAng) * 1.6;
              p.prevX = p.x;
              p.prevY = p.y;
              p.prevZ = p.z;
              p.vx = Math.cos(ringAng) * 14 + dirPX * 10;
              p.vy = 11.5 + (m % 3) * 2.2;
              p.vz = Math.sin(ringAng) * 14 + dirPZ * 10;
              p.damage = 16;
              p.staggerDamage = 0;
              p.life = 3.2;
              p.maxLife = 3.2;
              p.homingTargetUid = -1;
              p.sourceX = e.x;
              p.sourceZ = e.z;
            }
            e.phaseTimer = 0.35;
          } else if (e.bossAttackKind === 'coral_laser_sweep') {
            e.phaseTimer = 1.15;
          } else {
            e.phaseTimer = 0.4;
          }
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (e.bossAttackKind === 'coral_laser_sweep') {
          const prog = 1 - Math.max(0, e.phaseTimer / 1.15);
          e.laserSweepCurrentYaw = e.laserSweepStartYaw + prog * 1.36;
          e.yaw = e.laserSweepCurrentYaw;
          const lx = Math.cos(e.laserSweepCurrentYaw);
          const lz = Math.sin(e.laserSweepCurrentYaw);
          const projDist = (state.x - e.x) * lx + (state.z - e.z) * lz;
          if (projDist > 1.5 && projDist < 38) {
            const perpDist = Math.abs((state.x - e.x) * -lz + (state.z - e.z) * lx);
            const playerClearance = state.y - worldFloor(state, state.x, state.z);
            if (perpDist < 1.35 && playerClearance < 1.25 && state.invulnTimer <= 0) {
              applyDamageToPlayer(state, 28, e.x, e.z);
              state.invulnTimer = 0.35;
            }
          }
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = e.bossPhase === 2 ? 0.65 : 1.05;
        }
      } else if (e.attackPhase === 'recovery') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = e.bossPhase === 2 ? 1.55 : 2.25;
        }
      }
    } else if (e.archetype === 'go2_hound') {
      // POLICY 1: Fast Flanker & Telegraphed Pounce Charger
      if (e.attackPhase === 'idle') {
        const flankAng = Math.atan2(dzP, dxP) + (distP > 9 ? e.strafeSign * 0.48 : 0);
        e.vx = Math.cos(flankAng) * spec.speed;
        e.vz = Math.sin(flankAng) * spec.speed;
        e.yaw = turnTowardsAngle(e.yaw, flankAng, 6.8 * dt);
        e.aiCooldown -= dt;
        if (distP < 11.5 && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
          e.attackPhase = 'windup';
          e.phaseTimer = 0.48;
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          activeCrowdAttackers++;
        }
      } else if (e.attackPhase === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.yaw = turnTowardsAngle(
          e.yaw,
          Math.atan2(e.telegraphTargetZ - e.z, e.telegraphTargetX - e.x),
          9.0 * dt
        );
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          e.phaseTimer = 0.36;
          e.vx = Math.cos(e.yaw) * 21.5;
          e.vz = Math.sin(e.yaw) * 21.5;
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (distP < 1.85) {
          applyDamageToPlayer(state, 18, e.x, e.z);
          e.phaseTimer = 0;
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = 0.55;
        }
      } else {
        const drag = Math.pow(0.82, dt * 60);
        e.vx *= drag;
        e.vz *= drag;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.1;
        }
      }
    } else if (e.archetype === 'g1_vanguard') {
      // POLICY 2: Mid-Range Tactical Strafe Marksman with Visible Laser Sight Telegraph
      const idealDist = 17.5;
      const radialPush = distP > idealDist + 2 ? 0.75 : distP < idealDist - 3 ? -0.65 : 0;
      e.vx = (dirPX * radialPush - dirPZ * e.strafeSign * 0.85) * spec.speed;
      e.vz = (dirPZ * radialPush + dirPX * e.strafeSign * 0.85) * spec.speed;
      e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 5.2 * dt);
      e.aiCooldown -= dt;

      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 4 && distP < 36) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.42;
        e.telegraphTargetX = state.x;
        e.telegraphTargetZ = state.z;
        activeCrowdAttackers++;
      } else if (e.attackPhase === 'windup') {
        e.telegraphTargetX = state.x;
        e.telegraphTargetZ = state.z;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          e.phaseTimer = 0.18;
          e.aiCooldown = 2.4;
          const p = allocProjectile(state);
          if (p) {
            p.active = true;
            p.fromPlayer = false;
            p.kind = 'enemy_plasma';
            p.x = e.x + dirPX * 0.8;
            p.y = e.y + 1.25;
            p.z = e.z + dirPZ * 0.8;
            p.prevX = p.x;
            p.prevY = p.y;
            p.prevZ = p.z;
            const aimDy = state.y + 0.9 - p.y;
            const d3 = Math.max(1, Math.hypot(dxP, aimDy, dzP));
            p.vx = (dxP / d3) * 28;
            p.vy = (aimDy / d3) * 28;
            p.vz = (dzP / d3) * 28;
            p.damage = 14;
            p.staggerDamage = 0;
            p.life = 2.2;
            p.maxLife = 2.2;
            p.homingTargetUid = null;
            p.sourceX = e.x;
            p.sourceZ = e.z;
          }
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
        }
      }
    } else if (e.archetype === 'sar_siege') {
      // POLICY 3: Armored Area-Denial Mortar Tank
      const moveScale = distP > 22 ? 1 : distP < 12 ? -0.5 : 0.15;
      e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 3.4 * dt);
      const facing = Math.max(0, Math.cos(e.yaw) * dirPX + Math.sin(e.yaw) * dirPZ);
      e.vx = Math.cos(e.yaw) * spec.speed * moveScale * facing;
      e.vz = Math.sin(e.yaw) * spec.speed * moveScale * facing;
      e.aiCooldown -= dt;

      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.35;
        activeCrowdAttackers++;
        const tx = state.x + state.vx * 0.45;
        const tz = state.z + state.vz * 0.45;
        state.hazards.push({
          id: state.nextUid++,
          x: tx,
          y: worldFloor(state, tx, tz),
          z: tz,
          radius: 3.1,
          elapsed: 0,
          windupDuration: 0.85,
          damage: 24,
          kind: 'mortar',
          detonated: false,
          lingerTimer: 0.35
        });
      } else if (e.attackPhase === 'windup') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 3.2;
        }
      }
    } else if (e.archetype === 'xeno_spider') {
      // POLICY 5: Fast Sinusoidal Swarm Weaver & Close-Range Facehugger Leap
      if (e.attackPhase === 'idle') {
        const weave = Math.sin(state.elapsedPlaySec * 7.2 + e.uid * 1.9) * 0.62;
        const swarmAng = Math.atan2(dzP, dxP) + weave;
        e.vx = Math.cos(swarmAng) * spec.speed;
        e.vz = Math.sin(swarmAng) * spec.speed;
        e.yaw = turnTowardsAngle(e.yaw, swarmAng, 9.5 * dt);
        e.aiCooldown -= dt;
        if (distP < 8.5 && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
          e.attackPhase = 'windup';
          e.phaseTimer = 0.28;
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          activeCrowdAttackers++;
        }
      } else if (e.attackPhase === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.yaw = turnTowardsAngle(
          e.yaw,
          Math.atan2(e.telegraphTargetZ - e.z, e.telegraphTargetX - e.x),
          12.0 * dt
        );
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          e.phaseTimer = 0.28;
          e.vx = Math.cos(e.yaw) * 23.5;
          e.vz = Math.sin(e.yaw) * 23.5;
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (distP < 1.65) {
          applyDamageToPlayer(state, 13, e.x, e.z);
          e.phaseTimer = 0;
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = 0.4;
        }
      } else {
        e.vx *= Math.pow(0.8, dt * 60);
        e.vz *= Math.pow(0.8, dt * 60);
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 1.65;
        }
      }
    } else if (e.archetype === 'xeno_runner') {
      // POLICY 6: Xenomorph Stalker Flanker + Telegraphed Tail-Impaler Lunge
      if (e.attackPhase === 'idle') {
        const stalkArc = Math.atan2(dzP, dxP) + (distP > 9.5 ? e.strafeSign * 0.68 : 0);
        e.vx = Math.cos(stalkArc) * spec.speed;
        e.vz = Math.sin(stalkArc) * spec.speed;
        e.yaw = turnTowardsAngle(e.yaw, stalkArc, 8.2 * dt);
        e.aiCooldown -= dt;
        if (distP < 13.0 && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
          e.attackPhase = 'windup';
          e.phaseTimer = 0.44;
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          if (!state.events.bossCue) state.events.bossCue = 'xeno_screech';
          activeCrowdAttackers++;
        }
      } else if (e.attackPhase === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.yaw = turnTowardsAngle(
          e.yaw,
          Math.atan2(e.telegraphTargetZ - e.z, e.telegraphTargetX - e.x),
          10.5 * dt
        );
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          e.phaseTimer = 0.34;
          e.vx = Math.cos(e.yaw) * 25.5;
          e.vz = Math.sin(e.yaw) * 25.5;
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (distP < 2.15) {
          applyDamageToPlayer(state, 22, e.x, e.z);
          e.phaseTimer = 0;
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = 0.48;
        }
      } else {
        e.vx *= Math.pow(0.82, dt * 60);
        e.vz *= Math.pow(0.82, dt * 60);
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 1.9;
        }
      }
    } else if (e.archetype === 'xeno_spitter') {
      // POLICY 7: Corrosive Acid Spitter Bio-Artillery (spawns lingering green Acid Pools)
      const idealDist = 19.0;
      const radialPush = distP > idealDist + 2 ? 0.8 : distP < idealDist - 4 ? -0.75 : 0;
      e.vx = (dirPX * radialPush - dirPZ * e.strafeSign * 0.78) * spec.speed;
      e.vz = (dirPZ * radialPush + dirPX * e.strafeSign * 0.78) * spec.speed;
      e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 6.2 * dt);
      e.aiCooldown -= dt;

      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 4 && distP < 38) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.4;
        e.telegraphTargetX = state.x + state.vx * 0.3;
        e.telegraphTargetZ = state.z + state.vz * 0.3;
        activeCrowdAttackers++;
      } else if (e.attackPhase === 'windup') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.85;
          const p = allocProjectile(state);
          if (p) {
            p.active = true;
            p.fromPlayer = false;
            p.kind = 'xeno_acid';
            p.x = e.x + dirPX * 0.9;
            p.y = e.y + 1.45;
            p.z = e.z + dirPZ * 0.9;
            p.prevX = p.x;
            p.prevY = p.y;
            p.prevZ = p.z;
            const flightT = Math.max(0.35, Math.min(1.25, distP / 24));
            p.vx = (e.telegraphTargetX - p.x) / flightT;
            p.vz = (e.telegraphTargetZ - p.z) / flightT;
            p.vy = (state.y - p.y) / flightT + 0.5 * 12.5 * flightT;
            p.damage = 14;
            p.staggerDamage = 0;
            p.life = 2.4;
            p.maxLife = 2.4;
            p.homingTargetUid = null;
            p.sourceX = e.x;
            p.sourceZ = e.z;
          }
        }
      }
    } else if (e.archetype === 'deathless_vanguard') {
      // POLICY 8: Deathless Shield-Wall Phalanx + Close-Range Great-Axe Overhead Slam
      if (e.attackPhase === 'idle') {
        const shieldAdv = Math.atan2(dzP, dxP) + (distP > 7 ? e.strafeSign * 0.18 : 0);
        e.vx = Math.cos(shieldAdv) * spec.speed;
        e.vz = Math.sin(shieldAdv) * spec.speed;
        e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 4.8 * dt);
        e.aiCooldown -= dt;
        if (distP < 5.6 && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
          e.attackPhase = 'windup';
          e.phaseTimer = 0.5;
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          activeCrowdAttackers++;
        }
      } else if (e.attackPhase === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 5.5 * dt);
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          e.phaseTimer = 0.28;
          e.vx = Math.cos(e.yaw) * 14.5;
          e.vz = Math.sin(e.yaw) * 14.5;
        }
      } else if (e.attackPhase === 'active') {
        e.phaseTimer -= dt;
        if (distP < 3.05 && state.invulnTimer <= 0) {
          applyDamageToPlayer(state, 26, e.x, e.z);
          state.invulnTimer = 0.32;
          e.phaseTimer = 0;
        }
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'recovery';
          e.phaseTimer = 0.65;
        }
      } else {
        e.vx *= Math.pow(0.8, dt * 60);
        e.vz *= Math.pow(0.8, dt * 60);
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.2;
        }
      }
    } else {
      // POLICY 4: Aerial Orbiting Sky-Hunter Skydio X2 Quadrotor Gunship
      const orbitAng = Math.atan2(dzP, dxP) + e.strafeSign * 1.15;
      e.vx = Math.cos(orbitAng) * spec.speed;
      e.vz = Math.sin(orbitAng) * spec.speed;
      e.yaw = turnTowardsAngle(e.yaw, Math.atan2(dzP, dxP), 5.8 * dt);
      e.aiCooldown -= dt;
      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 4) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.32;
        e.telegraphTargetX = state.x;
        e.telegraphTargetZ = state.z;
        activeCrowdAttackers++;
      } else if (e.attackPhase === 'windup') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.7;
          const p = allocProjectile(state);
          if (p) {
            p.active = true;
            p.fromPlayer = false;
            p.kind = 'enemy_plasma';
            p.x = e.x;
            p.y = e.y;
            p.z = e.z;
            p.prevX = p.x;
            p.prevY = p.y;
            p.prevZ = p.z;
            const aimDy = state.y + 0.8 - e.y;
            const d3 = Math.max(1, Math.hypot(dxP, aimDy, dzP));
            p.vx = (dxP / d3) * 30;
            p.vy = (aimDy / d3) * 30;
            p.vz = (dzP / d3) * 30;
            p.damage = 13;
            p.staggerDamage = 0;
            p.life = 2.2;
            p.maxLife = 2.2;
            p.homingTargetUid = null;
            p.sourceX = e.x;
            p.sourceZ = e.z;
          }
        }
      }
    }

    // Integrate enemy kinematics + independent knockback impulse channel
    const moveSlow = e.isBoss ? 1.0 : slowMult;
    e.x += (e.vx * moveSlow + e.knockVx) * dt;
    e.z += (e.vz * moveSlow + e.knockVz) * dt;
    e.knockVx *= knockDecay;
    e.knockVz *= knockDecay;
    const er = Math.hypot(e.x, e.z);
    if (er > ARENA_RADIUS - 2) {
      const s = (ARENA_RADIUS - 2) / er;
      e.x *= s;
      e.z *= s;
    }
    const gY = worldFloor(state, e.x, e.z);
    e.y = e.archetype === 'aero_hunter' ? gY + 6.4 + Math.sin(state.elapsedPlaySec * 2.4 + e.uid) * 0.45 : gY;
    const eFwdProj = e.vx * Math.cos(e.yaw) + e.vz * Math.sin(e.yaw);
    e.gaitDist += Math.hypot(e.vx * moveSlow, e.vz * moveSlow) * (eFwdProj < -0.4 ? -1 : 1) * dt;
  }

  // 5B. Step Allied Wingman Go2 Companion
  stepWingmanGo2Companion(state, dt, fwdX, fwdZ, rightX, rightZ);

  // 5C. Pairwise Actor + Physical Battlefield Cover Obstacle Separation
  resolveCombatSoftCollisions(state);

  // 6. Step Projectiles with Continuous Swept Segment Collision & Physical Cover Blocking
  const homingK = 1 - Math.exp(-7.5 * dt);
  const bossHomingK = 1 - Math.exp(-3.8 * dt);

  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }

    if (p.kind === 'missile' && p.homingTargetUid !== null) {
      const tgt = state.enemies.find((e) => e.uid === p.homingTargetUid && e.koTimer <= 0);
      if (tgt) {
        const tx = tgt.x - p.x;
        const ty = tgt.y + (tgt.isBoss ? 2.1 : 0.9) - p.y;
        const tz = tgt.z - p.z;
        const d = Math.max(0.1, Math.hypot(tx, ty, tz));
        const spd = 40;
        p.vx += ((tx / d) * spd - p.vx) * homingK;
        p.vy += ((ty / d) * spd - p.vy) * homingK;
        p.vz += ((tz / d) * spd - p.vz) * homingK;
      }
    } else if (p.kind === 'boss_missile' && p.maxLife - p.life < 1.35) {
      const tx = state.x - p.x;
      const ty = state.y + 0.9 - p.y;
      const tz = state.z - p.z;
      const d = Math.max(0.1, Math.hypot(tx, ty, tz));
      const spd = 24;
      p.vx += ((tx / d) * spd - p.vx) * bossHomingK;
      p.vy += ((ty / d) * spd - p.vy) * bossHomingK;
      p.vz += ((tz / d) * spd - p.vz) * bossHomingK;
    } else if (p.kind === 'xeno_acid') {
      p.vy -= 12.5 * dt;
    }

    p.prevX = p.x;
    p.prevY = p.y;
    p.prevZ = p.z;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    // 6A. Check Physical Battlefield Cover Obstacles (Boulders & Defense Towers block Line-of-Fire!)
    let blockedByCover = false;
    for (const obs of getMarsBattlefieldObstacles(state.mapId, state.polarMission?.gateOpen)) {
      const tObs = segmentIntersectsCircle2D(p.prevX, p.prevZ, p.x, p.z, obs.x, obs.z, obs.radius);
      if (tObs !== null) {
        const hitY = p.prevY + (p.y - p.prevY) * tObs;
        const obsFloorY = worldFloor(state, obs.x, obs.z);
        if (hitY <= obsFloorY + obs.height) {
          const hitX = p.prevX + (p.x - p.prevX) * tObs;
          const hitZ = p.prevZ + (p.z - p.prevZ) * tObs;
          const nLen = Math.max(0.01, Math.hypot(hitX - obs.x, hitZ - obs.z));
          state.events.sparkImpacts.push({
            x: hitX,
            y: hitY,
            z: hitZ,
            nx: (hitX - obs.x) / nLen,
            ny: 0.25,
            nz: (hitZ - obs.z) / nLen,
            isShield: false,
            isCrit: false,
            isShatter: false,
            isAcidBlood: p.kind === 'xeno_acid'
          });
          if (p.kind === 'missile') {
            state.events.explosions.push({
              x: hitX,
              y: hitY + 0.2,
              z: hitZ,
              scale: 1.15,
              colorHex: '#fb7185'
            });
            applyMissileSplashDamage(state, hitX, hitY, hitZ, null, p.damage, p.staggerDamage);
          }
          p.active = false;
          blockedByCover = true;
          break;
        }
      }
    }
    if (blockedByCover) continue;

    // 6B. Terrain Impact
    const terrainY = worldFloor(state, p.x, p.z);
    if (p.y <= terrainY) {
      p.active = false;
      if (p.kind === 'xeno_acid') {
        state.events.explosions.push({
          x: p.x,
          y: terrainY + 0.2,
          z: p.z,
          scale: 1.1,
          colorHex: '#84cc16'
        });
        if (state.hazards.length < 22) {
          state.hazards.push({
            id: state.nextUid++,
            x: p.x,
            y: terrainY,
            z: p.z,
            radius: 2.75,
            elapsed: 0,
            windupDuration: 0.06,
            damage: 10,
            kind: 'acid_pool',
            detonated: false,
            lingerTimer: 3.4,
            acidTickTimer: 0.45
          });
        }
      } else if (p.kind === 'missile' || p.kind === 'boss_missile') {
        state.events.explosions.push({
          x: p.x,
          y: terrainY + 0.25,
          z: p.z,
          scale: p.fromPlayer ? 1.25 : 0.95,
          colorHex: p.fromPlayer ? '#fb7185' : '#f97316'
        });
        if (p.kind === 'missile' && p.fromPlayer) {
          applyMissileSplashDamage(state, p.x, terrainY, p.z, null, p.damage, p.staggerDamage);
        }
      }
      continue;
    }

    // 6C. Continuous Swept Segment-Ellipsoid Actor Hit Detection (Zero Low-FPS Tunneling & Zero 240Hz Multi-Hit!)
    if (p.fromPlayer) {
      for (const e of state.enemies) {
        if (e.koTimer > 0 || e.dropPodProgress < 0.7) continue;
        if (p.piercedUids.includes(e.uid)) continue;

        const spec = ENEMY_ARCHETYPE_SPECS[e.archetype];
        const centerY = e.y + (e.isBoss ? 2.15 : e.archetype === 'aero_hunter' ? 0 : 0.95);
        const seg = closestPointOnSegment3D(
          p.prevX,
          p.prevY,
          p.prevZ,
          p.x,
          p.y,
          p.z,
          e.x,
          centerY,
          e.z,
          0.8
        );
        const hitThreshold =
          spec.hitRadius + (p.kind === 'rail' ? 0.35 : p.kind === 'bow_arrow' ? 0.28 : 0.15);
        if (seg.dist <= hitThreshold) {
          const wName =
            p.kind === 'rail'
              ? '超导磁轨炮'
              : p.kind === 'bow_arrow'
                ? '电磁复合穿甲弓'
                : p.kind === 'missile'
                  ? '蜂群追踪导弹'
                  : '高频脉冲步枪';
          const isHeadWeakPoint =
            e.archetype !== 'aero_hunter' && seg.py >= centerY + spec.scaleDim * 0.2;
          const isArmorPiercing = p.kind === 'rail' || p.kind === 'bow_arrow';
          damageEnemyEntity(
            state,
            e,
            p.damage,
            p.staggerDamage,
            wName,
            [seg.px, seg.py, seg.pz],
            p.kind === 'pulse' ? 1.35 : p.kind === 'bow_arrow' ? 1.5 : 1.0,
            {
              isWeakPointCrit: isHeadWeakPoint || (p.kind === 'bow_arrow' && e.archetype === 'deathless_vanguard'),
              piercesPhysicalShield: isArmorPiercing
            }
          );

          if (p.kind === 'missile') {
            state.events.explosions.push({
              x: seg.px,
              y: seg.py,
              z: seg.pz,
              scale: 1.25,
              colorHex: '#fb7185'
            });
            applyMissileSplashDamage(state, seg.px, seg.py, seg.pz, e.uid, p.damage, p.staggerDamage);
            p.active = false;
            break;
          } else if (p.kind === 'bow_arrow') {
            if (p.piercedUids.length < 1) {
              p.piercedUids.push(e.uid);
              p.damage *= 0.72;
              p.staggerDamage *= 0.72;
            } else {
              p.active = false;
              break;
            }
          } else if (p.kind !== 'rail') {
            p.active = false;
            break;
          } else {
            // Railgun pierces cleanly ONCE per enemy!
            p.piercedUids.push(e.uid);
            p.damage *= 0.65;
            p.staggerDamage *= 0.65;
          }
        }
      }
    } else {
      const segPlayer = closestPointOnSegment3D(
        p.prevX,
        p.prevY,
        p.prevZ,
        p.x,
        p.y,
        p.z,
        state.x,
        state.y + 1.0,
        state.z,
        0.85
      );
      if (segPlayer.dist <= 1.15) {
        p.active = false;
        applyDamageToPlayer(state, p.damage, p.sourceX, p.sourceZ);
        if (p.kind === 'xeno_acid' && state.hazards.length < 22) {
          const gy = worldFloor(state, state.x, state.z);
          state.hazards.push({
            id: state.nextUid++,
            x: state.x,
            y: gy,
            z: state.z,
            radius: 2.5,
            elapsed: 0.08,
            windupDuration: 0.06,
            damage: 8,
            kind: 'acid_pool',
            detonated: true,
            lingerTimer: 2.8,
            acidTickTimer: 0.55
          });
        }
      }
    }
  }

  // 7. Step Ground AoE Telegraph Hazards & Lingering Corrosive Xenomorph Acid Pools
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    if (!h.detonated) {
      h.elapsed += dt;
      if (h.elapsed >= h.windupDuration) {
        h.detonated = true;
        if (h.kind !== 'acid_pool') {
          state.events.explosions.push({
            x: h.x,
            y: h.y + 0.35,
            z: h.z,
            scale: h.kind === 'boss_phase_nova' ? 3.2 : 1.75,
            colorHex: h.kind === 'orbital_pillar' ? '#00e5ff' : '#ff2a55'
          });
        }
        const dist = Math.hypot(state.x - h.x, state.z - h.z);
        const verticalClear = state.y - h.y;
        const hitHeightCap = h.kind === 'orbital_pillar' ? 18.0 : 2.1;
        if (dist <= h.radius && verticalClear < hitHeightCap) {
          applyDamageToPlayer(state, h.damage, h.x, h.z);
        }
      }
    } else {
      if (h.kind === 'acid_pool') {
        const dist = Math.hypot(state.x - h.x, state.z - h.z);
        const verticalClear = state.y - h.y;
        if (dist <= h.radius && verticalClear < 1.35) {
          h.acidTickTimer = (h.acidTickTimer ?? 0.5) - dt;
          if (h.acidTickTimer <= 0) {
            h.acidTickTimer = 0.55;
            applyDamageToPlayer(state, 8, h.x, h.z);
          }
        }
      }
      h.lingerTimer -= dt;
      if (h.lingerTimer <= 0) {
        state.hazards.splice(i, 1);
      }
    }
  }

  // 8. Step Magnetized 3D Combat Pickups
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) {
      state.pickups.splice(i, 1);
      continue;
    }
    const dx = state.x - pk.x;
    const dz = state.z - pk.z;
    const d = Math.hypot(dx, dz);
    if (d < 6.5 && d > 0.05) {
      pk.x += (dx / d) * 14 * dt;
      pk.z += (dz / d) * 14 * dt;
      pk.y = worldFloor(state, pk.x, pk.z) + 0.6;
    }
    if (d < 1.55) {
      if (pk.kind === 'repair_core') {
        state.hp = Math.min(state.maxHp, state.hp + 42);
        state.shield = Math.min(state.maxShield, state.shield + 35);
      } else {
        state.ultimateCharge = Math.min(100, state.ultimateCharge + 35);
        state.boostEnergy = 100;
      }
      state.score += 50;
      state.bestScore = Math.max(state.bestScore, state.score);
      state.pickups.splice(i, 1);
    }
  }
}

export function stepWingmanGo2Companion(
  state: MarsCombatWorldState,
  dt: number,
  fwdX: number,
  fwdZ: number,
  rightX: number,
  rightZ: number
): void {
  const w = state.wingman;
  w.slashFlashTimer = Math.max(0, w.slashFlashTimer - dt);

  const findTarget = (): CombatEnemyEntity | null => {
    if (w.targetUid !== null) {
      const found = state.enemies.find(
        (e) => e.uid === w.targetUid && e.koTimer <= 0 && e.archetype !== 'aero_hunter'
      );
      if (found) return found;
      w.targetUid = null;
    }
    return null;
  };

  if (w.mode === 'pounce_leap') {
    const tgt = findTarget();
    w.modeTimer -= dt;
    if (!tgt) {
      w.mode = 'escort';
      w.vy = 0;
    } else {
      const dx = tgt.x - w.x;
      const dz = tgt.z - w.z;
      const dist = Math.hypot(dx, dz);
      w.yaw = Math.atan2(dz, dx);
      const leapSpeed = 29;
      if (dist > 0.1) {
        w.vx = (dx / dist) * leapSpeed;
        w.vz = (dz / dist) * leapSpeed;
      }
      w.x += w.vx * dt;
      w.z += w.vz * dt;
      const prog = 1 - Math.max(0, Math.min(1, w.modeTimer / 0.52));
      const baseH = worldFloor(state, w.x, w.z);
      w.y = baseH + Math.sin(prog * Math.PI) * 2.15;
      w.gaitDist += leapSpeed * 0.65 * dt;

      const hitR = ENEMY_ARCHETYPE_SPECS[tgt.archetype].hitRadius + 0.9;
      if (dist <= hitR || w.modeTimer <= 0) {
        w.mode = 'bite_slash';
        w.modeTimer = 0.86;
        w.biteTickTimer = 0;
        w.y = worldFloor(state, w.x, w.z);
      }
      return;
    }
  }

  if (w.mode === 'bite_slash') {
    const tgt = findTarget();
    w.modeTimer -= dt;
    if (!tgt || w.modeTimer <= 0) {
      w.mode = 'escort';
      w.targetUid = null;
    } else {
      const orbitAng = state.elapsedPlaySec * 9.5;
      const latchDist = Math.max(1.25, ENEMY_ARCHETYPE_SPECS[tgt.archetype].hitRadius * 1.05);
      w.x = tgt.x + Math.cos(orbitAng) * latchDist;
      w.z = tgt.z + Math.sin(orbitAng) * latchDist;
      w.y = worldFloor(state, w.x, w.z) + 0.18;
      w.yaw = Math.atan2(tgt.z - w.z, tgt.x - w.x);
      w.gaitDist += 14 * dt;

      w.biteTickTimer -= dt;
      if (w.biteTickTimer <= 0) {
        w.biteTickTimer = 0.18;
        w.slashFlashTimer = 0.14;
        tgt.slowTimer = Math.max(tgt.slowTimer, 3.2);
        damageEnemyEntity(
          state,
          tgt,
          28,
          18,
          '僚机Go2电磁扑咬',
          [tgt.x, tgt.y + (tgt.isBoss ? 1.4 : 0.8), tgt.z],
          3.2,
          { fromWingman: true }
        );
      }
      return;
    }
  }

  const escortX = state.x + fwdX * 2.15 + rightX * 2.35;
  const escortZ = state.z + fwdZ * 2.15 + rightZ * 2.35;
  const dxE = escortX - w.x;
  const dzE = escortZ - w.z;
  const distE = Math.hypot(dxE, dzE);
  const escortK = 1 - Math.exp(-9 * dt);

  if (distE > 0.25) {
    const desiredSpd = Math.min(18.5, distE * 5.2 + 2.2);
    w.vx += ((dxE / distE) * desiredSpd - w.vx) * escortK;
    w.vz += ((dzE / distE) * desiredSpd - w.vz) * escortK;
    w.yaw = turnTowardsAngle(w.yaw, Math.atan2(w.vz, w.vx), 8.5 * dt);
  } else {
    const drag = Math.pow(0.8, dt * 60);
    w.vx *= drag;
    w.vz *= drag;
    w.yaw = turnTowardsAngle(w.yaw, state.aimYaw, 7.0 * dt);
  }

  w.x += w.vx * dt;
  w.z += w.vz * dt;
  w.y = worldFloor(state, w.x, w.z);
  w.gaitDist += Math.hypot(w.vx, w.vz) * dt;

  w.biteTickTimer = Math.max(0, w.biteTickTimer - dt);
  if (w.biteTickTimer <= 0) {
    for (const e of state.enemies) {
      if (e.koTimer > 0 || e.dropPodProgress < 0.85 || e.archetype === 'aero_hunter') continue;
      const d = Math.hypot(e.x - w.x, e.z - w.z);
      if (d < 5.6) {
        w.biteTickTimer = 1.15;
        w.slashFlashTimer = 0.14;
        e.slowTimer = Math.max(e.slowTimer, 1.8);
        damageEnemyEntity(
          state,
          e,
          18,
          10,
          '僚机Go2护卫撕咬',
          [e.x, e.y + 0.7, e.z],
          2.4,
          { fromWingman: true }
        );
        break;
      }
    }
  }
}

function slidePlayerAlongContact(state: MarsCombatWorldState, nx: number, nz: number, penetration: number): void {
  state.x += nx * penetration;
  state.z += nz * penetration;
  const inwardSpeed = Math.min(0, state.vx * nx + state.vz * nz);
  state.vx -= nx * inwardSpeed;
  state.vz -= nz * inwardSpeed;
}

function resolvePlayerArenaContacts(state: MarsCombatWorldState, fromX: number, fromZ: number): void {
  for (const obstacle of getMarsBattlefieldObstacles(state.mapId, state.polarMission?.gateOpen)) {
    const clearance = PLAYER_COLLISION_RADIUS + obstacle.radius;
    const entry = segmentIntersectsCircle2D(fromX, fromZ, state.x, state.z, obstacle.x, obstacle.z, clearance);
    if (entry === null) continue;
    const top = worldFloor(state, obstacle.x, obstacle.z) + obstacle.height;
    if (state.y >= top - 0.25) continue;

    // Keep the first contact normal even when a dash or a crowd push crosses the center.
    const hitX = fromX + (state.x - fromX) * entry - obstacle.x;
    const hitZ = fromZ + (state.z - fromZ) * entry - obstacle.z;
    const distance = Math.hypot(hitX, hitZ);
    const nx = distance > 1e-6 ? hitX / distance : 1;
    const nz = distance > 1e-6 ? hitZ / distance : 0;
    const penetration = clearance - (state.x - obstacle.x) * nx - (state.z - obstacle.z) * nz;
    if (penetration >= 0) slidePlayerAlongContact(state, nx, nz, penetration);
  }

  const distance = Math.hypot(state.x, state.z);
  if (distance >= ARENA_RADIUS) {
    slidePlayerAlongContact(state, -state.x / distance, -state.z / distance, distance - ARENA_RADIUS);
  }
}

export function resolveCombatSoftCollisions(state: MarsCombatWorldState): void {
  const previousX = state.x;
  const previousZ = state.z;
  const wingmanR = 0.72;
  resolvePlayerArenaContacts(state, previousX, previousZ);

  for (const obs of getMarsBattlefieldObstacles(state.mapId, state.polarMission?.gateOpen)) {
    if (state.wingman.mode === 'escort') {
      const dxW = state.wingman.x - obs.x;
      const dzW = state.wingman.z - obs.z;
      const minDW = wingmanR + obs.radius;
      const dW = Math.hypot(dxW, dzW);
      if (dW < minDW) {
        const nx = dW > 1e-4 ? dxW / dW : 1;
        const nz = dW > 1e-4 ? dzW / dW : 0;
        state.wingman.x += nx * (minDW - dW);
        state.wingman.z += nz * (minDW - dW);
        state.wingman.y = worldFloor(state, state.wingman.x, state.wingman.z);
      }
    }
  }

  // 1. Player <-> Wingman separation
  if (state.wingman.mode === 'escort') {
    const dx = state.wingman.x - state.x;
    const dz = state.wingman.z - state.z;
    const minD = PLAYER_COLLISION_RADIUS + wingmanR;
    const d = Math.hypot(dx, dz);
    if (d < minD) {
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      const push = minD - d;
      state.wingman.x += nx * push;
      state.wingman.z += nz * push;
      state.wingman.y = worldFloor(state, state.wingman.x, state.wingman.z);
    }
  }

  // 2. Player <-> Grounded Enemies & Boss separation + Enemy <-> Cover Obstacles
  for (let i = 0; i < state.enemies.length; i++) {
    const a = state.enemies[i];
    if (a.koTimer > 0 || a.dropPodProgress < 0.75 || a.archetype === 'aero_hunter') continue;
    const rA = a.isBoss ? 2.65 : ENEMY_ARCHETYPE_SPECS[a.archetype].hitRadius * 0.88;

    const verticalGap = state.y - a.y;
    if (verticalGap < 1.65) {
      const dxP = a.x - state.x;
      const dzP = a.z - state.z;
      const minDP = PLAYER_COLLISION_RADIUS + rA;
      const dP = Math.hypot(dxP, dzP);
      if (dP < minDP) {
        const nx = dP > 1e-4 ? dxP / dP : Math.cos(a.uid * 1.7);
        const nz = dP > 1e-4 ? dzP / dP : Math.sin(a.uid * 1.7);
        const overlap = minDP - dP;
        const beforePushX = state.x;
        const beforePushZ = state.z;
        const playerPush = overlap * (a.isBoss ? 0.82 : 0.28);
        state.x -= nx * playerPush;
        state.z -= nz * playerPush;
        resolvePlayerArenaContacts(state, beforePushX, beforePushZ);
        // When cover limits the player's displacement, the other body takes the remaining separation.
        const playerTravel = (beforePushX - state.x) * nx + (beforePushZ - state.z) * nz;
        const remaining = Math.max(0, overlap - playerTravel);
        a.x += nx * remaining;
        a.z += nz * remaining;
      }
    }

    for (let j = i + 1; j < state.enemies.length; j++) {
      const b = state.enemies[j];
      if (b.koTimer > 0 || b.dropPodProgress < 0.75 || b.archetype === 'aero_hunter') continue;
      const rB = b.isBoss ? 2.65 : ENEMY_ARCHETYPE_SPECS[b.archetype].hitRadius * 0.88;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minD = rA + rB;
      const d = Math.hypot(dx, dz);
      if (d < minD) {
        const nx = d > 1e-4 ? dx / d : Math.cos((a.uid + b.uid) * 1.3);
        const nz = d > 1e-4 ? dz / d : Math.sin((a.uid + b.uid) * 1.3);
        const overlap = minD - d;
        const wA = a.isBoss ? 0.1 : b.isBoss ? 0.9 : 0.5;
        const wB = 1 - wA;
        a.x -= nx * overlap * wA;
        a.z -= nz * overlap * wA;
        b.x += nx * overlap * wB;
        b.z += nz * overlap * wB;
        b.y = worldFloor(state, b.x, b.z);
      }
    }

    for (const obs of getMarsBattlefieldObstacles(state.mapId, state.polarMission?.gateOpen)) {
      const dxO = a.x - obs.x;
      const dzO = a.z - obs.z;
      const minDO = rA * 0.8 + obs.radius;
      const dO = Math.hypot(dxO, dzO);
      if (dO < minDO) {
        const nx = dO > 1e-4 ? dxO / dO : 1;
        const nz = dO > 1e-4 ? dzO / dO : 0;
        a.x += nx * (minDO - dO);
        a.z += nz * (minDO - dO);
      }
    }
    a.y = worldFloor(state, a.x, a.z);
  }

  if (state.isGrounded && (state.x !== previousX || state.z !== previousZ)) {
    state.y = chassisFloor(state);
  }
}

export interface CombatUpperLowerIKParams {
  mechId: PlayerMechId;
  jointName: string;
  axis: [number, number, number];
  limitLower: number;
  limitUpper: number;
  baseGaitAngle: number;
  chassisYaw: number;
  aimYaw: number;
  aimPitch: number;
  recoilPos: number; // 0..1 spring kickback (~80ms)
  heavyPostureTimer: number; // 0..0.35s braced horse-stance & 12° recoil lean-back
  wingmanCommandTimer: number; // > 0 raises left arm forward to command Go2 pounce!
  activeWeapon?: CombatWeaponId;
  meleeSwingTimer?: number; // 0.32..0s horizontal high-frequency war-axe cleave!
}

function wrapAnglePi(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clampJointLimit(val: number, lower: number, upper: number): number {
  if (lower < upper) return Math.max(lower, Math.min(upper, val));
  return val;
}

/**
 * Pure Upper/Lower Body Split Aiming & Weapon Posture IK Solver:
 * - Lower body (hip/knee/ankle) follows WASD locomotion gait + braced wide horse-stance on heavy skills (`0.35s`).
 * - Upper body (waist/torso yaw & pitch, right shoulder/elbow/wrist rifle-ready aim, left foregrip support or [Q] command point, head gaze)
 *   smoothly tracks the 3D reticle aim direction while absorbing ~80ms spring recoil impulses!
 */
export function computeCombatUpperLowerBodyIK(params: CombatUpperLowerIKParams): number {
  const {
    mechId,
    jointName,
    limitLower,
    limitUpper,
    baseGaitAngle,
    chassisYaw,
    aimYaw,
    aimPitch,
    recoilPos,
    heavyPostureTimer,
    wingmanCommandTimer
  } = params;

  const n = jointName.toLowerCase();
  const relAimYaw = Math.max(-1.25, Math.min(1.25, wrapAnglePi(aimYaw - chassisYaw)));
  const clampedPitch = Math.max(-0.72, Math.min(0.72, aimPitch));
  const heavy01 = Math.max(0, Math.min(1, heavyPostureTimer / 0.22));
  const cmd01 = Math.max(0, Math.min(1, wingmanCommandTimer / 0.18));
  const leanBack12Deg = 0.21 * heavy01; // 12 degrees = 0.2094 rad
  const meleeTimer = params.meleeSwingTimer ?? 0;
  const meleeProg = meleeTimer > 0 ? 1 - Math.max(0, Math.min(1, meleeTimer / 0.32)) : -1;
  const isBow = params.activeWeapon === 'compound_bow';

  if (HUMANOID_COMBAT_MECHS.has(mechId)) {
    const isValk = mechId === 'nasa_valkyrie';
    // 1. LOWER BODY: WASD stride + 0.35s Heavy Skill Wide Horse-Stance Crouch!
    if (n.includes('hip_roll') || n.includes('hiproll')) {
      const sideSign = n.includes('left') ? 1 : -1;
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.65) + sideSign * 0.22 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('hip_pitch') || n.includes('hippitch')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.55) - 0.38 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('knee')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.5) + 0.72 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('ankle_pitch') || n.includes('anklepitch')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.5) - 0.34 * heavy01, limitLower, limitUpper);
    }

    // 2. WAIST / TORSO: Real-time 3D Aiming Yaw + Pitch + Melee Axe Torso Whip!
    const meleeTwist = meleeProg >= 0 ? Math.cos(meleeProg * Math.PI) * 0.72 : 0;
    if (n.includes('waist_yaw') || n.includes('torso_yaw') || n.includes('torsoyaw')) {
      return clampJointLimit(-relAimYaw * 0.78 + meleeTwist, limitLower, limitUpper);
    }
    if (n.includes('waist_pitch') || n.includes('torso_pitch') || n.includes('torsopitch')) {
      const targetPitch = -clampedPitch * 0.38 - leanBack12Deg - recoilPos * 0.16;
      return clampJointLimit(targetPitch, limitLower, limitUpper);
    }
    if (n.includes('waist_roll') || n.includes('torso_roll') || n.includes('torseroll')) {
      return clampJointLimit(-relAimYaw * 0.12, limitLower, limitUpper);
    }

    // 3. HEAD / LIDAR GAZE: Locks onto reticle target
    if (n.includes('head_yaw') || n.includes('neckyaw')) {
      return clampJointLimit(-relAimYaw * 0.42, limitLower, limitUpper);
    }
    if (n.includes('head_pitch') || n.includes('neckpitch')) {
      return clampJointLimit(-clampedPitch * 0.45, limitLower, limitUpper);
    }

    // 4. RIGHT ARM: Melee War-Axe Diagonal Cleave OR Bow-String Draw OR Shoulder-Braced Rifle!
    if (meleeProg >= 0) {
      const sweepYaw = -0.85 + meleeProg * 1.95;
      if (n.includes('right_shoulder_pitch') || n === 'rightshoulderpitch')
        return clampJointLimit((isValk ? -0.58 : -1.18) - clampedPitch * 0.4, limitLower, limitUpper);
      if (n.includes('right_shoulder_roll') || n === 'rightshoulderroll')
        return clampJointLimit((isValk ? -0.15 : -0.55) + meleeProg * 0.65, limitLower, limitUpper);
      if (n.includes('right_shoulder_yaw') || n === 'rightshoulderyaw')
        return clampJointLimit(sweepYaw, limitLower, limitUpper);
      if (n.includes('right_elbow') || n === 'rightelbowpitch')
        return clampJointLimit((isValk ? 0.15 : 0.45) + Math.sin(meleeProg * Math.PI) * 0.55, limitLower, limitUpper);
    }

    if (n.includes('right_shoulder_pitch') || n === 'rightshoulderpitch') {
      const baseAim = (isValk ? -0.34 : isBow ? -0.92 : -0.62) - clampedPitch * 0.52;
      const heavyStraight = (isValk ? -0.78 : -1.42) - clampedPitch * 0.82;
      const blended = baseAim * (1 - heavy01) + heavyStraight * heavy01;
      const recoilRise = -recoilPos * 0.24;
      return clampJointLimit(blended + recoilRise, limitLower, limitUpper);
    }
    if (n.includes('right_shoulder_roll') || n === 'rightshoulderroll') {
      if (isValk) return clampJointLimit(-relAimYaw * 0.12, limitLower, limitUpper);
      return clampJointLimit((isBow ? -0.26 : -0.12) * (1 - heavy01) - relAimYaw * 0.16, limitLower, limitUpper);
    }
    if (n.includes('right_shoulder_yaw') || n === 'rightshoulderyaw') {
      return clampJointLimit(-relAimYaw * 0.24, limitLower, limitUpper);
    }
    if (n.includes('right_elbow') || n === 'rightelbowpitch') {
      if (isValk) return clampJointLimit(0.22 - clampedPitch * 0.35 - recoilPos * 0.18, limitLower, limitUpper);
      const baseElbow = (isBow ? 0.96 : 0.62) - clampedPitch * 0.48;
      const heavyElbow = 1.42 - clampedPitch * 0.18;
      const elbowBlended = baseElbow * (1 - heavy01) + heavyElbow * heavy01 - recoilPos * 0.18;
      return clampJointLimit(elbowBlended, limitLower, limitUpper);
    }
    if (n.includes('right_wrist_pitch') || n === 'rightwristpitch') {
      return clampJointLimit(-recoilPos * 0.22, limitLower, limitUpper);
    }

    // 5. LEFT ARM: Bow Riser Straight Extension OR Tactical Foregrip Support OR [Q] Wingman Pointing!
    if (n.includes('left_shoulder_pitch') || n === 'leftshoulderpitch') {
      const foregripSupport =
        (isValk ? -0.36 : isBow ? -1.36 : -0.66) - clampedPitch * (isBow ? 0.78 : 0.5) - recoilPos * 0.14;
      const commandPoint = (isValk ? -0.92 : -1.46) - clampedPitch * 0.82;
      const heavyDualPush = (isValk ? -0.82 : -1.38) - clampedPitch * 0.8;
      const activePose =
        cmd01 > 0.01
          ? foregripSupport * (1 - cmd01) + commandPoint * cmd01
          : foregripSupport * (1 - heavy01) + heavyDualPush * heavy01;
      return clampJointLimit(activePose, limitLower, limitUpper);
    }
    if (n.includes('left_shoulder_roll') || n === 'leftshoulderroll') {
      if (isValk) return clampJointLimit(0.18 * (1 - Math.max(cmd01, heavy01)), limitLower, limitUpper);
      const crossInward = (isBow ? -0.12 : -0.44) * (1 - Math.max(cmd01, heavy01)) + 0.08 * cmd01;
      return clampJointLimit(crossInward, limitLower, limitUpper);
    }
    if (n.includes('left_shoulder_yaw') || n === 'leftshoulderyaw') {
      return clampJointLimit((isBow ? -0.14 : -0.48) * (1 - Math.max(cmd01, heavy01)) - relAimYaw * 0.2, limitLower, limitUpper);
    }
    if (n.includes('left_elbow') || n === 'leftelbowpitch') {
      if (isValk) return clampJointLimit(-0.22 + cmd01 * 0.2, limitLower, limitUpper);
      const supportBend = (isBow ? 1.32 : 0.52) - clampedPitch * (isBow ? 0.2 : 0.45);
      const straightExtend = 1.42 - clampedPitch * 0.18;
      const activeBend =
        supportBend * (1 - Math.max(cmd01, heavy01)) + straightExtend * Math.max(cmd01, heavy01);
      return clampJointLimit(activeBend, limitLower, limitUpper);
    }
  }

  // Spot-Arm Dorsal 6-DOF Snake Arm Aiming (`arm_sh0` pan + `arm_wr0` pitch + recoil kick!)
  if (mechId === 'spot_arm') {
    if (n === 'arm_sh0') return clampJointLimit(-relAimYaw * 0.92, limitLower, limitUpper);
    if (n === 'arm_sh1') return clampJointLimit(-0.08 * heavy01 - recoilPos * 0.14, limitLower, limitUpper);
    if (n === 'arm_el0') return clampJointLimit(0.12 * heavy01 + recoilPos * 0.18, limitLower, limitUpper);
    if (n === 'arm_wr0') return clampJointLimit(-clampedPitch * 0.85 - recoilPos * 0.24, limitLower, limitUpper);
  }

  // Unitree Z1 / SAR / Mars2020 / Go2 turret & articulated arm aiming + recoil kick!
  if (n.includes('joint1') || n.includes('waist') || n.includes('turret') || n.includes('pan') || n.includes('az')) {
    return clampJointLimit(relAimYaw * 0.9, limitLower, limitUpper);
  }
  if (n.includes('joint2') || n.includes('shoulder') || n.includes('boom')) {
    return clampJointLimit(-0.55 - clampedPitch * 0.65 - recoilPos * 0.22 - 0.18 * heavy01, limitLower, limitUpper);
  }
  if (n.includes('joint3') || n.includes('elbow')) {
    return clampJointLimit(0.45 + recoilPos * 0.28 - 0.2 * heavy01, limitLower, limitUpper);
  }
  if (QUADRUPED_COMBAT_MECHS.has(mechId) && (n.includes('thigh') || n.includes('calf'))) {
    // Go2 crouches into braced predator stance on heavy weapon fire!
    const crouchDelta = n.includes('thigh') ? 0.26 * heavy01 : -0.48 * heavy01;
    return clampJointLimit(baseGaitAngle + crouchDelta, limitLower, limitUpper);
  }

  return clampJointLimit(baseGaitAngle, limitLower, limitUpper);
}

