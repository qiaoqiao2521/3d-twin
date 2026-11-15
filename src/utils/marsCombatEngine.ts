import { sampleLandTerrainHeight, sampleLandChassisSupportHeight } from './actionSandboxEngine';

export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';
export type GameOutcome = 'none' | 'victory' | 'defeat';

export type PlayerMechId = 'unitree_g1' | 'unitree_go2' | 'sar' | 'mars2020' | 'unitree_z1';
export type CombatWeaponId = 'pulse_rifle' | 'railgun' | 'missile_pod';
export type EnemyArchetypeId = 'go2_hound' | 'g1_vanguard' | 'sar_siege' | 'aero_hunter' | 'ares_boss';
export type BossAttackKind = 'none' | 'balteus_salvo' | 'coral_laser_sweep' | 'orbital_pillars';
export type AttackPhase = 'idle' | 'windup' | 'active' | 'recovery';

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
  slotKey: '1' | '2' | '3';
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
      '/twins/models/L1_mobility_rocker_bogie.glb',
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
    codeName: '苍穹截击无人机 · CFM',
    glbUrls: ['/twins/models/L1_nacelle_casings.glb', '/twins/models/L2_turbofan_core.glb'],
    scaleDim: 2.25,
    maxHp: 120,
    maxShield: 45,
    maxStagger: 65,
    speed: 9.2,
    hitRadius: 1.25,
    scoreValue: 260,
    accentHex: '#38bdf8'
  },
  ares_boss: {
    archetype: 'ares_boss',
    codeName: 'ARES-09 · 赤星重装核能泰坦',
    glbUrls: ['/robotics_glb/rexrov2_oberon7_subsea_rov.glb'],
    urdfUrl: '/baselines/02-水下机器人ROV与深海作业系统/rexrov2/rexrov2_description/robots/rexrov2_oberon7.xacro',
    scaleDim: 5.6,
    maxHp: 2150,
    maxShield: 520,
    maxStagger: 260,
    speed: 4.8,
    hitRadius: 2.85,
    scoreValue: 2500,
    accentHex: '#ff2a55'
  }
};

export interface CombatEnemyEntity {
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
  kind: 'pulse' | 'rail' | 'missile' | 'enemy_plasma' | 'boss_missile';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  staggerDamage: number;
  life: number;
  maxLife: number;
  homingTargetUid: number | null;
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
  kind: 'mortar' | 'orbital_pillar' | 'boss_phase_nova' | 'player_orbital_ion';
  detonated: boolean;
  lingerTimer: number;
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
  bossHpRemainingPct: number;
  mechTitle: string;
}

export interface MarsCombatWorldState {
  shellState: GameShellState;
  outcome: GameOutcome;
  outcomeDelayTimer: number;
  runSnapshot: RunSummarySnapshot | null;

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

  // Weapons, Gun Recoil Spring & Tactical Postures
  activeWeapon: CombatWeaponId;
  weaponCooldown: number;
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
    firedWeapon: CombatWeaponId | 'orbital_ion' | null;
    hitConfirmed: { crit: boolean; kill: boolean; shield: boolean; shieldShattered?: boolean } | null;
    bossCue: 'boss_warning' | 'acs_stagger_break' | 'laser_charge' | 'emp_nova' | null;
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
    }[];
    explosions: { x: number; y: number; z: number; scale: number; colorHex: string }[];
  };
}

export interface CombatStepInput {
  moveForward: number; // -1..1
  moveRight: number; // -1..1
  sprintHeld: boolean;
  fireHeld: boolean;
  missileJustPressed: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  dashJustPressed: boolean;
  empJustPressed: boolean;
  wingmanCommandJustPressed?: boolean;
  ultimateJustPressed: boolean;
  summonBossJustPressed: boolean;
  aimYaw: number;
  aimPitch: number;
  aimWorldPoint: [number, number, number] | null;
  muzzleWorldPoint?: [number, number, number] | null;
}

const MAX_PROJECTILES = 96;
const ARENA_RADIUS = 68;

export function getPlayableMechSpec(id: PlayerMechId): PlayableMechSpec {
  return PLAYABLE_MECH_SPECS.find((m) => m.id === id) || PLAYABLE_MECH_SPECS[0];
}

export function getCombatWeaponSpec(id: CombatWeaponId): CombatWeaponSpec {
  return COMBAT_WEAPONS.find((w) => w.id === id) || COMBAT_WEAPONS[0];
}

export function createInitialMarsCombatState(
  mechId: PlayerMechId = 'unitree_g1',
  bestScore: number = 0,
  autostart: boolean = false
): MarsCombatWorldState {
  const spec = getPlayableMechSpec(mechId);
  const startY = sampleLandChassisSupportHeight(0, 0, 0, mechId);

  const projectiles: CombatProjectile[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    projectiles.push({
      active: false,
      fromPlayer: true,
      kind: 'pulse',
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      damage: 0,
      staggerDamage: 0,
      life: 0,
      maxLife: 1,
      homingTargetUid: null,
      sourceX: 0,
      sourceZ: 0
    });
  }

  const state: MarsCombatWorldState = {
    shellState: autostart ? 'playing' : 'title',
    outcome: 'none',
    outcomeDelayTimer: 0,
    runSnapshot: null,

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
      y: sampleLandTerrainHeight(2.15, 2.35),
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
 * Spawns enemy robots via Orbital Drop-Pods around the player's current position on Mars.
 */
export function spawnEnemyDropPod(
  state: MarsCombatWorldState,
  archetype: EnemyArchetypeId,
  angleRad?: number,
  distMeters?: number
): CombatEnemyEntity {
  const spec = ENEMY_ARCHETYPE_SPECS[archetype];
  const ang = angleRad ?? randRange(0, Math.PI * 2);
  const dist = distMeters ?? (archetype === 'ares_boss' ? 30 : randRange(22, 42));
  const rawX = state.x + Math.cos(ang) * dist;
  const rawZ = state.z + Math.sin(ang) * dist;
  const clampedR = Math.hypot(rawX, rawZ);
  const scaleBack = clampedR > ARENA_RADIUS - 4 ? (ARENA_RADIUS - 4) / clampedR : 1;
  const x = rawX * scaleBack;
  const z = rawZ * scaleBack;
  const groundY = sampleLandTerrainHeight(x, z);
  const y = archetype === 'aero_hunter' ? groundY + 6.8 : groundY;

  const waveMult = archetype === 'ares_boss' ? 1 : 1 + (state.wave - 1) * 0.16;
  const maxHp = Math.round(spec.maxHp * waveMult);
  const maxShield = Math.round(spec.maxShield * waveMult);

  const entity: CombatEnemyEntity = {
    uid: state.nextUid++,
    archetype,
    codeName: spec.codeName,
    isBoss: archetype === 'ares_boss',
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
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
    aiCooldown: archetype === 'ares_boss' ? 1.35 : randRange(0.9, 2.1, state.nextUid),
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
    state.wave === 1
      ? ['go2_hound', 'g1_vanguard', 'sar_siege']
      : ['go2_hound', 'g1_vanguard', 'sar_siege', 'aero_hunter'];

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

function allocProjectile(state: MarsCombatWorldState): CombatProjectile | null {
  for (let i = 0; i < state.projectiles.length; i++) {
    if (!state.projectiles[i].active) return state.projectiles[i];
  }
  return state.projectiles[0];
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
      bossHpRemainingPct: boss ? Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)) : 100,
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
  shieldMultiplier: number = 1.0
): void {
  if (enemy.koTimer > 0) return;

  const isDirectStaggerHit = enemy.staggeredTimer > 0 || enemy.shieldBreakStunTimer > 0;
  const dmgMult = enemy.staggeredTimer > 0 ? 2.5 : enemy.shieldBreakStunTimer > 0 ? 1.35 : 1.0;
  const displayedDamage = Math.round(baseDamage * dmgMult);
  let finalDmg = displayedDamage;
  let hitShield = false;
  let shieldShattered = false;

  const centerY = enemy.y + (enemy.isBoss ? 1.85 : enemy.archetype === 'aero_hunter' ? 0 : 0.95);
  const hx = hitWorldPoint ? hitWorldPoint[0] : enemy.x + Math.cos(enemy.yaw) * 0.65;
  const hy = hitWorldPoint ? hitWorldPoint[1] : centerY + 0.15;
  const hz = hitWorldPoint ? hitWorldPoint[2] : enemy.z + Math.sin(enemy.yaw) * 0.65;

  // Compute unit hit normal in enemy local frame for Localized Hexagonal Shield Water-Ripple!
  const relWX = hx - enemy.x;
  const relWY = hy - centerY;
  const relWZ = hz - enemy.z;
  const relLen = Math.max(0.01, Math.hypot(relWX, relWY, relWZ));
  const worldNx = relWX / relLen;
  const worldNy = relWY / relLen;
  const worldNz = relWZ / relLen;
  // rig.root.rotation.y = -enemy.yaw -> local +X maps to world (cos(yaw), 0, sin(yaw))
  // Inverse (world -> local) transpose:
  const cosY = Math.cos(enemy.yaw);
  const sinY = Math.sin(enemy.yaw);
  const localDirX = worldNx * cosY + worldNz * sinY;
  const localDirZ = -worldNx * sinY + worldNz * cosY;

  if (enemy.shield > 0) {
    hitShield = true;
    enemy.shieldRippleTimer = 0.48;
    enemy.lastShieldHitLocalDir = [localDirX, worldNy, localDirZ];

    const shieldDmg = Math.round(finalDmg * shieldMultiplier);
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

  enemy.hitFlashTimer = 0.065;
  // Physical Hit-Stagger Spring Impulse + Knockback (replaces full-white emissive washout!)
  const massFactor = enemy.isBoss ? 0.28 : enemy.archetype === 'sar_siege' ? 0.55 : 1.0;
  const impulseMag = Math.min(2.2, (0.55 + baseDamage / 85) * massFactor);
  enemy.hitTiltVelP += (-localDirX * 6.8 + 1.8) * impulseMag;
  enemy.hitTiltVelR += localDirZ * 6.2 * impulseMag;
  if (enemy.archetype !== 'ares_boss') {
    const knockSpd = (1.6 + baseDamage * 0.024) * massFactor;
    enemy.vx -= worldNx * knockSpd;
    enemy.vz -= worldNz * knockSpd;
  }

  state.events.sparkImpacts.push({
    x: hx,
    y: hy,
    z: hz,
    nx: worldNx,
    ny: Math.max(0.15, worldNy),
    nz: worldNz,
    isShield: hitShield,
    isCrit: isDirectStaggerHit,
    isShatter: shieldShattered
  });

  state.damagePopups.push({
    id: state.nextUid++,
    worldX: hx + (Math.random() - 0.5) * 0.35,
    worldY: hy + 0.35,
    worldZ: hz + (Math.random() - 0.5) * 0.35,
    amount: displayedDamage,
    isCrit: isDirectStaggerHit || shieldShattered,
    isShield: hitShield && !shieldShattered,
    life: 0.72
  });
  if (state.damagePopups.length > 10) {
    state.damagePopups.shift();
  }

  state.ultimateCharge = Math.min(100, state.ultimateCharge + (enemy.isBoss ? 2.8 : 4.5));

  // Accumulate Armored Core 6 ACS Stagger bar when not already staggered
  if (enemy.staggeredTimer <= 0 && enemy.hp > 0) {
    enemy.stagger = Math.min(enemy.maxStagger, enemy.stagger + staggerDamage);
    if (enemy.stagger >= enemy.maxStagger) {
      enemy.stagger = enemy.maxStagger;
      enemy.staggeredTimer = enemy.isBoss ? 3.8 : 2.4;
      enemy.attackPhase = 'idle';
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.065);
      state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.42);
      state.events.bossCue = 'acs_stagger_break';
      state.events.explosions.push({
        x: enemy.x,
        y: enemy.y + (enemy.isBoss ? 1.6 : 0.9),
        z: enemy.z,
        scale: enemy.isBoss ? 2.8 : 1.4,
        colorHex: '#f59e0b'
      });
    }
  }

  // Boss 50% HP Phase 2 Coral Overdrive transition!
  if (enemy.isBoss && enemy.bossPhase === 1 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
    enemy.bossPhase = 2;
    enemy.bossPhaseTransitionTimer = 1.4;
    enemy.staggeredTimer = 0;
    enemy.stagger = 0;
    state.hitstopTimer = 0.075;
    state.cameraTrauma = 0.72;
    state.events.bossCue = 'boss_warning';
    // Spatial AoE warning ring ("GET BACK!") around Boss
    state.hazards.push({
      id: state.nextUid++,
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      radius: 10.5,
      elapsed: 0,
      windupDuration: 0.95,
      damage: 42,
      kind: 'boss_phase_nova',
      detonated: false,
      lingerTimer: 0.45
    });
  }

  const killed = enemy.hp <= 0;
  state.hitmarker = {
    timer: killed ? 0.22 : 0.12,
    isCrit: isDirectStaggerHit || shieldShattered,
    isShield: hitShield && !isDirectStaggerHit && !shieldShattered,
    isKill: killed,
    lastDamage: displayedDamage
  };
  state.events.hitConfirmed = {
    crit: isDirectStaggerHit || shieldShattered,
    kill: killed,
    shield: hitShield,
    shieldShattered
  };

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
      colorHex: enemy.isBoss ? '#ff2a55' : spec.accentHex
    });

    // Spawn combat pickup core
    state.pickups.push({
      id: state.nextUid++,
      kind: state.kills % 2 === 0 ? 'repair_core' : 'overcharge_cell',
      x: enemy.x,
      y: sampleLandTerrainHeight(enemy.x, enemy.z) + 0.55,
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

/**
 * Advances one simulation frame of the Mars Sci-Fi Mech Combat Game.
 * Clamps rawDt <= 0.05s and enforces sim-level hitstop while decaying visual timers cleanly.
 */
export function stepMarsCombatWorld(
  state: MarsCombatWorldState,
  rawDt: number,
  input: CombatStepInput
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

  // Real-time visual feedback timers continue ticking during hitstop
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.45);
  if (state.hitmarker.timer > 0) state.hitmarker.timer = Math.max(0, state.hitmarker.timer - dt);
  if (state.bossBannerTimer > 0) state.bossBannerTimer = Math.max(0, state.bossBannerTimer - dt);
  if (state.empWaveTimer > 0) state.empWaveTimer = Math.max(0, state.empWaveTimer - dt);
  if (state.ultimateBeamTimer > 0) state.ultimateBeamTimer = Math.max(0, state.ultimateBeamTimer - dt);
  if (state.muzzleFlashTimer > 0) state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - dt);
  if (state.heavyPostureTimer > 0) state.heavyPostureTimer = Math.max(0, state.heavyPostureTimer - dt);
  if (state.wingmanCommandTimer > 0) state.wingmanCommandTimer = Math.max(0, state.wingmanCommandTimer - dt);

  // Step ~80ms transient gun recoil spring (omega_n = 36 rad/s, zeta = 0.72)
  const recoilAcc = -1296.0 * state.recoilPos - 51.8 * state.recoilVel;
  state.recoilVel += recoilAcc * dt;
  state.recoilPos = Math.max(-0.08, Math.min(0.45, state.recoilPos + state.recoilVel * dt));

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

  // Delayed trailing ghost HP bars
  state.ghostHp += (state.hp - state.ghostHp) * Math.min(1, dt * 4.2);

  // Outcome transition beat
  if (state.outcome !== 'none') {
    state.outcomeDelayTimer -= dt;
    if (state.outcomeDelayTimer <= 0) {
      state.shellState = 'gameover';
      return;
    }
  }

  // Sim-level Hitstop freeze
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return;
  }

  state.elapsedPlaySec += dt;
  state.aimYaw = input.aimYaw;
  state.aimPitch = input.aimPitch;

  if (input.summonBossJustPressed && !state.bossSpawned) {
    summonAresBoss(state);
  }

  // Combo decay
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  // Cooldowns & regeneration
  state.weaponCooldown = Math.max(0, state.weaponCooldown - dt);
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

  // 1. Player Movement, Coyote Jump, Variable Jump Cut & Vector Quick-Boost Dash
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

  // Vector Quick-Boost Dash [Shift / Alt] with i-frames
  if (input.dashJustPressed && state.dashCooldown <= 0 && state.boostEnergy >= 24) {
    state.dashCooldown = 0.68;
    state.dashTimer = 0.22;
    state.invulnTimer = 0.34;
    state.boostEnergy = Math.max(0, state.boostEnergy - 28);
    const dX = wishLen > 0.05 ? wishX : fwdX;
    const dZ = wishLen > 0.05 ? wishZ : fwdZ;
    state.vx = dX * mechSpec.dashImpulse;
    state.vz = dZ * mechSpec.dashImpulse;
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.16);
  }

  if (state.dashTimer > 0) {
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
    const accelK = 1 - Math.exp(-12 * dt);
    state.vx += (targetVx - state.vx) * accelK;
    state.vz += (targetVz - state.vz) * accelK;
  }

  // Jump buffering + Coyote time + Variable jump cut
  if (input.jumpJustPressed) state.jumpBufferTimer = 0.12;
  else state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);

  if (state.isGrounded) state.coyoteTimer = 0.1;
  else state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);

  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = 10.6;
    state.isGrounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
  } else if (!input.jumpHeld && state.vy > 2.5) {
    state.vy *= 0.55;
  }

  if (!state.isGrounded) {
    state.vy -= 21.5 * dt; // Responsive combat gravity on Mars
  }

  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.y += state.vy * dt;

  // Soft natural canyon perimeter clamp
  const rPlayer = Math.hypot(state.x, state.z);
  if (rPlayer > ARENA_RADIUS) {
    const s = ARENA_RADIUS / rPlayer;
    state.x *= s;
    state.z *= s;
  }

  const floorY = sampleLandChassisSupportHeight(state.x, state.z, state.yaw, state.mechId);
  if (state.y <= floorY + 0.02 && state.vy <= 0) {
    state.y = floorY;
    state.vy = 0;
    state.isGrounded = true;
  } else if (state.y > floorY + 0.08) {
    state.isGrounded = false;
  }

  const horizSpeed = Math.hypot(state.vx, state.vz);
  state.gaitDist += horizSpeed * dt;

  // Lower-body chassis orients along WASD movement vector when running; upper body aims independently via IK!
  const desiredYaw = horizSpeed > 1.05 ? Math.atan2(state.vz, state.vx) : state.aimYaw;
  let yawDiff = desiredYaw - state.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
  state.yaw += yawDiff * (1 - Math.exp(-10 * dt));

  // Tactical slide-dash & strafe body banking roll angle (deep lean on Shift dodge!)
  const latVel = state.vx * rightX + state.vz * rightZ;
  const targetBank =
    state.dashTimer > 0
      ? Math.max(-0.46, Math.min(0.46, (Math.abs(latVel) > 1.5 ? Math.sign(latVel) : 1) * 0.42))
      : Math.max(-0.16, Math.min(0.16, latVel * 0.012));
  state.dodgeBankRad += (targetBank - state.dodgeBankRad) * (1 - Math.exp(-14 * dt));

  // 2A. Allied Wingman Go2 Tactical Command [Q / Middle Mouse] -> Left-Arm Point + High-Speed Leap Pounce!
  state.wingman.commandCooldown = Math.max(0, state.wingman.commandCooldown - dt);
  if (input.wingmanCommandJustPressed && state.wingman.commandCooldown <= 0) {
    // Pick enemy closest to player's aim ray / reticle point, or Boss / nearest live enemy
    let bestEnemy: CombatEnemyEntity | null = null;
    let bestScoreDist = Infinity;
    const refX = input.aimWorldPoint ? input.aimWorldPoint[0] : state.x + fwdX * 18;
    const refZ = input.aimWorldPoint ? input.aimWorldPoint[2] : state.z + fwdZ * 18;
    for (const e of state.enemies) {
      if (e.koTimer > 0) continue;
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
    if (bestEnemy) {
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
  if (input.empJustPressed && state.empCooldown <= 0) {
    state.empCooldown = 7.5;
    state.empWaveTimer = 0.65;
    state.heavyPostureTimer = 0.35;
    state.empWaveOrigin = [state.x, state.y + 0.5, state.z];
    state.shield = Math.min(state.maxShield, state.shield + 48);
    state.events.bossCue = 'emp_nova';
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.3);

    // Intercept enemy missiles & stagger nearby enemies within 12.5m!
    for (const p of state.projectiles) {
      if (p.active && !p.fromPlayer) {
        if (Math.hypot(p.x - state.x, p.z - state.z) <= 13.5) {
          p.active = false;
        }
      }
    }
    for (const e of state.enemies) {
      if (e.koTimer <= 0 && Math.hypot(e.x - state.x, e.z - state.z) <= 12.5) {
        damageEnemyEntity(state, e, 48, 52, 'EMP 脉冲新星', [e.x, e.y + 0.9, e.z], 1.6);
      }
    }
  }

  if (input.ultimateJustPressed && state.ultimateCharge >= 100) {
    state.ultimateCharge = 0;
    state.heavyPostureTimer = 0.35;
    // Target Boss or closest enemy, or aim point
    let tx = state.x + fwdX * 22;
    let tz = state.z + fwdZ * 22;
    const priorityEnemy =
      state.enemies.find((e) => e.isBoss && e.koTimer <= 0) ||
      state.enemies.find((e) => e.koTimer <= 0);
    if (priorityEnemy) {
      tx = priorityEnemy.x;
      tz = priorityEnemy.z;
    } else if (input.aimWorldPoint) {
      tx = input.aimWorldPoint[0];
      tz = input.aimWorldPoint[2];
    }
    const ty = sampleLandTerrainHeight(tx, tz);
    state.ultimateBeamTimer = 1.65;
    state.ultimateBeamTarget = [tx, ty, tz];
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.65);
    state.events.firedWeapon = 'orbital_ion';
    state.events.explosions.push({ x: tx, y: ty + 1.0, z: tz, scale: 3.8, colorHex: '#00e5ff' });

    for (const e of state.enemies) {
      if (e.koTimer <= 0 && Math.hypot(e.x - tx, e.z - tz) <= 9.5) {
        damageEnemyEntity(state, e, 360, 145, '天基歼星离子炮', [e.x, e.y + 1.2, e.z], 2.0);
      }
    }
  }

  // 3. Player Primary Weapon Fire (LMB) & Quick Homing Missile Salvo (RMB / F) — 100% True Muzzle World Pos!
  const fireMissileSalvo = input.missileJustPressed;
  const effectiveMuzzle: [number, number, number] = input.muzzleWorldPoint
    ? input.muzzleWorldPoint
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
    state.muzzleFlashTimer = wSpec.id === 'railgun' ? 0.085 : 0.052;

    // Inject spring gun recoil impulse (~80ms shoulder/elbow/torso kickback) + 0.35s Heavy Skill Stance!
    if (wSpec.id === 'railgun') {
      state.recoilVel += 8.8;
      state.heavyPostureTimer = 0.35;
    } else if (wSpec.id === 'missile_pod') {
      state.recoilVel += 6.2;
      state.heavyPostureTimer = 0.35;
    } else {
      state.recoilVel += 3.9;
    }

    const muzzleX = effectiveMuzzle[0];
    const muzzleY = effectiveMuzzle[1];
    const muzzleZ = effectiveMuzzle[2];

    state.events.ejectedShell = {
      x: muzzleX - fwdX * 0.28 + rightX * 0.08,
      y: muzzleY + 0.04,
      z: muzzleZ - fwdZ * 0.28 + rightZ * 0.08,
      rightX,
      rightZ,
      isHeavy: wSpec.id !== 'pulse_rifle'
    };

    // Determine exact 3D ballistic vector from true Muzzle World Pos to 3D Reticle Aim Point
    let dirX = Math.cos(state.aimPitch) * Math.cos(state.aimYaw);
    let dirY = Math.sin(state.aimPitch);
    let dirZ = Math.cos(state.aimPitch) * Math.sin(state.aimYaw);
    if (input.aimWorldPoint) {
      const dx = input.aimWorldPoint[0] - muzzleX;
      const dy = input.aimWorldPoint[1] - muzzleY;
      const dz = input.aimWorldPoint[2] - muzzleZ;
      const dLen = Math.hypot(dx, dy, dz);
      if (dLen > 0.6) {
        dirX = dx / dLen;
        dirY = dy / dLen;
        dirZ = dz / dLen;
      }
    }

    if (wSpec.id === 'missile_pod') {
      const liveTargets = state.enemies.filter((e) => e.koTimer <= 0);
      for (let m = 0; m < 4; m++) {
        const proj = allocProjectile(state);
        if (!proj) break;
        const fanAng = (m - 1.5) * 0.22;
        const cosF = Math.cos(fanAng);
        const sinF = Math.sin(fanAng);
        const vxDir = dirX * cosF - dirZ * sinF;
        const vzDir = dirX * sinF + dirZ * cosF;
        const lockEnemy = liveTargets.length > 0 ? liveTargets[m % liveTargets.length] : null;
        proj.active = true;
        proj.fromPlayer = true;
        proj.kind = 'missile';
        proj.x = muzzleX;
        proj.y = muzzleY + 0.06;
        proj.z = muzzleZ;
        proj.vx = vxDir * wSpec.projectileSpeed;
        proj.vy = (dirY + 0.22) * wSpec.projectileSpeed;
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
        proj.kind = wSpec.id === 'railgun' ? 'rail' : 'pulse';
        proj.x = muzzleX;
        proj.y = muzzleY;
        proj.z = muzzleZ;
        proj.vx = sx * inv * wSpec.projectileSpeed;
        proj.vy = sy * inv * wSpec.projectileSpeed;
        proj.vz = sz * inv * wSpec.projectileSpeed;
        proj.damage = wSpec.damage;
        proj.staggerDamage = wSpec.staggerDamage;
        proj.life = 1.6;
        proj.maxLife = 1.6;
        proj.homingTargetUid = null;
        proj.sourceX = state.x;
        proj.sourceZ = state.z;
      }
      state.spreadBloom = Math.min(0.045, state.spreadBloom + (wSpec.id === 'railgun' ? 0.02 : 0.006));
      if (wSpec.id === 'railgun') {
        state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.24);
      }
    }
  }

  // 4. Random Wave Spawner & Boss Escalation
  const activeVanguardCount = state.enemies.filter((e) => !e.isBoss && e.koTimer <= 0).length;
  if (!state.bossSpawned) {
    if (state.kills >= state.vanguardKillsTarget) {
      state.wave = 2;
      summonAresBoss(state);
    } else {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && activeVanguardCount < 5) {
        state.spawnTimer = 3.8;
        spawnRandomEnemyWave(state, activeVanguardCount < 2 ? 2 : 1);
      }
    }
  } else if (!state.bossDefeated) {
    // Keep 1-2 escort scouts spawning periodically during Boss Raid for ammo/repair core drops!
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

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.ghostHp += (e.hp - e.ghostHp) * Math.min(1, dt * 4.5);
    if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
    if (e.shieldRippleTimer > 0) e.shieldRippleTimer = Math.max(0, e.shieldRippleTimer - dt);
    if (e.shieldShatterTimer > 0) e.shieldShatterTimer = Math.max(0, e.shieldShatterTimer - dt);
    if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

    // Step physical spring hit-stagger tilt (omega_n = 18 rad/s, zeta = 0.55)
    const accP = -324 * e.hitTiltPitch - 19.8 * e.hitTiltVelP;
    const accR = -324 * e.hitTiltRoll - 19.8 * e.hitTiltVelR;
    e.hitTiltVelP += accP * dt;
    e.hitTiltVelR += accR * dt;
    e.hitTiltPitch = Math.max(-0.42, Math.min(0.42, e.hitTiltPitch + e.hitTiltVelP * dt));
    e.hitTiltRoll = Math.max(-0.42, Math.min(0.42, e.hitTiltRoll + e.hitTiltVelR * dt));

    if (e.koTimer > 0) {
      e.koTimer -= dt;
      if (e.koTimer <= 0) {
        state.enemies.splice(i, 1);
      }
      continue;
    }

    // Orbital drop-pod entry (0.45s snappy Titanfall slam)
    if (e.dropPodProgress < 1) {
      e.dropPodProgress = Math.min(1, e.dropPodProgress + dt / 0.45);
      continue;
    }

    // Shield-Break Paralysis / Mini-Stun window!
    if (e.shieldBreakStunTimer > 0) {
      e.shieldBreakStunTimer = Math.max(0, e.shieldBreakStunTimer - dt);
      e.vx *= 0.8;
      e.vz *= 0.8;
      e.x += e.vx * dt;
      e.z += e.vz * dt;
      continue;
    }

    // ACS Staggered punish window
    if (e.staggeredTimer > 0) {
      e.staggeredTimer -= dt;
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

    if (e.isBoss) {
      // ARES-09 TITAN BOSS AI & 3 SIGNATURE TELEGRAPHED ATTACKS
      const speedMult = (e.bossPhase === 2 ? 1.28 : 1.0) * slowMult;
      if (e.attackPhase === 'idle') {
        if (distP > 18) {
          e.vx = dirPX * spec.speed * speedMult;
          e.vz = dirPZ * spec.speed * speedMult;
        } else {
          // Slow tactical orbit around player
          e.vx = (-dirPZ * e.strafeSign * 0.75 + (distP < 11 ? -dirPX * 0.4 : 0)) * spec.speed;
          e.vz = (dirPX * e.strafeSign * 0.75 + (distP < 11 ? -dirPZ * 0.4 : 0)) * spec.speed;
        }
        e.yaw = Math.atan2(dzP, dxP);
        e.aiCooldown -= dt * speedMult;

        if (e.aiCooldown <= 0) {
          const cycle: BossAttackKind[] = ['balteus_salvo', 'coral_laser_sweep', 'orbital_pillars'];
          const nextIdx = (e.uid + Math.floor(state.elapsedPlaySec * 0.7)) % cycle.length;
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
                y: sampleLandTerrainHeight(hx, hz),
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
        e.vx *= 0.85;
        e.vz *= 0.85;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'active';
          if (e.bossAttackKind === 'balteus_salvo') {
            // Fire 12-16 curved Balteus ring missiles!
            const count = e.bossPhase === 2 ? 14 : 10;
            for (let m = 0; m < count; m++) {
              const p = allocProjectile(state);
              if (!p) break;
              const ringAng = (m / count) * Math.PI * 2;
              p.active = true;
              p.fromPlayer = false;
              p.kind = 'boss_missile';
              p.x = e.x + Math.cos(ringAng) * 1.6;
              p.y = e.y + 2.8;
              p.z = e.z + Math.sin(ringAng) * 1.6;
              p.vx = Math.cos(ringAng) * 14 + dirPX * 10;
              p.vy = 11.5 + (m % 3) * 2.2;
              p.vz = Math.sin(ringAng) * 14 + dirPZ * 10;
              p.damage = 16;
              p.staggerDamage = 0;
              p.life = 3.2;
              p.maxLife = 3.2;
              p.homingTargetUid = -1; // Homes onto player gently during first 1.2s
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
          // Check beam intersection against player (jumping > 1.35m clears ground sweep!)
          const lx = Math.cos(e.laserSweepCurrentYaw);
          const lz = Math.sin(e.laserSweepCurrentYaw);
          const projDist = (state.x - e.x) * lx + (state.z - e.z) * lz;
          if (projDist > 1.5 && projDist < 38) {
            const perpDist = Math.abs((state.x - e.x) * -lz + (state.z - e.z) * lx);
            const playerClearance = state.y - sampleLandTerrainHeight(state.x, state.z);
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
          e.bossAttackKind = 'none';
          e.aiCooldown = e.bossPhase === 2 ? 1.55 : 2.25;
        }
      }
    } else if (e.archetype === 'go2_hound') {
      // POLICY 1: Fast Flanker & Telegraphed Pounce Charger
      if (e.attackPhase === 'idle') {
        const flankAng = Math.atan2(dzP, dxP) + (distP > 9 ? e.strafeSign * 0.48 : 0);
        e.vx = Math.cos(flankAng) * spec.speed;
        e.vz = Math.sin(flankAng) * spec.speed;
        e.yaw = flankAng;
        e.aiCooldown -= dt;
        if (distP < 11.5 && e.aiCooldown <= 0 && activeCrowdAttackers < 3) {
          e.attackPhase = 'windup';
          e.phaseTimer = 0.48; // 0.48s visible crouch & laser line telegraph
          e.telegraphTargetX = state.x;
          e.telegraphTargetZ = state.z;
          activeCrowdAttackers++;
        }
      } else if (e.attackPhase === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.yaw = Math.atan2(e.telegraphTargetZ - e.z, e.telegraphTargetX - e.x);
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
        e.vx *= 0.82;
        e.vz *= 0.82;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.1;
        }
      }
    } else if (e.archetype === 'g1_vanguard') {
      // POLICY 2: Mid-Range Tactical Strafe Marksman
      const idealDist = 17.5;
      const radialPush = distP > idealDist + 2 ? 0.75 : distP < idealDist - 3 ? -0.65 : 0;
      e.vx = (dirPX * radialPush - dirPZ * e.strafeSign * 0.85) * spec.speed;
      e.vz = (dirPZ * radialPush + dirPX * e.strafeSign * 0.85) * spec.speed;
      e.yaw = Math.atan2(dzP, dxP);
      e.aiCooldown -= dt;

      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 3 && distP < 36) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.42;
        activeCrowdAttackers++;
      } else if (e.attackPhase === 'windup') {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackPhase = 'idle';
          e.aiCooldown = 2.4;
          const p = allocProjectile(state);
          if (p) {
            p.active = true;
            p.fromPlayer = false;
            p.kind = 'enemy_plasma';
            p.x = e.x + dirPX * 0.8;
            p.y = e.y + 1.25;
            p.z = e.z + dirPZ * 0.8;
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
      }
    } else if (e.archetype === 'sar_siege') {
      // POLICY 3: Armored Area-Denial Mortar Tank (Projects Ground AoE Telegraph Ring)
      const moveScale = distP > 22 ? 1 : distP < 12 ? -0.5 : 0.15;
      e.vx = dirPX * spec.speed * moveScale;
      e.vz = dirPZ * spec.speed * moveScale;
      e.yaw = Math.atan2(dzP, dxP);
      e.aiCooldown -= dt;

      if (e.attackPhase === 'idle' && e.aiCooldown <= 0 && activeCrowdAttackers < 3) {
        e.attackPhase = 'windup';
        e.phaseTimer = 0.35;
        activeCrowdAttackers++;
        const tx = state.x + state.vx * 0.45;
        const tz = state.z + state.vz * 0.45;
        state.hazards.push({
          id: state.nextUid++,
          x: tx,
          y: sampleLandTerrainHeight(tx, tz),
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
    } else {
      // POLICY 4: Aerial Orbiting Sky-Hunter Drone
      const orbitAng = Math.atan2(dzP, dxP) + e.strafeSign * 1.15;
      e.vx = Math.cos(orbitAng) * spec.speed;
      e.vz = Math.sin(orbitAng) * spec.speed;
      e.yaw = Math.atan2(dzP, dxP);
      e.aiCooldown -= dt;
      if (e.aiCooldown <= 0 && activeCrowdAttackers < 3) {
        e.aiCooldown = 2.7;
        const p = allocProjectile(state);
        if (p) {
          p.active = true;
          p.fromPlayer = false;
          p.kind = 'enemy_plasma';
          p.x = e.x;
          p.y = e.y;
          p.z = e.z;
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

    // Integrate enemy kinematics & ground/air height conformance
    const moveSlow = e.isBoss ? 1.0 : slowMult;
    e.x += e.vx * moveSlow * dt;
    e.z += e.vz * moveSlow * dt;
    const er = Math.hypot(e.x, e.z);
    if (er > ARENA_RADIUS - 2) {
      const s = (ARENA_RADIUS - 2) / er;
      e.x *= s;
      e.z *= s;
    }
    const gY = sampleLandTerrainHeight(e.x, e.z);
    e.y = e.archetype === 'aero_hunter' ? gY + 6.4 + Math.sin(state.elapsedPlaySec * 2.4 + e.uid) * 0.45 : gY;
    e.gaitDist += Math.hypot(e.vx * moveSlow, e.vz * moveSlow) * dt;
  }

  // 5B. Step Allied Wingman Go2 Companion (Escort Flank -> High-Speed Leap Pounce -> Electromagnetic Bite Slashes!)
  stepWingmanGo2Companion(state, dt, fwdX, fwdZ, rightX, rightZ);

  // 5C. Soft Sphere Separation Collision (prevents dogs/robots/Boss from walking through player legs or clipping!)
  resolveCombatSoftCollisions(state);

  // 6. Step Projectiles & Collision Detection
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }

    // Homing guidance
    if (p.kind === 'missile' && p.homingTargetUid !== null) {
      const tgt = state.enemies.find((e) => e.uid === p.homingTargetUid && e.koTimer <= 0);
      if (tgt) {
        const tx = tgt.x - p.x;
        const ty = tgt.y + (tgt.isBoss ? 1.8 : 0.9) - p.y;
        const tz = tgt.z - p.z;
        const d = Math.max(0.1, Math.hypot(tx, ty, tz));
        const spd = 40;
        p.vx += ((tx / d) * spd - p.vx) * Math.min(1, dt * 7.5);
        p.vy += ((ty / d) * spd - p.vy) * Math.min(1, dt * 7.5);
        p.vz += ((tz / d) * spd - p.vz) * Math.min(1, dt * 7.5);
      }
    } else if (p.kind === 'boss_missile' && p.maxLife - p.life < 1.35) {
      // Boss homing salvo curves toward player only during initial boost so quick-boost dash can out-turn them!
      const tx = state.x - p.x;
      const ty = state.y + 0.9 - p.y;
      const tz = state.z - p.z;
      const d = Math.max(0.1, Math.hypot(tx, ty, tz));
      const spd = 24;
      p.vx += ((tx / d) * spd - p.vx) * Math.min(1, dt * 3.8);
      p.vy += ((ty / d) * spd - p.vy) * Math.min(1, dt * 3.8);
      p.vz += ((tz / d) * spd - p.vz) * Math.min(1, dt * 3.8);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    const terrainY = sampleLandTerrainHeight(p.x, p.z);
    if (p.y <= terrainY) {
      p.active = false;
      if (p.kind === 'missile' || p.kind === 'boss_missile') {
        state.events.explosions.push({
          x: p.x,
          y: terrainY + 0.25,
          z: p.z,
          scale: 0.95,
          colorHex: p.fromPlayer ? '#fb7185' : '#f97316'
        });
      }
      continue;
    }

    if (p.fromPlayer) {
      for (const e of state.enemies) {
        if (e.koTimer > 0 || e.dropPodProgress < 0.7) continue;
        const spec = ENEMY_ARCHETYPE_SPECS[e.archetype];
        const centerY = e.y + (e.isBoss ? 1.85 : e.archetype === 'aero_hunter' ? 0 : 0.95);
        const dHit = Math.hypot(p.x - e.x, (p.y - centerY) * 0.8, p.z - e.z);
        if (dHit <= spec.hitRadius + (p.kind === 'rail' ? 0.35 : 0.15)) {
          const wName =
            p.kind === 'rail' ? '超导磁轨炮' : p.kind === 'missile' ? '蜂群追踪导弹' : '高频脉冲步枪';
          damageEnemyEntity(
            state,
            e,
            p.damage,
            p.staggerDamage,
            wName,
            [p.x, p.y, p.z],
            p.kind === 'pulse' ? 1.35 : 1.0
          );
          if (p.kind !== 'rail') {
            p.active = false;
          } else {
            p.damage *= 0.65; // Railgun pierces!
          }
          break;
        }
      }
    } else {
      const dPlayer = Math.hypot(p.x - state.x, (p.y - (state.y + 1.0)) * 0.85, p.z - state.z);
      if (dPlayer <= 1.15) {
        p.active = false;
        applyDamageToPlayer(state, p.damage, p.sourceX, p.sourceZ);
      }
    }
  }

  // 7. Step Ground AoE Telegraph Hazards
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    if (!h.detonated) {
      h.elapsed += dt;
      if (h.elapsed >= h.windupDuration) {
        h.detonated = true;
        state.events.explosions.push({
          x: h.x,
          y: h.y + 0.35,
          z: h.z,
          scale: h.kind === 'boss_phase_nova' ? 3.2 : 1.75,
          colorHex: h.kind === 'orbital_pillar' ? '#00e5ff' : '#ff2a55'
        });
        const dist = Math.hypot(state.x - h.x, state.z - h.z);
        if (dist <= h.radius) {
          applyDamageToPlayer(state, h.damage, h.x, h.z);
        }
      }
    } else {
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
      pk.y = sampleLandTerrainHeight(pk.x, pk.z) + 0.6;
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

/**
 * Steps the allied Unitree Go2 Wingman companion:
 * - 'escort': flanks player's left-rear sector, autonomously nipping enemies within 8.5m
 * - 'pounce_leap': high-speed parabolic leap onto commanded target ([Q] / Middle Click)
 * - 'bite_slash': rapid electromagnetic bite slashes (3.2x shield strip + slow + stagger)
 */
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
      const found = state.enemies.find((e) => e.uid === w.targetUid && e.koTimer <= 0);
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
      // Parabolic jump arc over terrain
      const prog = 1 - Math.max(0, Math.min(1, w.modeTimer / 0.52));
      const baseH = sampleLandTerrainHeight(w.x, w.z);
      w.y = baseH + Math.sin(prog * Math.PI) * 2.15;
      w.gaitDist += leapSpeed * 0.65 * dt;

      const hitR = ENEMY_ARCHETYPE_SPECS[tgt.archetype].hitRadius + 0.9;
      if (dist <= hitR || w.modeTimer <= 0) {
        w.mode = 'bite_slash';
        w.modeTimer = 0.86;
        w.biteTickTimer = 0;
        w.y = sampleLandTerrainHeight(w.x, w.z);
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
      const latchDist = Math.max(1.05, ENEMY_ARCHETYPE_SPECS[tgt.archetype].hitRadius * 0.82);
      w.x = tgt.x + Math.cos(orbitAng) * latchDist;
      w.z = tgt.z + Math.sin(orbitAng) * latchDist;
      w.y = sampleLandTerrainHeight(w.x, w.z) + (tgt.archetype === 'aero_hunter' ? 2.4 : 0.25);
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
          3.2
        );
      }
      return;
    }
  }

  // Default 'escort' mode: stay on right-forward tactical flank (visible in midfield, never blocking camera)
  const escortX = state.x + fwdX * 2.15 + rightX * 2.35;
  const escortZ = state.z + fwdZ * 2.15 + rightZ * 2.35;
  const dxE = escortX - w.x;
  const dzE = escortZ - w.z;
  const distE = Math.hypot(dxE, dzE);

  if (distE > 0.25) {
    const desiredSpd = Math.min(18.5, distE * 5.2 + 2.2);
    w.vx += ((dxE / distE) * desiredSpd - w.vx) * Math.min(1, dt * 9);
    w.vz += ((dzE / distE) * desiredSpd - w.vz) * Math.min(1, dt * 9);
    w.yaw = Math.atan2(w.vz, w.vx);
  } else {
    w.vx *= 0.8;
    w.vz *= 0.8;
    w.yaw = state.aimYaw;
  }

  w.x += w.vx * dt;
  w.z += w.vz * dt;
  w.y = sampleLandTerrainHeight(w.x, w.z);
  w.gaitDist += Math.hypot(w.vx, w.vz) * dt;

  // Autonomous close-defense bite if an enemy rushes within 6.2m of Wingman
  w.biteTickTimer = Math.max(0, w.biteTickTimer - dt);
  if (w.biteTickTimer <= 0) {
    for (const e of state.enemies) {
      if (e.koTimer > 0 || e.dropPodProgress < 0.85 || e.archetype === 'aero_hunter') continue;
      const d = Math.hypot(e.x - w.x, e.z - w.z);
      if (d < 5.6) {
        w.biteTickTimer = 1.15;
        w.slashFlashTimer = 0.14;
        e.slowTimer = Math.max(e.slowTimer, 1.8);
        damageEnemyEntity(state, e, 18, 10, '僚机Go2护卫撕咬', [e.x, e.y + 0.7, e.z], 2.4);
        break;
      }
    }
  }
}

/**
 * Pairwise soft-sphere collision separation across Player, Wingman Go2, and grounded Enemies/Boss.
 * Prevents hounds or humanoid enemies from walking through player legs or stacking inside one another.
 */
export function resolveCombatSoftCollisions(state: MarsCombatWorldState): void {
  const playerR = 0.96;
  const wingmanR = 0.72;

  // 1. Player <-> Wingman separation (keep escort from clipping player legs)
  if (state.wingman.mode === 'escort') {
    const dx = state.wingman.x - state.x;
    const dz = state.wingman.z - state.z;
    const minD = playerR + wingmanR;
    const d = Math.hypot(dx, dz);
    if (d < minD) {
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      const push = minD - d;
      state.wingman.x += nx * push;
      state.wingman.z += nz * push;
      state.wingman.y = sampleLandTerrainHeight(state.wingman.x, state.wingman.z);
    }
  }

  // 2. Player <-> Grounded Enemies & Boss separation
  for (let i = 0; i < state.enemies.length; i++) {
    const a = state.enemies[i];
    if (a.koTimer > 0 || a.dropPodProgress < 0.75 || a.archetype === 'aero_hunter') continue;
    const rA = a.isBoss ? 2.65 : ENEMY_ARCHETYPE_SPECS[a.archetype].hitRadius * 0.88;

    // Separate Enemy A from Player (unless player is high above enemy during jump)
    const verticalGap = state.y - a.y;
    if (verticalGap < 1.65) {
      const dxP = a.x - state.x;
      const dzP = a.z - state.z;
      const minDP = playerR + rA;
      const dP = Math.hypot(dxP, dzP);
      if (dP < minDP) {
        const nx = dP > 1e-4 ? dxP / dP : Math.cos(a.uid * 1.7);
        const nz = dP > 1e-4 ? dzP / dP : Math.sin(a.uid * 1.7);
        const overlap = minDP - dP;
        if (a.isBoss) {
          // Boss has heavy mass -> pushes player outward predominantly
          state.x -= nx * overlap * 0.82;
          state.z -= nz * overlap * 0.82;
          a.x += nx * overlap * 0.18;
          a.z += nz * overlap * 0.18;
        } else {
          state.x -= nx * overlap * 0.28;
          state.z -= nz * overlap * 0.28;
          a.x += nx * overlap * 0.72;
          a.z += nz * overlap * 0.72;
        }
      }
    }

    // 3. Enemy A <-> Enemy B pairwise separation
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
      }
    }
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

  if (mechId === 'unitree_g1') {
    // 1. LOWER BODY: WASD stride + 0.35s Heavy Skill Wide Horse-Stance Crouch!
    if (n.includes('hip_roll')) {
      const sideSign = n.includes('left') ? 1 : -1;
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.65) + sideSign * 0.24 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('hip_pitch')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.55) - 0.42 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('knee')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.5) + 0.78 * heavy01, limitLower, limitUpper);
    }
    if (n.includes('ankle_pitch')) {
      return clampJointLimit(baseGaitAngle * (1 - heavy01 * 0.5) - 0.36 * heavy01, limitLower, limitUpper);
    }

    // 2. WAIST / TORSO: Real-time 3D Aiming Yaw + Pitch + 12° Braced Lean-Back + Gun Recoil Kick!
    // Note: URDF +Z maps to Three.js +Y while playerRoot uses rotation.y = -yaw, so -relAimYaw turns toward aimYaw!
    if (n.includes('waist_yaw') || n.includes('torso_yaw')) {
      return clampJointLimit(-relAimYaw * 0.78, limitLower, limitUpper);
    }
    if (n.includes('waist_pitch') || n.includes('torso_pitch')) {
      // Negative pitch around +Y in G1 URDF leans upper torso backward (12 deg = 0.21 rad on heavy skill!)
      const targetPitch = -clampedPitch * 0.38 - leanBack12Deg - recoilPos * 0.16;
      return clampJointLimit(targetPitch, limitLower, limitUpper);
    }
    if (n.includes('waist_roll') || n.includes('torso_roll')) {
      return clampJointLimit(-relAimYaw * 0.12, limitLower, limitUpper);
    }

    // 3. HEAD / LIDAR GAZE: Locks onto reticle target
    if (n.includes('head_yaw')) {
      return clampJointLimit(-relAimYaw * 0.42, limitLower, limitUpper);
    }
    if (n.includes('head_pitch')) {
      return clampJointLimit(-clampedPitch * 0.55, limitLower, limitUpper);
    }

    // 4. RIGHT ARM: Raised Shoulder-Braced Pulse Rifle Aiming + 80ms Muzzle Rise Recoil + Heavy Straight-Arm Cannon Extension!
    // In G1 URDF zero pose, upper arm points -Z (down) while forearm (right_elbow_link) ALREADY points +X (forward)!
    // Thus shoulder_pitch + elbow_pitch = -aimPitch keeps the forearm & rifle barrel pointing dead-on at aimPitch!
    if (n.includes('right_shoulder_pitch')) {
      const baseAim = -0.62 - clampedPitch * 0.52;
      const heavyStraight = -1.42 - clampedPitch * 0.82;
      const blended = baseAim * (1 - heavy01) + heavyStraight * heavy01;
      const recoilRise = -recoilPos * 0.24; // Muzzle jumps upward & kicks shoulder
      return clampJointLimit(blended + recoilRise, limitLower, limitUpper);
    }
    if (n.includes('right_shoulder_roll')) {
      return clampJointLimit(-0.12 * (1 - heavy01) - relAimYaw * 0.16, limitLower, limitUpper);
    }
    if (n.includes('right_shoulder_yaw')) {
      return clampJointLimit(-relAimYaw * 0.24, limitLower, limitUpper);
    }
    if (n.includes('right_elbow')) {
      // Balances shoulder_pitch so forearm +X points horizontally along aimPitch; extends to +1.42 on heavy straight-arm cannon!
      const baseElbow = 0.62 - clampedPitch * 0.48;
      const heavyElbow = 1.42 - clampedPitch * 0.18;
      const elbowBlended = baseElbow * (1 - heavy01) + heavyElbow * heavy01 - recoilPos * 0.18;
      return clampJointLimit(elbowBlended, limitLower, limitUpper);
    }
    if (n.includes('right_wrist_pitch')) {
      return clampJointLimit(-recoilPos * 0.22, limitLower, limitUpper);
    }

    // 5. LEFT ARM: Tactical Foregrip Support OR [Q] Wingman Pointing Gesture OR Dual-Palm Heavy Skill Push!
    if (n.includes('left_shoulder_pitch')) {
      const foregripSupport = -0.66 - clampedPitch * 0.5 - recoilPos * 0.14;
      const commandPoint = -1.46 - clampedPitch * 0.82; // Crisp straight-arm forward tactical point!
      const heavyDualPush = -1.38 - clampedPitch * 0.8;
      const activePose =
        cmd01 > 0.01
          ? foregripSupport * (1 - cmd01) + commandPoint * cmd01
          : foregripSupport * (1 - heavy01) + heavyDualPush * heavy01;
      return clampJointLimit(activePose, limitLower, limitUpper);
    }
    if (n.includes('left_shoulder_roll')) {
      // Negative roll brings left arm inward across chest to grip rifle forend; opens forward on [Q] / Heavy!
      const crossInward = -0.44 * (1 - Math.max(cmd01, heavy01)) + 0.08 * cmd01;
      return clampJointLimit(crossInward, limitLower, limitUpper);
    }
    if (n.includes('left_shoulder_yaw')) {
      return clampJointLimit(-0.48 * (1 - Math.max(cmd01, heavy01)) - relAimYaw * 0.2, limitLower, limitUpper);
    }
    if (n.includes('left_elbow')) {
      const supportBend = 0.52 - clampedPitch * 0.45;
      const straightExtend = 1.42 - clampedPitch * 0.18;
      const activeBend =
        supportBend * (1 - Math.max(cmd01, heavy01)) + straightExtend * Math.max(cmd01, heavy01);
      return clampJointLimit(activeBend, limitLower, limitUpper);
    }
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
  if (mechId === 'unitree_go2' && (n.includes('thigh') || n.includes('calf'))) {
    // Go2 crouches into braced predator stance on heavy weapon fire!
    const crouchDelta = n.includes('thigh') ? 0.26 * heavy01 : -0.48 * heavy01;
    return clampJointLimit(baseGaitAngle + crouchDelta, limitLower, limitUpper);
  }

  return clampJointLimit(baseGaitAngle, limitLower, limitUpper);
}

