import { UrdfJointDef } from './manifestUtils';

export type SandboxDomain = 'land' | 'sea' | 'air';
export type SandboxCamMode = 'chase' | 'fpv';

export interface SandboxActorSpec {
  id: string;
  name: string;
  shortName: string;
  domain: SandboxDomain;
  domainBadge: string;
  glbUrls: string[]; // Single GLB or [L1, L2, L3] multi-GLB assembly
  urdfUrl?: string;
  /** Offset rad added to heading so the real GLB's nose faces +Forward direction */
  modelYawOffset: number;
  cruiseSpeed: number;
  boostSpeed: number;
  turnRate: number;
  groundClearanceOffset: number;
  fireActionTitle: string;
  fireActionDesc: string;
}

export interface SandboxWaypoint {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  targetRockOffset: [number, number, number];
}

export interface SandboxInputState {
  forward: boolean;  // W / ArrowUp
  backward: boolean; // S / ArrowDown (or Reverser Brake in Air)
  left: boolean;     // A / ArrowLeft
  right: boolean;    // D / ArrowRight
  up: boolean;       // Space (Jump on Land, Ascend in Sea/Air)
  down: boolean;     // C (Crouch/Descend in Sea/Air)
  sprint: boolean;   // Shift (Sprint / Boost / Afterburner)
}

export interface SandboxKinematicState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;       // World heading (0 = +X, PI/2 = +Z)
  pitch: number;     // Terrain slope or flight/dive pitch
  roll: number;      // Terrain roll or turn banking roll
  speed: number;     // Horizontal/3D scalar speed (m/s)
  turnVel: number;   // Angular yaw velocity (rad/s)
  gaitDistance: number; // Accumulated distance for skating-free walk/wheel cycles
  isGrounded: boolean;
  isBoosting: boolean;
  isBrakingReverse: boolean;
  reverserStroke: number; // 0..1 for CFM56 C-duct sleeves
  throttlePct: number;    // 0..100 HUD readout
  machNumber: number;     // For Air arena HUD
  depthMeters: number;    // For Sea arena HUD
  trauma: number;         // 0..1 decaying camera shake trauma
  // Autonomous Patrol Director (Key P)
  autoPatrol: boolean;
  activeWaypointIdx: number;
  waypointHoldTimer: number;
  // Event flags emitted during step for VFX & WebAudio triggers
  emittedAutoScan: boolean;
  emittedAutoFire: boolean;
  emittedFootstep: boolean;
}

export const SANDBOX_ACTORS: SandboxActorSpec[] = [
  {
    id: 'sar',
    name: '履带越障搜救机器人 (SAR + AR4)',
    shortName: 'SAR 履带搜救车',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/search_and_rescue_tracked_robot.glb'],
    urdfUrl: '/baselines/01-履带越障搜救机器人/Search-and-Rescue-Robot/urdf/sar_urdf.urdf',
    modelYawOffset: Math.PI / 2,
    cruiseSpeed: 5.8,
    boostSpeed: 10.5,
    turnRate: 2.1,
    groundClearanceOffset: 0.0,
    fireActionTitle: '脉冲破岩激光 + 侦察无人机弹射',
    fireActionDesc: '锁定前方障碍发射高能破拆激光，车背同步垂直弹射弧形尾迹微型侦察机'
  },
  {
    id: 'unitree_go2',
    name: '宇树四足机器狗 (Unitree Go2)',
    shortName: 'Go2 四足机器狗',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/unitree_go2_quadruped.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/go2_description/urdf/go2_description.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 6.8,
    boostSpeed: 12.6,
    turnRate: 2.6,
    groundClearanceOffset: 0.0,
    fireActionTitle: '高机动腾空前跃冲刺 + 震地脉冲',
    fireActionDesc: '四足蓄力蹬地腾空飞跃冲刺，落地释放环形高能电磁冲击波'
  },
  {
    id: 'unitree_g1',
    name: '宇树双足人形机器人 (Unitree G1)',
    shortName: 'G1 双足具身人形',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/unitree_g1_humanoid.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/g1_description/g1_29dof_with_hand_rev_1_0.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 5.5,
    boostSpeed: 9.8,
    turnRate: 2.4,
    groundClearanceOffset: 0.0,
    fireActionTitle: '战术挥臂 + 全息电磁脉冲波 (EMP)',
    fireActionDesc: '双臂战术展开蓄能，向前释放穿透地形的全息电弧脉冲与无人机信标'
  },
  {
    id: 'mars2020',
    name: 'NASA 毅力号火星车 (Perseverance)',
    shortName: '毅力号火星车',
    domain: 'land',
    domainBadge: '火星杰泽罗赤红戈壁',
    glbUrls: [
      '/robotics_glb/mars2020_mobility_drive.glb',
      '/twins/models/L2_turret_mast_robotics.glb',
      '/twins/models/L3_chassis_mmrtg_lab.glb'
    ],
    modelYawOffset: Math.PI / 2,
    cruiseSpeed: 5.2,
    boostSpeed: 9.2,
    turnRate: 1.75,
    groundClearanceOffset: 0.0,
    fireActionTitle: 'SuperCam 破岩激光 + 机智号侦察弹射',
    fireActionDesc: 'Mastcam-Z 锁定前方岩体击发 LIBS 高能脉冲激光，背部弹射微型旋翼侦察器'
  },
  {
    id: 'bluerov2',
    name: '水下推进机器人 (BlueROV2 + Ping360)',
    shortName: 'BlueROV2 潜航器',
    domain: 'sea',
    domainBadge: '深海热液海沟潜航场',
    glbUrls: ['/robotics_glb/bluerov2_underwater_rov.glb'],
    urdfUrl: '/baselines/02-水下机器人ROV与深海作业系统/bluerov2/bluerov2_description/urdf/thrusters.xacro',
    modelYawOffset: 0,
    cruiseSpeed: 6.5,
    boostSpeed: 12.2,
    turnRate: 2.3,
    groundClearanceOffset: 2.8,
    fireActionTitle: '声呐探测鱼雷发射 + 深海冲击波',
    fireActionDesc: '机腹发射高速旋转带气泡尾迹的水下声呐探测鱼雷，命中目标爆开蔚蓝水下冲击波'
  },
  {
    id: 'rexrov2',
    name: '深海重型作业级 ROV (RexROV2 + Oberon7)',
    shortName: 'RexROV2 深海重工',
    domain: 'sea',
    domainBadge: '深海热液海沟潜航场',
    glbUrls: ['/robotics_glb/rexrov2_oberon7_subsea_rov.glb'],
    urdfUrl: '/baselines/02-水下机器人ROV与深海作业系统/rexrov2/rexrov2_description/robots/rexrov2_oberon7.xacro',
    modelYawOffset: 0,
    cruiseSpeed: 6.0,
    boostSpeed: 11.4,
    turnRate: 1.95,
    groundClearanceOffset: 3.0,
    fireActionTitle: '重型深海信标鱼雷 + Oberon7 机械臂前伸抓取',
    fireActionDesc: '发射重型声呐信标弹爆开深海冲击环，Oberon7 七轴液压臂同步前伸执行抓取'
  },
  {
    id: 'b737_cfm56',
    name: 'CFM56-7B 双转子涡扇高空飞行试车台',
    shortName: 'CFM56 高空穿云飞行',
    domain: 'air',
    domainBadge: '万米高空穿云超音速试车场',
    glbUrls: [
      '/twins/models/L1_nacelle_casings.glb',
      '/twins/models/L2_turbofan_core.glb',
      '/twins/models/L3_hpt_combustor.glb'
    ],
    modelYawOffset: Math.PI, // Intake lip at -X faces forward along heading; chevron exhaust at +X trails aft
    cruiseSpeed: 14.5,
    boostSpeed: 28.0,
    turnRate: 1.85,
    groundClearanceOffset: 12.0,
    fireActionTitle: '突破音障音爆云锥 + 红外热诱饵曳光弹齐射',
    fireActionDesc: '瞬间拉升突破跨音速爆开白色音爆激波云锥，并向两侧齐射拖烟热诱饵曳光弹'
  },
  {
    id: 'unitree_z1',
    name: '六轴协作机械臂战车底盘 (Unitree Z1)',
    shortName: 'Z1 机动机械臂台',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/unitree_z1_manipulator.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/z1_description/xacro/z1.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 5.0,
    boostSpeed: 8.8,
    turnRate: 2.2,
    groundClearanceOffset: 0.0,
    fireActionTitle: '六轴末端锁定 + 高能等离子切割束',
    fireActionDesc: '六轴腕部高速转向锁定靶标，发射高亮度等离子电弧束与采样信标'
  },
  {
    id: 'unitree_h1',
    name: '宇树通用人形机器人 (Unitree H1)',
    shortName: 'H1 通用人形',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/unitree_h1_humanoid.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/h1_description/urdf/h1_with_hand.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 6.2,
    boostSpeed: 10.8,
    turnRate: 2.4,
    groundClearanceOffset: 0.0,
    fireActionTitle: '双臂灵巧手蓄能 + 战术电磁脉冲',
    fireActionDesc: '全尺寸双足高速奔袭，挥臂释放全景扫描脉冲与战术信标'
  },
  {
    id: 'unitree_b2',
    name: '宇树工业重载四足机器人 (Unitree B2)',
    shortName: 'B2 重载四足',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/unitree_b2_quadruped.glb'],
    urdfUrl: '/baselines/03-宇树Unitree四足与人形全系_URDF/unitree_ros/robots/b2_description/urdf/b2_description.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 7.4,
    boostSpeed: 13.8,
    turnRate: 2.5,
    groundClearanceOffset: 0.0,
    fireActionTitle: '工业重载腾跃 + 震地雷达脉冲',
    fireActionDesc: '高扭矩四足越障飞跃，落地激发大范围地形测绘冲击波'
  },
  {
    id: 'fourier_gr1',
    name: '傅利叶智能人形机器人 (Fourier GR-1 T2)',
    shortName: 'GR-1 具身人形',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/fourier_gr1_humanoid.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/Wiki-GRx-Models-FourierN1/_首选基准原件_PRIMARY/gr1t1_fourier_hand_6dof.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 5.6,
    boostSpeed: 9.8,
    turnRate: 2.35,
    groundClearanceOffset: 0.0,
    fireActionTitle: '协同双臂展开 + 全息脉冲波',
    fireActionDesc: '通用具身人形动态步态行进，双臂协同展开触发高频探测波'
  },
  {
    id: 'talos_humanoid',
    name: 'PAL Robotics TALOS 工业双足机器人',
    shortName: 'TALOS 工业人形',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/talos_full_humanoid.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/talos-data/urdf/talos_full_v2.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 4.9,
    boostSpeed: 8.6,
    turnRate: 2.1,
    groundClearanceOffset: 0.0,
    fireActionTitle: '工业双臂力控锁定 + 等离子射束',
    fireActionDesc: '32-DOF 全身力控双足稳态推进，双七轴臂同步前伸锁定靶标'
  },
  {
    id: 'cassie_biped',
    name: 'Agility Robotics Cassie 动态双足机器人',
    shortName: 'Cassie 敏捷双足',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/cassie_biped_robot.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/cassie_description/urdf/cassie_v4.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 6.9,
    boostSpeed: 12.2,
    turnRate: 2.8,
    groundClearanceOffset: 0.0,
    fireActionTitle: '仿生反关节飞跃 + 声学探测脉冲',
    fireActionDesc: '高敏捷闭链弹簧腿高速奔跑越障，触发低空弹射侦察信标'
  },
  {
    id: 'anymal_c',
    name: 'ANYbotics ANYmal C 四足巡检机器人',
    shortName: 'ANYmal C 巡检犬',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/anymal_c_quadruped.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/anymal_c_simple_description/urdf/anymal.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 6.4,
    boostSpeed: 11.4,
    turnRate: 2.4,
    groundClearanceOffset: 0.0,
    fireActionTitle: '全天候激光雷达扫描 + 震地信标',
    fireActionDesc: '12-DOF 全向四足稳定爬坡巡检，同步发射工业测绘激光束'
  },
  {
    id: 'baxter_dual_arm',
    name: 'Rethink Robotics Baxter 双臂协作机器人',
    shortName: 'Baxter 双臂台',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/baxter_dual_arm_robot.glb'],
    urdfUrl: '/baselines/08-工业与协作机械臂及灵巧夹爪/baxter_common/baxter_description/urdf/baxter.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 4.6,
    boostSpeed: 8.2,
    turnRate: 2.0,
    groundClearanceOffset: 0.0,
    fireActionTitle: '双 7-DOF 协同抓取 + 工业焊弧光束',
    fireActionDesc: '双臂同步展开执行工业级抓取与高能电弧作业'
  },
  {
    id: 'hello_stretch',
    name: 'Hello Robot Stretch 移动操作机器人',
    shortName: 'Stretch 移动臂',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/hello_stretch_mobile_manipulator.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/stretch_description/urdf/stretch.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 5.8,
    boostSpeed: 10.2,
    turnRate: 2.5,
    groundClearanceOffset: 0.0,
    fireActionTitle: '垂直立柱升降 + 伸缩臂采样激光',
    fireActionDesc: '差速底盘灵活转向，垂直立柱与伸缩腕部同步前伸采样'
  },
  {
    id: 'nasa_valkyrie',
    name: 'NASA Johnson Space Center Valkyrie R5 宇航人形机甲',
    shortName: 'NASA Valkyrie 女武神',
    domain: 'land',
    domainBadge: '火星极冠与戈壁场',
    glbUrls: ['/robotics_glb/nasa_valkyrie_r5.glb'],
    urdfUrl: '/baselines/06-双足人形具身智能机器人/nasa-urdf-robots/val_description/model/robots/valkyrie_sim_angled_legj1s.urdf',
    modelYawOffset: 0,
    cruiseSpeed: 5.8,
    boostSpeed: 10.4,
    turnRate: 2.35,
    groundClearanceOffset: 0.0,
    fireActionTitle: '深空宇航重甲双臂展开 + 电弧脉冲波',
    fireActionDesc: 'NASA R5 宇航双足全身力控推进，胸甲核芯释放高能电磁扫描波'
  },
  {
    id: 'spot_arm',
    name: '波士顿动力 Spot + 6轴战斗机械臂 (Boston Dynamics Spot Arm)',
    shortName: 'Spot 机械臂战犬',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/boston_dynamics_spot_arm.glb'],
    modelYawOffset: 0,
    cruiseSpeed: 7.2,
    boostSpeed: 13.4,
    turnRate: 2.75,
    groundClearanceOffset: 0.0,
    fireActionTitle: '四足腾跃扑击 + 背部蛇形臂电弧齐射',
    fireActionDesc: '波士顿动力四足敏捷越障，背部六轴机械臂同步前探锁定目标'
  },
  {
    id: 'husky_ugv',
    name: 'Clearpath Husky A200 四驱装甲无人战车',
    shortName: 'Husky 四驱战车',
    domain: 'land',
    domainBadge: '陆地越障戈壁场',
    glbUrls: ['/robotics_glb/clearpath_husky_ugv.glb'],
    urdfUrl: '/baselines/07-四足越野与移动操作复合机器人/husky/husky_description/urdf/husky.urdf.xacro',
    modelYawOffset: 0,
    cruiseSpeed: 6.8,
    boostSpeed: 12.0,
    turnRate: 2.3,
    groundClearanceOffset: 0.0,
    fireActionTitle: '4×4 差速越野冲锋 + 车载重炮测绘激光',
    fireActionDesc: '全地形防滑宽胎翻越陨石坑陡坡，车顶武器站发射高能破岩激光'
  }
];

const HUMANOID_SANDBOX_IDS = new Set([
  'unitree_g1',
  'unitree_h1',
  'fourier_gr1',
  'talos_humanoid',
  'cassie_biped',
  'nasa_valkyrie'
]);

const QUADRUPED_SANDBOX_IDS = new Set([
  'unitree_go2',
  'unitree_b2',
  'anymal_c',
  'spot_arm'
]);

const groundDriveVehicles = new Set(['husky_ugv', 'sar', 'mars2020', 'hello_stretch', 'unitree_z1', 'baxter_dual_arm']);

export function isGroundDriveVehicle(actorId: string): boolean {
  return groundDriveVehicles.has(actorId);
}

export function stepGroundDrive(
  speed: number, yawRate: number, throttle: number, steering: number,
  maxSpeed: number, maxYawRate: number, dt: number, surgeSpeed?: number
) {
  const target = throttle * maxSpeed * (throttle < 0 ? 0.58 : 1);
  const reversing = speed * throttle < 0;
  const response = reversing ? 6.8 : throttle === 0 ? 2.4 : 3.5;
  let nextSpeed = damp(speed, target, response, dt);
  if (surgeSpeed !== undefined) {
    nextSpeed = surgeSpeed < 0 ? Math.min(nextSpeed, surgeSpeed) : Math.max(nextSpeed, surgeSpeed);
  }
  const turnLimit = maxYawRate / (1 + Math.abs(nextSpeed) * 0.075);
  return { speed: nextSpeed, yawRate: damp(yawRate, steering * turnLimit, 7, dt) };
}

export function getSandboxActorSpec(contextId: string): SandboxActorSpec {
  if (contextId === 'b737_bridge') {
    return SANDBOX_ACTORS.find((a) => a.id === 'b737_cfm56')!;
  }
  return SANDBOX_ACTORS.find((a) => a.id === contextId) || SANDBOX_ACTORS[0];
}

/**
 * Continuous analytical Martian/tactical off-road terrain height function y = h(x, z).
 * O(1) pure math, zero physics engine overhead, smooth undulating dunes, craters, and ridges.
 */
export function sampleLandTerrainHeight(x: number, z: number): number {
  // Multi-frequency wind-scoured Martian dunes, canyon swells, and asymmetric barchan ridges
  const primaryDunes =
    Math.sin(x * 0.085) * Math.cos(z * 0.082) * 2.15 +
    Math.cos(x * 0.048 - z * 0.068) * 1.65;
  const barchanRidges =
    Math.sin(x * 0.20 + z * 0.15 + 0.72 * Math.sin(z * 0.13)) * 0.62 +
    (1.0 - Math.abs(Math.sin(x * 0.12 - z * 0.10))) * 0.55;
  const microRipples = Math.sin(x * 0.58 + z * 0.44) * 0.065;

  // Keep central spawn pad (r <= 4.0m) flat and smoothly transition outward into dramatic dunes
  const r2 = x * x + z * z;
  const spawnFlatten = Math.min(1.0, Math.max(0.0, (r2 - 16.0) / 36.0));

  // Primary impact crater around (18, -14) with raised ejecta rim + deep bowl depression
  const dxC = x - 18;
  const dzC = z + 14;
  const dC = Math.hypot(dxC, dzC);
  let crater = 0;
  if (dC < 12.5) {
    const u = dC / 9.5;
    if (u < 1.0) {
      crater = -2.15 * Math.cos(u * Math.PI * 0.5) + 0.65 * Math.pow(u, 2.2);
    } else {
      const rimFade = 1.0 - (dC - 9.5) / 3.0;
      crater = 0.65 * rimFade * rimFade;
    }
  }

  // Secondary weathered scarp ridge around (-19, 12)
  const dxS = x + 19;
  const dzS = z - 12;
  const dS = Math.hypot(dxS, dzS);
  const scarp = dS < 11.0 ? 1.85 * Math.exp(-(dS * dS) / 32.0) : 0;

  // Tertiary crater basin around (-14, -18)
  const dC2 = Math.hypot(x + 14, z + 18);
  const crater2 = dC2 < 9.0 ? -1.35 * Math.cos((dC2 / 9.0) * Math.PI * 0.5) : 0;

  return (primaryDunes + barchanRidges + microRipples + crater + scarp + crater2) * spawnFlatten;
}

/**
 * Returns analytical natural terrain ridge & crater-rim coordinates for target locking and Odradek mineral callouts
 * without spawning any artificial geometric cones on the Martian desert floor.
 */
export function buildNaturalLandTerrainFeatures(): {
  x: number;
  y: number;
  z: number;
  radius: number;
  label: string;
}[] {
  const coords: [number, number, number, string][] = [
    [13.5, -10.5, 1.35, '杰泽罗陨石坑东侧隆起环壁'],
    [21.5, -16.5, 1.45, '冲击熔融角砾岩环脊'],
    [-18.5, 11.8, 1.5, '风蚀雅丹断崖高地'],
    [16.2, 14.5, 1.25, '新月形沙丘背风陡坡'],
    [-13.5, -15.2, 1.2, '古河道沉积层理露头'],
    [4.5, 22.8, 1.3, '赤铁矿富集沙脊棱线'],
    [-24.0, -4.5, 1.35, '玄武岩风化残丘台地'],
    [25.5, 4.0, 1.25, '高倾角硫酸盐岩脉坡']
  ];
  return coords.map(([x, z, radius, label]) => ({
    x,
    y: sampleLandTerrainHeight(x, z),
    z,
    radius,
    label
  }));
}

/**
 * Deep-sea abyssal trench seabed height function (used as lower floor clamp in Sea domain).
 */
export function sampleSeabedHeight(x: number, z: number): number {
  return (
    -4.5 +
    Math.sin(x * 0.12) * Math.cos(z * 0.14) * 0.95 +
    Math.sin(x * 0.28 - z * 0.22) * 0.32
  );
}

/**
 * Finite-difference surface normal [nx, ny, nz] for automatic terrain pitch/roll conformance.
 */
export function sampleLandTerrainNormal(x: number, z: number): [number, number, number] {
  const eps = 0.25;
  const hL = sampleLandTerrainHeight(x - eps, z);
  const hR = sampleLandTerrainHeight(x + eps, z);
  const hD = sampleLandTerrainHeight(x, z - eps);
  const hU = sampleLandTerrainHeight(x, z + eps);

  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);
  const invLen = 1 / Math.hypot(dx, 1, dz);
  return [-dx * invLen, invLen, -dz * invLen];
}

/**
 * Samples a 5-point chassis footprint support height so wide tracked / 6-wheel / quadruped actors
 * ride cleanly over dune crests without burying their nose, tracks, or wheels underground.
 */
export function sampleLandChassisSupportHeight(x: number, z: number, yaw: number, actorId: string): number {
  const hCenter = sampleLandTerrainHeight(x, z);
  const isWideChassis = actorId === 'mars2020' || actorId === 'sar' || actorId === 'husky_ugv';
  const halfLen = isWideChassis ? 0.56 : 0.34;
  const halfWid = isWideChassis ? 0.46 : 0.26;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const rx = -fz;
  const rz = fx;

  const hFL = sampleLandTerrainHeight(x + fx * halfLen - rx * halfWid, z + fz * halfLen - rz * halfWid);
  const hFR = sampleLandTerrainHeight(x + fx * halfLen + rx * halfWid, z + fz * halfLen + rz * halfWid);
  const hRL = sampleLandTerrainHeight(x - fx * halfLen - rx * halfWid, z - fz * halfLen - rz * halfWid);
  const hRR = sampleLandTerrainHeight(x - fx * halfLen + rx * halfWid, z - fz * halfLen + rz * halfWid);
  const maxCorner = Math.max(hFL, hFR, hRL, hRR);
  const meanSupport = (hCenter + hFL + hFR + hRL + hRR) * 0.2;
  // Blend mean contact plane with high-point crest guard so tracks/paws never clip into convex crests
  return Math.max(hCenter, 0.52 * meanSupport + 0.48 * maxCorner);
}

/**
 * Builds 5 tactical patrol waypoints matched to Land, Sea, or Air arena coordinates.
 */
export function buildArenaWaypoints(domain: SandboxDomain): SandboxWaypoint[] {
  if (domain === 'air') {
    return [
      { id: 'wp_1', label: 'ALPHA 穿云航门', x: 26, y: 13.5, z: -12, targetRockOffset: [12, 1.5, -4] },
      { id: 'wp_2', label: 'BRAVO 超音速走廊', x: 46, y: 17.0, z: 18, targetRockOffset: [10, -1.0, 8] },
      { id: 'wp_3', label: 'CHARLIE 高空盘旋点', x: 12, y: 15.2, z: 36, targetRockOffset: [-10, 2.0, 10] },
      { id: 'wp_4', label: 'DELTA 激波试车段', x: -28, y: 12.8, z: 16, targetRockOffset: [-12, 0.5, -8] },
      { id: 'wp_5', label: 'ECHO 返航导引门', x: -16, y: 14.0, z: -24, targetRockOffset: [8, -1.2, -10] }
    ];
  }

  if (domain === 'sea') {
    return [
      { id: 'wp_1', label: '声呐信标塔 #01', x: 16, y: 0.8, z: -10, targetRockOffset: [6, -1.2, -3] },
      { id: 'wp_2', label: '热液黑烟囱勘测点', x: 24, y: -0.8, z: 14, targetRockOffset: [5, -1.5, 4] },
      { id: 'wp_3', label: '深海管汇作业区', x: 2, y: 0.4, z: 24, targetRockOffset: [-5, -1.0, 5] },
      { id: 'wp_4', label: '海沟断崖探测站', x: -20, y: 1.5, z: 10, targetRockOffset: [-6, -1.8, -3] },
      { id: 'wp_5', label: '潜航母船中继站', x: -12, y: 0.2, z: -18, targetRockOffset: [4, -1.2, -6] }
    ];
  }

  // Land domain: place waypoints flush on continuous terrain h(x, z)
  const rawCoords: [string, string, number, number][] = [
    ['wp_1', '1号赤岩勘探靶区', 15, -9],
    ['wp_2', '2号陨石坑越障坡', 22, 13],
    ['wp_3', '3号战术高地棱线', 2, 22],
    ['wp_4', '4号乱石峡谷信标', -18, 9],
    ['wp_5', '5号前哨补给基站', -11, -16]
  ];

  return rawCoords.map(([id, label, x, z]) => {
    const y = sampleLandTerrainHeight(x, z);
    const rx = x + (x >= 0 ? 5.2 : -5.2);
    const rz = z + (z >= 0 ? 4.2 : -4.2);
    const ry = sampleLandTerrainHeight(rx, rz) + 0.65;
    return {
      id,
      label,
      x,
      y,
      z,
      targetRockOffset: [rx - x, ry - y, rz - z]
    };
  });
}

export function createInitialKinematicState(spec: SandboxActorSpec): SandboxKinematicState {
  const startY =
    spec.domain === 'air'
      ? 13.5
      : spec.domain === 'sea'
        ? 0.5
        : sampleLandChassisSupportHeight(0, 0, 0, spec.id);

  return {
    x: 0,
    y: startY,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    turnVel: 0,
    gaitDistance: 0,
    isGrounded: spec.domain === 'land',
    isBoosting: false,
    isBrakingReverse: false,
    reverserStroke: 0,
    throttlePct: spec.domain === 'air' ? 58 : 0,
    machNumber: spec.domain === 'air' ? 0.62 : 0,
    depthMeters: spec.domain === 'sea' ? 245.0 : 0,
    trauma: 0,
    autoPatrol: false,
    activeWaypointIdx: 0,
    waypointHoldTimer: 0,
    emittedAutoScan: false,
    emittedAutoFire: false,
    emittedFootstep: false
  };
}

function normalizeAngleDiff(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function damp(cur: number, target: number, lambda: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

/**
 * Advances 1 frame of lightweight procedural game kinematics (Walking / Off-Road / Subsea Swimming / High-Altitude Flight / Auto-Patrol).
 * Strictly clamped dt <= 0.05s; zero rigid-body physics engine overhead.
 */
export function stepSandboxKinematics(
  prev: SandboxKinematicState,
  input: SandboxInputState,
  spec: SandboxActorSpec,
  waypoints: SandboxWaypoint[],
  rawDt: number,
  jumpImpulseRequested: boolean = false,
  leapBoostTimer: number = 0,
  driveSurgeSpeed?: number
): SandboxKinematicState {
  const dt = Math.max(0.001, Math.min(0.05, rawDt));
  const next: SandboxKinematicState = {
    ...prev,
    emittedAutoScan: false,
    emittedAutoFire: false,
    emittedFootstep: false,
    trauma: Math.max(0, prev.trauma - dt * 1.65)
  };

  // Manual WASD input overrides auto-patrol cleanly if player grabs the stick
  const anyManualDrive = input.forward || input.backward || input.left || input.right;
  if (anyManualDrive && next.autoPatrol) {
    next.autoPatrol = false;
  }

  let cmdForward = 0; // -1..+1
  let cmdTurn = 0;    // -1 (right) .. +1 (left)
  let cmdVertical = 0; // -1..+1
  let cmdBoost = input.sprint || leapBoostTimer > 0;

  if (next.autoPatrol && waypoints.length > 0) {
    const wp = waypoints[next.activeWaypointIdx % waypoints.length];
    const dx = wp.x - next.x;
    const dz = wp.z - next.z;
    const horizDist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(dz, dx);
    // Note: in Three.js Y-up right-handed space, rotation.y = -yaw or we define forward = [cos(yaw), 0, sin(yaw)]
    const yawErr = normalizeAngleDiff(desiredYaw - next.yaw);

    if (next.waypointHoldTimer > 0) {
      next.waypointHoldTimer = Math.max(0, next.waypointHoldTimer - dt);
      cmdForward = spec.domain === 'air' ? 0.45 : 0.0;
      cmdTurn = Math.max(-0.8, Math.min(0.8, yawErr * 2.0));
      if (next.waypointHoldTimer <= 0) {
        next.activeWaypointIdx = (next.activeWaypointIdx + 1) % waypoints.length;
      }
    } else if (horizDist < (spec.domain === 'air' ? 5.2 : 2.6)) {
      // Arrived at tactical waypoint! Trigger scan + weapon fire showpiece!
      next.emittedAutoScan = true;
      next.emittedAutoFire = true;
      next.trauma = Math.max(next.trauma, 0.48);
      next.waypointHoldTimer = spec.domain === 'air' ? 0.55 : 1.55;
      if (spec.domain === 'air') {
        next.activeWaypointIdx = (next.activeWaypointIdx + 1) % waypoints.length;
      }
    } else {
      cmdTurn = Math.max(-1, Math.min(1, yawErr * 2.2));
      cmdForward = Math.abs(yawErr) > 1.1 ? 0.35 : 0.92;
      cmdBoost = horizDist > 11.0 && Math.abs(yawErr) < 0.35;
      if (spec.domain !== 'land') {
        const dy = wp.y - next.y;
        cmdVertical = Math.max(-1, Math.min(1, dy * 0.45));
      }
    }
  } else {
    cmdForward = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    // In our world convention: yaw increases toward +Z (right turn in +X forward), so Left key decreases yaw, Right key increases yaw
    cmdTurn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    cmdVertical = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  }

  const maxSpd = cmdBoost ? spec.boostSpeed : spec.cruiseSpeed;
  next.isBoosting = cmdBoost && (cmdForward > 0.1 || spec.domain === 'air');

  // === DOMAIN 1: HIGH-ALTITUDE CLOUD FLIGHT (B737 / CFM56) ===
  if (spec.domain === 'air') {
    const isBraking = !next.autoPatrol && input.backward;
    next.isBrakingReverse = isBraking;
    next.reverserStroke = damp(next.reverserStroke, isBraking ? 1.0 : 0.0, 6.5, dt);

    const targetSpeed = isBraking
      ? 5.2
      : cmdBoost
        ? spec.boostSpeed
        : cmdForward > 0
          ? spec.cruiseSpeed * 1.25
          : spec.cruiseSpeed * 0.82;

    next.speed = damp(next.speed, targetSpeed, isBraking ? 4.5 : 3.8, dt);
    next.turnVel = damp(next.turnVel, cmdTurn * spec.turnRate, 5.5, dt);
    next.yaw += next.turnVel * dt;

    const climbVel = cmdVertical * (cmdBoost ? 8.5 : 5.5);
    next.vy = damp(next.vy, climbVel, 5.0, dt);

    const fx = Math.cos(next.yaw);
    const fz = Math.sin(next.yaw);
    next.vx = fx * next.speed;
    next.vz = fz * next.speed;

    next.x += next.vx * dt;
    next.y = Math.max(4.5, Math.min(28.0, next.y + next.vy * dt));
    next.z += next.vz * dt;

    // Wrap smoothly within 110m aerial arena radius so player never flies into empty void
    const distFromOrigin = Math.hypot(next.x, next.z);
    if (distFromOrigin > 85) {
      const pullBackYaw = Math.atan2(-next.z, -next.x);
      next.yaw += normalizeAngleDiff(pullBackYaw - next.yaw) * dt * 2.2;
    }

    // Dynamic flight pitch (climb/dive) & dramatic roll banking on turns!
    const targetPitch = Math.max(-0.42, Math.min(0.45, next.vy * 0.055));
    const targetRoll = Math.max(-0.72, Math.min(0.72, next.turnVel * 0.36));
    next.pitch = damp(next.pitch, targetPitch, 6.0, dt);
    next.roll = damp(next.roll, targetRoll, 6.5, dt);

    next.gaitDistance += next.speed * dt;
    next.throttlePct = isBraking ? 74 : Math.round(38 + (next.speed / spec.boostSpeed) * 62);
    next.machNumber = Number((0.44 + (next.speed / spec.boostSpeed) * 0.68).toFixed(2));
    next.isGrounded = false;
    return next;
  }

  // === DOMAIN 2: DEEP-SEA TRENCH SWIMMING (BlueROV2 / RexROV2) ===
  if (spec.domain === 'sea') {
    next.isBrakingReverse = false;
    next.reverserStroke = 0;

    const targetFwdSpeed = cmdForward * maxSpd;
    next.speed = damp(next.speed, targetFwdSpeed, 4.2, dt);
    next.turnVel = damp(next.turnVel, cmdTurn * spec.turnRate, 5.2, dt);
    next.yaw += next.turnVel * dt;

    const fx = Math.cos(next.yaw);
    const fz = Math.sin(next.yaw);
    next.vx = damp(next.vx, fx * next.speed, 4.8, dt);
    next.vz = damp(next.vz, fz * next.speed, 4.8, dt);
    next.vy = damp(next.vy, cmdVertical * (cmdBoost ? 5.2 : 3.4), 4.8, dt);

    next.x = Math.max(-52, Math.min(52, next.x + next.vx * dt));
    next.z = Math.max(-52, Math.min(52, next.z + next.vz * dt));

    const seabedY = sampleSeabedHeight(next.x, next.z) + 1.05;
    next.y = Math.max(seabedY, Math.min(7.5, next.y + next.vy * dt));

    // Hydrodynamic pitch on surge/heave + roll banking when turning underwater
    const targetPitch = -next.speed * 0.024 + next.vy * 0.055;
    const targetRoll = next.turnVel * 0.22;
    next.pitch = damp(next.pitch, targetPitch, 5.5, dt);
    next.roll = damp(next.roll, targetRoll, 5.5, dt);

    const stepDist = Math.hypot(next.vx, next.vy, next.vz) * dt;
    next.gaitDistance += (next.speed < -0.05 ? -1 : 1) * stepDist;
    next.throttlePct = Math.min(100, Math.round(18 + (Math.hypot(next.vx, next.vy, next.vz) / spec.boostSpeed) * 82));
    next.depthMeters = Number((250.0 - next.y * 4.2).toFixed(1));
    next.isGrounded = false;
    return next;
  }

  // === DOMAIN 3: LAND OFF-ROAD WALKING / TROTTING / OBSTACLE CLIMBING ===
  next.isBrakingReverse = false;
  next.reverserStroke = 0;

  const leapBonus = leapBoostTimer > 0 ? 6.5 : 0;
  const targetSpeed = leapBoostTimer > 0 ? spec.boostSpeed + leapBonus : cmdForward * maxSpd;
  const driving = isGroundDriveVehicle(spec.id);
  if (driving) {
    const drive = stepGroundDrive(next.speed, next.turnVel, cmdForward, cmdTurn, maxSpd, spec.turnRate, dt, driveSurgeSpeed);
    if (next.isGrounded) {
      next.speed = drive.speed;
      next.turnVel = drive.yawRate;
    } else {
      next.turnVel = 0;
    }
  } else {
    next.speed = damp(next.speed, targetSpeed, 6.2, dt);
    next.turnVel = damp(next.turnVel, cmdTurn * spec.turnRate, 7.0, dt);
  }
  next.yaw += next.turnVel * dt;

  const fx = Math.cos(next.yaw);
  const fz = Math.sin(next.yaw);
  next.vx = fx * next.speed;
  next.vz = fz * next.speed;

  next.x = Math.max(-54, Math.min(54, next.x + next.vx * dt));
  next.z = Math.max(-54, Math.min(54, next.z + next.vz * dt));

  const groundY = sampleLandChassisSupportHeight(next.x, next.z, next.yaw, spec.id) + spec.groundClearanceOffset;

  if (jumpImpulseRequested && next.isGrounded) {
    next.vy = HUMANOID_SANDBOX_IDS.has(spec.id) || QUADRUPED_SANDBOX_IDS.has(spec.id) ? 6.8 : 4.6;
    next.isGrounded = false;
  }

  if (!next.isGrounded || next.y > groundY + 0.03) {
    next.vy -= 15.5 * dt;
    next.y += next.vy * dt;
    if (next.y <= groundY) {
      next.y = groundY;
      if (next.vy < -2.8) {
        next.trauma = Math.min(1, next.trauma + 0.25);
        next.emittedFootstep = true;
      }
      next.vy = 0;
      next.isGrounded = true;
    }
  } else {
    next.y = groundY;
    next.vy = 0;
    next.isGrounded = true;
  }

  // Terrain slope conformance + dynamic inward banking for legged/wheeled turns!
  const [nx, ny, nz] = sampleLandTerrainNormal(next.x, next.z);
  const rx = -fz;
  const rz = fx;
  // Slope along forward vector & right vector
  const slopeForward = (nx * fx + nz * fz) / Math.max(0.25, ny);
  const slopeRight = (nx * rx + nz * rz) / Math.max(0.25, ny);

  const isLegged = HUMANOID_SANDBOX_IDS.has(spec.id) || QUADRUPED_SANDBOX_IDS.has(spec.id);
  const bankRoll = isLegged
    ? next.turnVel * (Math.abs(next.speed) / Math.max(1, spec.cruiseSpeed)) * 0.16
    : -next.turnVel * (Math.abs(next.speed) / Math.max(1, spec.cruiseSpeed)) * 0.05;
  const accelPitch = isLegged ? Math.max(-0.12, Math.min(0.16, next.speed * 0.014)) : 0;

  next.pitch = damp(next.pitch, -slopeForward + accelPitch, 8.0, dt);
  next.roll = damp(next.roll, slopeRight + bankRoll, 8.0, dt);

  const prevStrideIdx = Math.floor(next.gaitDistance * 1.45);
  next.gaitDistance += driving ? (next.x - prev.x) * fx + (next.z - prev.z) * fz : next.speed * dt;
  const curStrideIdx = Math.floor(next.gaitDistance * 1.45);
  if (next.isGrounded && curStrideIdx !== prevStrideIdx && Math.abs(next.speed) > 0.4) {
    next.emittedFootstep = true;
  }

  next.throttlePct = Math.min(100, Math.round((Math.abs(next.speed) / spec.boostSpeed) * 100));
  return next;
}

/**
 * Computes real-time procedural joint angles for real URDF joints inside the Action Sandbox,
 * synced to actual distance traveled (gaitDistance), turn banking, boost, and active tactical fire!
 */
export function computeSandboxUrdfJointAngle(
  actorId: string,
  joint: UrdfJointDef,
  jointIndex: number,
  kin: SandboxKinematicState,
  simTime: number,
  fireAnimTimer: number
): number {
  const name = joint.name.toLowerCase();
  const child = joint.child.toLowerCase();
  const lo = Number.isFinite(joint.lower) ? joint.lower : -1.57;
  const hi = Number.isFinite(joint.upper) ? joint.upper : 1.57;
  const clamp = (v: number) => (lo < hi ? Math.max(lo, Math.min(hi, v)) : v);

  const speedNorm = Math.min(1.4, Math.abs(kin.speed) / 6.0);
  // Distance-synced phase so legs and wheels never skate!
  const stridePhase = kin.gaitDistance * 2.75;

  // Subsea ROV thrusters & Ping360 sonar + Oberon7 hydraulic arm grab on Fire!
  if (actorId === 'bluerov2' || actorId === 'rexrov2') {
    if (name.includes('thruster') || child.includes('thruster') || child.includes('prop')) {
      const spinRate = 6.0 + Math.abs(kin.speed) * 4.2 + Math.abs(kin.vy) * 3.5 + (kin.isBoosting ? 12.0 : 0);
      const dir = jointIndex % 2 === 0 ? 1 : -1;
      const raw = (simTime * spinRate * dir + jointIndex) % (Math.PI * 2);
      return raw > Math.PI ? raw - Math.PI * 2 : raw;
    }
    if (name.includes('sonar') || child.includes('sonar')) {
      return ((simTime * 2.8) % (Math.PI * 2)) - Math.PI;
    }
    // Oberon7 7-DOF subsea arm reaches forward dynamically when [F] torpedo/grab is triggered!
    if (fireAnimTimer > 0) {
      const reachEnv = Math.sin(Math.min(1, fireAnimTimer) * Math.PI);
      return clamp(0.55 * reachEnv * (jointIndex % 2 === 0 ? 1 : -0.7));
    }
    return clamp(0.18 * Math.sin(simTime * 1.3 + jointIndex * 0.6));
  }

  // Quadruped family (Go2 / B2 / ANYmal C / Spot-Arm) — athletic crouched stance + diagonal trot / sprint!
  if (QUADRUPED_SANDBOX_IDS.has(actorId)) {
    const isSpotArm = actorId === 'spot_arm';
    if (!kin.isGrounded) {
      if (name.includes('hip')) return clamp(0);
      if (name.includes('thigh') || name.includes('uleg')) return clamp(isSpotArm ? -0.22 : name.startsWith('f') ? 0.32 : 1.08);
      if (name.includes('calf') || name.includes('lleg')) return clamp(isSpotArm ? 0.34 : name.startsWith('f') ? -0.92 : -1.62);
    }
    const isDiagA = name.startsWith('fl_') || name.startsWith('rr_') || name.startsWith('hr_');
    const ph = stridePhase + (isDiagA ? 0 : Math.PI);
    const amp = Math.min(1.05, speedNorm * 0.98);
    const idleBreath = (1.0 - Math.min(1.0, speedNorm)) * Math.sin(simTime * 2.4) * 0.035;
    if (name.includes('hip')) {
      return clamp(kin.turnVel * 0.08 + 0.05 * Math.sin(ph) * amp);
    }
    if (name.includes('thigh') || name.includes('uleg')) {
      return clamp((isSpotArm ? 0 : 0.68) + idleBreath + 0.44 * Math.sin(ph) * amp);
    }
    if (name.includes('calf') || name.includes('lleg')) {
      return clamp((isSpotArm ? 0 : -1.32) - idleBreath * 1.6 + 0.48 * Math.cos(ph) * amp);
    }
    return clamp(0);
  }

  // Humanoid / Biped family (G1 / H1 / GR-1 / TALOS / Cassie / NASA Valkyrie) — bipedal stride + counter-swinging arms!
  if (HUMANOID_SANDBOX_IDS.has(actorId)) {
    if (name.includes('hokuyo')) {
      const rawSpin = (simTime * 8.5) % (Math.PI * 2);
      return rawSpin > Math.PI ? rawSpin - Math.PI * 2 : rawSpin;
    }
    const isValkyrie = actorId === 'nasa_valkyrie';
    const isLeft = name.includes('left');
    const ph = stridePhase + (isLeft ? 0 : Math.PI);
    const amp = Math.min(1.18, speedNorm * 1.05);
    const idleSway = (1.0 - Math.min(1.0, speedNorm)) * Math.sin(simTime * 2.1) * 0.025;

    if (fireAnimTimer > 0 && (name.includes('shoulder') || name.includes('elbow'))) {
      const castEnv = Math.sin(Math.min(1, fireAnimTimer) * Math.PI);
      if (name.includes('shoulder_pitch') || name.includes('shoulderpitch')) return clamp(-0.95 * castEnv);
      if (name.includes('shoulder_roll') || name.includes('shoulderroll')) return clamp((isLeft ? 0.65 : -0.65) * castEnv);
      if (name.includes('elbow')) return clamp(0.25 * (1 - castEnv));
    }

    if (name.includes('hip_pitch') || name.includes('hippitch')) {
      return clamp((isValkyrie ? 0 : -0.18) - idleSway + 0.48 * Math.sin(ph) * amp);
    }
    if (name.includes('knee')) {
      return clamp((isValkyrie ? 0.12 : 0.34) + idleSway * 1.8 + 0.58 * Math.max(0, Math.sin(ph + 0.55)) * amp);
    }
    if (name.includes('ankle_pitch') || name.includes('anklepitch')) {
      return clamp((isValkyrie ? 0 : -0.16) - 0.26 * Math.sin(ph) * amp);
    }
    if (name.includes('shoulder_pitch') || name.includes('shoulderpitch')) {
      return clamp(0.12 - 0.46 * Math.sin(ph) * amp);
    }
    if (name.includes('elbow')) {
      return clamp((isValkyrie ? 0.15 : 0.52) + 0.30 * Math.cos(ph) * amp);
    }
    if (name.includes('waist_yaw') || name.includes('torsoyaw')) {
      return clamp(kin.turnVel * 0.12 + 0.16 * Math.sin(stridePhase) * amp);
    }
    if (isValkyrie && (name.includes('roll') || name.includes('thumb') || name.includes('finger') || name.includes('pinky'))) {
      return clamp(0);
    }
    return clamp(0.05 * Math.sin(simTime * 2.0 + jointIndex));
  }

  // Search-and-Rescue Tracked Robot (SAR): Rolling drive wheels + terrain-adaptive 4 flippers + AR4 turret aim!
  if (actorId === 'sar') {
    if (joint.type === 'continuous' && !name.includes('f_')) {
      const twoPi = Math.PI * 2;
      const wheelWrap = (((kin.gaitDistance * 3.8) % twoPi) + twoPi) % twoPi;
      return wheelWrap - Math.PI;
    }
    if (name.includes('f_front') || name.includes('flipper_front')) {
      return clamp(0.28 - kin.pitch * 1.35 + 0.22 * Math.sin(stridePhase * 0.65));
    }
    if (name.includes('f_back') || name.includes('flipper_back')) {
      return clamp(-0.24 + kin.pitch * 1.25 + 0.20 * Math.cos(stridePhase * 0.65));
    }
    if (fireAnimTimer > 0) {
      // Aim AR4 6-DOF arm forward toward laser target!
      const aimEnv = Math.sin(Math.min(1, fireAnimTimer) * Math.PI);
      return clamp(0.42 * aimEnv * (jointIndex === 1 ? -1 : 0.6));
    }
    return clamp(0.22 * Math.sin(simTime * 1.5 + jointIndex * 0.7));
  }

  // Unitree Z1 Manipulator
  if (fireAnimTimer > 0) {
    const aim = Math.sin(Math.min(1, fireAnimTimer) * Math.PI);
    return clamp(0.55 * aim * (jointIndex % 2 === 0 ? 1 : -0.8));
  }
  return clamp(0.28 * Math.sin(simTime * 1.8 + jointIndex * 0.65 + stridePhase * 0.25));
}
