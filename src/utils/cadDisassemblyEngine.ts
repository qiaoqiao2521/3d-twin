import { UrdfJointDef } from './manifestUtils';

export interface SubAssemblyDef {
  id: string;
  label: string;
  shortCode: string;
  stage: 1 | 2 | 3 | 4;
  partNames: string[];
  totalTris: number;
}

export interface OrthogonalExplosionPlan {
  stage: 1 | 2 | 3 | 4;
  subAssemblyId: string;
  /** Primary orthogonal displacement vector in model-local coordinates */
  orthoVector: [number, number, number];
  /** Surgical peel / extraction vector when user clicks [轴向抽离剥开] */
  peelVector: [number, number, number];
}

export interface PartBlueprintMetadata {
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  subAssemblyLabel: string;
  /** Estimate from a declared reference envelope, never a measured part dimension. */
  dimensionsMm: [number, number, number] | null;
  dimensionsModelUnits: [number, number, number] | null;
  dimensionSource: 'reference-envelope' | 'unknown';
  bindingStatus: 'bound' | 'missing' | 'ambiguous';
  tris: number;
  vertices: number;
  urdfLinkName: string;
  urdfJointName: string;
  urdfJointType: string;
  urdfAxisText: string;
}

export interface AutoDisassemblyState {
  active: boolean;
  progress: number; // 0..1
  direction: 1 | -1;
  holdTimer: number;
  currentStage: 0 | 1 | 2 | 3 | 4;
  stageLabel: string;
}

interface RawPartInput {
  name: string;
  tris: number;
  layer: 'L1' | 'L2' | 'L3';
  center: [number, number, number];
}

interface SubAssemblyRule {
  id: string;
  label: string;
  shortCode: string;
  stage: 1 | 2 | 3 | 4;
  match: (nameLower: string, layer: 'L1' | 'L2' | 'L3', center: [number, number, number]) => boolean;
}

/**
 * Configured reference envelopes for display estimates. These values are not
 * per-part measurements or a calibration certificate.
 */
const REAL_MAX_ENVELOPE_MM: Record<string, number> = {
  sar: 1180,
  rexrov2: 2450,
  bluerov2: 580,
  unitree_g1: 1320,
  unitree_go2: 700,
  unitree_z1: 740,
  unitree_h1: 1805,
  unitree_b2: 1098,
  fourier_gr1: 1650,
  talos_humanoid: 1750,
  cassie_biped: 1150,
  anymal_c: 850,
  baxter_dual_arm: 1850,
  hello_stretch: 1410,
  mars2020: 3050,
  b737_cfm56: 3120,
  b737_bridge: 3120
};

function getDomainSubAssemblyRules(contextId: string): SubAssemblyRule[] {
  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    return [
      {
        id: 'inlet_lip',
        label: '进气消音唇口',
        shortCode: 'A01',
        stage: 1,
        match: (n) => n.includes('inlet')
      },
      {
        id: 'kevlar_case',
        label: '凯夫拉包容机匣',
        shortCode: 'A02',
        stage: 1,
        match: (n) => n.includes('containment') || n.includes('kevlar')
      },
      {
        id: 'rev_port',
        label: '左C型反推叶栅罩',
        shortCode: 'A03',
        stage: 2,
        match: (n, _l, c) => n.includes('reverser') && (n.includes('port') || c[2] >= 0)
      },
      {
        id: 'rev_stbd',
        label: '右C型反推叶栅罩',
        shortCode: 'A04',
        stage: 2,
        match: (n, _l, c) => n.includes('reverser') && (n.includes('stbd') || c[2] < 0)
      },
      {
        id: 'n1_fan',
        label: 'N1宽弦钛合金风扇盘',
        shortCode: 'A05',
        stage: 3,
        match: (n) => n.includes('n1_wide_chord') || n.includes('fan')
      },
      {
        id: 'lpc_booster',
        label: '4级低压增压鼓筒 LPC',
        shortCode: 'A06',
        stage: 3,
        match: (n) => n.includes('lpc')
      },
      {
        id: 'ogv_vane',
        label: '出口矫直导叶 OGV',
        shortCode: 'A07',
        stage: 3,
        match: (n) => n.includes('ogv')
      },
      {
        id: 'hpc_core',
        label: '9级高压压气机 HPC',
        shortCode: 'A08',
        stage: 3,
        match: (n) => n.includes('hpc')
      },
      {
        id: 'combustor_liner',
        label: '双环腔燃烧室火焰筒',
        shortCode: 'A09',
        stage: 4,
        match: (n) => n.includes('combustor')
      },
      {
        id: 'hpt_stage',
        label: '单晶气膜高压涡轮 HPT',
        shortCode: 'A10',
        stage: 4,
        match: (n) => n.includes('hpt')
      },
      {
        id: 'lpt_shaft',
        label: '4级低压涡轮与同心主轴',
        shortCode: 'A11',
        stage: 4,
        match: (n) => n.includes('lpt') || n.includes('shaft')
      },
      {
        id: 'chevron_nozzle',
        label: '锯齿消音尾喷管总成',
        shortCode: 'A12',
        stage: 1,
        match: (n) => n.includes('exhaust') || n.includes('chevron') || n.includes('nozzle')
      }
    ];
  }

  if (contextId === 'mars2020') {
    return [
      {
        id: 'mars_mast',
        label: 'Mastcam-Z / SuperCam 桅杆舱',
        shortCode: 'M01',
        stage: 1,
        match: (n, l, c) => l === 'L2' && (n.includes('mast') || n.includes('head') || n.includes('cylinder015') || c[1] > 0.25)
      },
      {
        id: 'mars_hga_ant',
        label: 'X波段高增益与UHF通信天线',
        shortCode: 'M02',
        stage: 1,
        match: (n, l, c) => n.includes('hga') || n.includes('antenna') || (l === 'L3' && c[1] > 0.22 && c[0] < 0)
      },
      {
        id: 'mars_left_wheels',
        label: '左侧三轮防滑轮系总成',
        shortCode: 'M03',
        stage: 2,
        match: (n, l, c) => l === 'L1' && (n.includes('wheel') || c[1] < -0.18) && c[2] >= 0
      },
      {
        id: 'mars_right_wheels',
        label: '右侧三轮防滑轮系总成',
        shortCode: 'M04',
        stage: 2,
        match: (n, l, c) => l === 'L1' && (n.includes('wheel') || c[1] < -0.18) && c[2] < 0
      },
      {
        id: 'mars_left_bogie',
        label: '左Rocker-Bogie钛合金悬架',
        shortCode: 'M05',
        stage: 2,
        match: (_n, l, c) => l === 'L1' && c[2] >= 0
      },
      {
        id: 'mars_right_bogie',
        label: '右Rocker-Bogie钛合金悬架',
        shortCode: 'M06',
        stage: 2,
        match: (_n, l, c) => l === 'L1' && c[2] < 0
      },
      {
        id: 'mars_arm_links',
        label: '5-DOF 采样机械臂主连杆',
        shortCode: 'M07',
        stage: 3,
        match: (n, l, c) => l === 'L2' && !n.includes('turret') && !n.includes('drill') && c[0] > 0.15
      },
      {
        id: 'mars_turret_drill',
        label: 'PIXL / 冲击岩芯钻转塔',
        shortCode: 'M08',
        stage: 3,
        match: (n, l) => l === 'L2' || n.includes('turret') || n.includes('drill') || n.includes('pixl')
      },
      {
        id: 'mars_hazcams',
        label: '前后避障与导航相机阵列',
        shortCode: 'M09',
        stage: 4,
        match: (n) => n.includes('hazcam') || n.includes('navcam') || n.includes('cam')
      },
      {
        id: 'mars_mmrtg',
        label: 'MMRTG 钚-238 核热电池舱',
        shortCode: 'M10',
        stage: 4,
        match: (n, l, c) => n.includes('rtg') || (l === 'L3' && c[0] < -0.32)
      },
      {
        id: 'mars_web_lab',
        label: 'WEB 暖电子车体与内舱实验室',
        shortCode: 'M11',
        stage: 4,
        match: () => true
      }
    ];
  }

  if (contextId === 'sar') {
    return [
      {
        id: 'sar_lidar_dome',
        label: '顶部激光雷达感知舱',
        shortCode: 'S01',
        stage: 1,
        match: (n) => n.includes('lidar') || n.includes('sensor') || n.includes('camera')
      },
      {
        id: 'sar_left_track',
        label: '左侧主履带承重轮系',
        shortCode: 'S02',
        stage: 2,
        match: (n, l) => l === 'L1' && n.includes('left') && !n.includes('base')
      },
      {
        id: 'sar_right_track',
        label: '右侧主履带承重轮系',
        shortCode: 'S03',
        stage: 2,
        match: (n, l) => l === 'L1' && n.includes('right') && !n.includes('base')
      },
      {
        id: 'sar_front_flippers',
        label: '前双独立越障摆臂总成',
        shortCode: 'S04',
        stage: 2,
        match: (n) => n.includes('f_front') || n.includes('flipper_front')
      },
      {
        id: 'sar_rear_flippers',
        label: '后双独立越障摆臂总成',
        shortCode: 'S05',
        stage: 2,
        match: (n) => n.includes('f_back') || n.includes('flipper_back')
      },
      {
        id: 'sar_ar4_base_shoulder',
        label: 'AR4 机械臂回转基座与大臂',
        shortCode: 'S06',
        stage: 3,
        match: (n) => n.includes('ar4_base') || n.includes('link_1') || n.includes('link_2')
      },
      {
        id: 'sar_ar4_forearm_wrist',
        label: 'AR4 小臂与三轴腕部关节',
        shortCode: 'S07',
        stage: 3,
        match: (n) => n.includes('link_3') || n.includes('link_4') || n.includes('link_5')
      },
      {
        id: 'sar_ar4_gripper',
        label: '末端救援夹爪与力控法兰',
        shortCode: 'S08',
        stage: 4,
        match: (n) => n.includes('link_6') || n.includes('gripper') || n.includes('jaw')
      },
      {
        id: 'sar_chassis_core',
        label: '主控装甲底盘与电源母线舱',
        shortCode: 'S09',
        stage: 4,
        match: () => true
      }
    ];
  }

  if (contextId === 'bluerov2' || contextId === 'rexrov2') {
    return [
      {
        id: 'rov_buoyancy_top',
        label: '上部复合浮力块与导流顶罩',
        shortCode: 'R01',
        stage: 1,
        match: (n, _l, c) => n.includes('float') || n.includes('foam') || (n.includes('hull') && c[1] > 0.12)
      },
      {
        id: 'rov_sonar_turret',
        label: 'Ping360 声呐与前视感知舱',
        shortCode: 'R02',
        stage: 1,
        match: (n) => n.includes('sonar') || n.includes('sensor_pod') || n.includes('dvl')
      },
      {
        id: 'rov_port_thrusters',
        label: '左舷矢量螺旋桨推进器组',
        shortCode: 'R03',
        stage: 2,
        match: (n, _l, c) => (n.includes('thruster') || n.includes('prop') || n.includes('nozzle')) && c[2] >= 0
      },
      {
        id: 'rov_stbd_thrusters',
        label: '右舷矢量螺旋桨推进器组',
        shortCode: 'R04',
        stage: 2,
        match: (n, _l, c) => (n.includes('thruster') || n.includes('prop') || n.includes('nozzle')) && c[2] < 0
      },
      {
        id: 'rov_side_frames',
        label: 'HDPE 抗冲击侧翼承力框与压载轨',
        shortCode: 'R05',
        stage: 2,
        match: (n) => n.includes('panel') || n.includes('ballast') || n.includes('frame')
      },
      {
        id: 'rov_arm_or_gimbal',
        label: contextId === 'rexrov2' ? 'Oberon7 7轴深海液压机械臂' : '水下云台相机与Lumen探照灯组',
        shortCode: 'R06',
        stage: 3,
        match: (n) => n.includes('oberon') || n.includes('arm') || n.includes('gripper') || n.includes('camera') || n.includes('lumen')
      },
      {
        id: 'rov_pressure_tubes',
        label: '耐压密封电子舱与电池筒',
        shortCode: 'R07',
        stage: 4,
        match: (n) => n.includes('tube') || n.includes('battery') || n.includes('enclosure') || n.includes('bulkhead')
      },
      {
        id: 'rov_avionics_core',
        label: 'Navigator 飞控核、ESC与深度计',
        shortCode: 'R08',
        stage: 4,
        match: () => true
      }
    ];
  }

  if (contextId === 'unitree_g1') {
    return [
      {
        id: 'g1_head_lidar',
        label: '头部 3D 激光雷达与双目视觉舱',
        shortCode: 'G01',
        stage: 1,
        match: (n) => n.includes('head') || n.includes('lidar') || n.includes('d455')
      },
      {
        id: 'g1_torso_waist',
        label: '主躯干胸腔与三自由度腰部总成',
        shortCode: 'G02',
        stage: 4,
        match: (n) => n.includes('torso') || n.includes('waist') || n.includes('pelvis')
      },
      {
        id: 'g1_left_arm',
        label: '左肩肘五自由度仿生机械臂',
        shortCode: 'G03',
        stage: 2,
        match: (n) => n.includes('left') && (n.includes('shoulder') || n.includes('elbow') || n.includes('wrist'))
      },
      {
        id: 'g1_right_arm',
        label: '右肩肘五自由度仿生机械臂',
        shortCode: 'G04',
        stage: 2,
        match: (n) => n.includes('right') && (n.includes('shoulder') || n.includes('elbow') || n.includes('wrist'))
      },
      {
        id: 'g1_left_hand',
        label: '左手 Dex3-1 多指力控灵巧手',
        shortCode: 'G05',
        stage: 3,
        match: (n) => n.includes('left') && (n.includes('hand') || n.includes('finger') || n.includes('thumb') || n.includes('index') || n.includes('middle'))
      },
      {
        id: 'g1_right_hand',
        label: '右手 Dex3-1 多指力控灵巧手',
        shortCode: 'G06',
        stage: 3,
        match: (n) => n.includes('right') && (n.includes('hand') || n.includes('finger') || n.includes('thumb') || n.includes('index') || n.includes('middle'))
      },
      {
        id: 'g1_left_leg',
        label: '左髋大腿高扭矩关节链',
        shortCode: 'G07',
        stage: 2,
        match: (n) => n.includes('left') && (n.includes('hip') || n.includes('thigh') || n.includes('knee'))
      },
      {
        id: 'g1_right_leg',
        label: '右髋大腿高扭矩关节链',
        shortCode: 'G08',
        stage: 2,
        match: (n) => n.includes('right') && (n.includes('hip') || n.includes('thigh') || n.includes('knee'))
      },
      {
        id: 'g1_ankles_feet',
        label: '双足并联踝关节与减震足底',
        shortCode: 'G09',
        stage: 3,
        match: () => true
      }
    ];
  }

  if (contextId === 'unitree_go2') {
    return [
      {
        id: 'go2_lidar_head',
        label: '4D 超广角激光雷达 L1 与前视舱',
        shortCode: 'Q01',
        stage: 1,
        match: (n, _l, c) => n.includes('radar') || n.includes('lidar') || n.includes('head') || n.includes('camera') || (n.includes('base') && c[0] > 0.25)
      },
      {
        id: 'go2_fl_leg',
        label: '左前腿 FL 三轴高动态关节链',
        shortCode: 'Q02',
        stage: 2,
        match: (n) => n.startsWith('fl_') || n.includes('fl_')
      },
      {
        id: 'go2_fr_leg',
        label: '右前腿 FR 三轴高动态关节链',
        shortCode: 'Q03',
        stage: 2,
        match: (n) => n.startsWith('fr_') || n.includes('fr_')
      },
      {
        id: 'go2_rl_leg',
        label: '左后腿 RL 三轴高动态关节链',
        shortCode: 'Q04',
        stage: 2,
        match: (n) => n.startsWith('rl_') || n.includes('rl_')
      },
      {
        id: 'go2_rr_leg',
        label: '右后腿 RR 三轴高动态关节链',
        shortCode: 'Q05',
        stage: 2,
        match: (n) => n.startsWith('rr_') || n.includes('rr_')
      },
      {
        id: 'go2_foot_pads',
        label: '四足触地力觉足端球垫组',
        shortCode: 'Q06',
        stage: 3,
        match: (n) => n.includes('foot') || n.includes('calflower')
      },
      {
        id: 'go2_imu_battery',
        label: '中心高压动力电池与 IMU 核',
        shortCode: 'Q07',
        stage: 4,
        match: (n) => n.includes('imu') || n.includes('battery')
      },
      {
        id: 'go2_trunk_chassis',
        label: '高强度铝合金一体化主躯干',
        shortCode: 'Q08',
        stage: 4,
        match: () => true
      }
    ];
  }

  // Unitree Z1 6-DOF Manipulator (9 real STL CAD links -> 8 granular joint assemblies)
  return [
    {
      id: 'z1_base_pedestal',
      label: 'J0 固定法兰底座总成',
      shortCode: 'Z01',
      stage: 4,
      match: (n) => n.includes('link00') || n.includes('base')
    },
    {
      id: 'z1_j1_turret',
      label: 'J1 腰部回转谐波关节座',
      shortCode: 'Z02',
      stage: 3,
      match: (n) => n.includes('link01')
    },
    {
      id: 'z1_j2_upper_arm',
      label: 'J2 高刚度碳纤/铝合金大臂',
      shortCode: 'Z03',
      stage: 3,
      match: (n) => n.includes('link02')
    },
    {
      id: 'z1_j3_elbow',
      label: 'J3 肘部俯仰传动关节臂',
      shortCode: 'Z04',
      stage: 3,
      match: (n) => n.includes('link03')
    },
    {
      id: 'z1_j4_forearm',
      label: 'J4 前臂腕部俯仰驱动节',
      shortCode: 'Z05',
      stage: 3,
      match: (n) => n.includes('link04')
    },
    {
      id: 'z1_j5_wrist_roll',
      label: 'J5 腕部偏航回转关节舱',
      shortCode: 'Z06',
      stage: 2,
      match: (n) => n.includes('link05')
    },
    {
      id: 'z1_j6_flange',
      label: 'J6 末端输出法兰盘总成',
      shortCode: 'Z07',
      stage: 1,
      match: (n) => n.includes('link06')
    },
    {
      id: 'z1_servo_gripper',
      label: '平行/旋转伺服力控夹爪',
      shortCode: 'Z08',
      stage: 1,
      match: () => true
    }
  ];
}

/**
 * Builds an 8-12+ fine-grained mechanical sub-assembly matrix from actual loaded GLB meshes.
 */
export function buildSubAssemblyMatrix(
  contextId: string,
  parts: RawPartInput[]
): SubAssemblyDef[] {
  if (parts.length === 0) return [];
  const rules = getDomainSubAssemblyRules(contextId);
  const buckets = new Map<string, SubAssemblyDef>();

  for (const r of rules) {
    buckets.set(r.id, {
      id: r.id,
      label: r.label,
      shortCode: r.shortCode,
      stage: r.stage,
      partNames: [],
      totalTris: 0
    });
  }

  for (const p of parts) {
    const nameLower = p.name.toLowerCase();
    let matchedRule = rules[rules.length - 1];
    for (const r of rules) {
      if (r.match(nameLower, p.layer, p.center)) {
        matchedRule = r;
        break;
      }
    }
    const bucket = buckets.get(matchedRule.id)!;
    bucket.partNames.push(p.name);
    bucket.totalTris += p.tris;
  }

  const populated = Array.from(buckets.values()).filter((b) => b.partNames.length > 0);

  // If a sparse model has >= 8 parts but fewer than 8 populated sub-assemblies, split largest bucket cleanly by part
  while (populated.length < Math.min(8, parts.length)) {
    populated.sort((a, b) => b.partNames.length - a.partNames.length);
    const largest = populated[0];
    if (!largest || largest.partNames.length < 2) break;
    const splitPartName = largest.partNames.pop()!;
    const partObj = parts.find((pt) => pt.name === splitPartName);
    const splitTris = partObj?.tris || 0;
    largest.totalTris = Math.max(0, largest.totalTris - splitTris);
    populated.push({
      id: `${largest.id}_sub_${populated.length + 1}`,
      label: `${largest.label} · ${splitPartName.slice(0, 14)}`,
      shortCode: `P0${populated.length + 1}`,
      stage: largest.stage,
      partNames: [splitPartName],
      totalTris: splitTris
    });
  }

  // Restore deterministic rule ordering
  const orderIndex = new Map(rules.map((r, i) => [r.id, i]));
  populated.sort((a, b) => (orderIndex.get(a.id) ?? 99) - (orderIndex.get(b.id) ?? 99));
  return populated;
}

/**
 * Computes a 4-stage industrial orthogonal assembly explosion vector + surgical peel vector
 * for each real GLB sub-part:
 *   Stage 1 (0.00 -> 0.28): Top covers / fairings / sensor masts lift vertically (+Y)
 *   Stage 2 (0.24 -> 0.56): Port / Starboard tracks, wheels, thrusters, C-ducts pull laterally (±Z)
 *   Stage 3 (0.50 -> 0.82): Rotors, compressor drums, and manipulator links cascade axially (±X)
 *   Stage 4 (0.74 -> 1.00): Core hot-section, nuclear MMRTG, and inner electronics emerge cleanly
 */
export function computePartOrthogonalExplosionPlan(
  contextId: string,
  partName: string,
  layer: 'L1' | 'L2' | 'L3',
  localCenter: [number, number, number],
  subAssemblies: SubAssemblyDef[]
): OrthogonalExplosionPlan {
  const matchedSub = subAssemblies.find((sa) => sa.partNames.includes(partName));
  const stage: 1 | 2 | 3 | 4 = matchedSub?.stage ?? (layer === 'L1' ? 2 : layer === 'L2' ? 3 : 4);
  const subAssemblyId = matchedSub?.id ?? 'default_sub';

  const [cx, cy, cz] = localCenter;
  const n = partName.toLowerCase();

  let ox = 0;
  let oy = 0;
  let oz = 0;

  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    // Turbofan engine orthogonal assembly craft:
    if (n.includes('inlet')) {
      ox = -0.82; oy = 0.08; oz = 0;
    } else if (n.includes('containment') || n.includes('kevlar')) {
      ox = -0.35; oy = 0.62; oz = 0;
    } else if (n.includes('reverser')) {
      const signZ = n.includes('port') || cz >= 0 ? 1 : -1;
      ox = 0.14; oy = 0.08; oz = signZ * 0.78;
    } else if (n.includes('exhaust') || n.includes('chevron')) {
      ox = 0.88; oy = 0.05; oz = 0;
    } else if (n.includes('n1_wide_chord')) {
      ox = -0.58; oy = 0; oz = 0;
    } else if (n.includes('lpc')) {
      ox = -0.30; oy = 0; oz = 0;
    } else if (n.includes('ogv')) {
      ox = -0.10; oy = 0.34; oz = 0;
    } else if (n.includes('hpc')) {
      ox = 0.16; oy = 0; oz = 0;
    } else if (n.includes('combustor')) {
      ox = 0.38; oy = 0.36; oz = 0;
    } else if (n.includes('hpt')) {
      ox = 0.56; oy = 0; oz = 0;
    } else {
      ox = 0.74; oy = -0.18; oz = 0;
    }
  } else if (stage === 1) {
    // Stage 1: Vertical lift along +Y (with slight axial clearance)
    oy = 0.68;
    ox = Math.abs(cx) > 0.25 ? Math.sign(cx) * 0.18 : 0;
    oz = Math.abs(cz) > 0.25 ? Math.sign(cz) * 0.14 : 0;
  } else if (stage === 2) {
    // Stage 2: Symmetric transverse pull along ±Z
    const signZ = Math.abs(cz) > 0.02 ? Math.sign(cz) : n.includes('right') || n.includes('stbd') || n.includes('fr_') || n.includes('rr_') ? -1 : 1;
    oz = signZ * (0.64 + Math.min(0.28, Math.abs(cz) * 0.45));
    ox = Math.abs(cx) > 0.2 ? Math.sign(cx) * 0.16 : 0;
    oy = cy < -0.15 ? -0.12 : 0.06;
  } else if (stage === 3) {
    // Stage 3: Axial cascade along ±X (plus vertical separation for multi-link arms)
    const signX = Math.abs(cx) > 0.04 ? Math.sign(cx) : 1;
    ox = signX * (0.48 + Math.min(0.42, Math.abs(cx) * 0.6));
    oy = cy > 0.15 ? 0.28 : cy < -0.15 ? -0.22 : 0.12;
    oz = Math.abs(cz) > 0.18 ? Math.sign(cz) * 0.2 : 0;
  } else {
    // Stage 4: Core emergence (rearward/upward separation from chassis cavity)
    ox = cx < -0.15 ? -0.52 : cx > 0.2 ? 0.38 : 0.0;
    oy = 0.36;
    oz = Math.abs(cz) > 0.15 ? Math.sign(cz) * 0.24 : 0;
  }

  // Normalize surgical peel vector so [轴向抽离剥开] pulls the single part cleanly clear of neighbors (0.58m normalized)
  const mag = Math.hypot(ox, oy, oz) || 1;
  const peelScale = 0.62 / mag;

  return {
    stage,
    subAssemblyId,
    orthoVector: [ox, oy, oz],
    peelVector: [ox * peelScale, oy * peelScale, oz * peelScale]
  };
}

/**
 * Evaluates smooth 4-stage gated orthogonal displacement + individual surgical peel displacement.
 */
export function evaluateStagedExplosionOffset(
  plan: OrthogonalExplosionPlan,
  explosionProgress: number,
  peelAmount: number
): [number, number, number] {
  const p = Math.max(0, Math.min(1, explosionProgress));
  const windows: Record<1 | 2 | 3 | 4, [number, number]> = {
    1: [0.0, 0.30],
    2: [0.22, 0.56],
    3: [0.48, 0.82],
    4: [0.72, 1.0]
  };
  const [w0, w1] = windows[plan.stage];
  const rawU = p <= w0 ? 0 : p >= w1 ? 1 : (p - w0) / (w1 - w0);
  // Smoothstep easing per assembly stage so each stage locks & glides crisply
  const stageU = rawU * rawU * (3 - 2 * rawU);

  const peel = Math.max(0, Math.min(1, peelAmount));
  const peelEase = peel * peel * (3 - 2 * peel);

  return [
    (plan.orthoVector[0] * stageU + plan.peelVector[0] * peelEase) || 0,
    (plan.orthoVector[1] * stageU + plan.peelVector[1] * peelEase) || 0,
    (plan.orthoVector[2] * stageU + plan.peelVector[2] * peelEase) || 0
  ];
}

/**
 * Advances the [🎬 自动分步拆装演示] state machine cleanly through Stages 1->2->3->4, holds briefly, then re-assembles 4->3->2->1.
 */
export function stepAutoDisassemblyDemo(
  state: AutoDisassemblyState,
  dt: number
): AutoDisassemblyState {
  if (!state.active) return state;
  const safeDt = Math.max(0, Math.min(0.08, dt));
  let { progress, direction, holdTimer } = state;

  if (holdTimer > 0) {
    holdTimer = Math.max(0, holdTimer - safeDt);
  } else {
    const speed = direction === 1 ? 0.26 : 0.32;
    progress += direction * speed * safeDt;
    if (progress >= 1.0) {
      progress = 1.0;
      direction = -1;
      holdTimer = 1.25; // Pause at full CAD explosion so user can admire trace lines
    } else if (progress <= 0.0) {
      progress = 0.0;
      direction = 1;
      holdTimer = 0.9; // Brief lockup pause before next cycle
    }
  }

  let currentStage: 0 | 1 | 2 | 3 | 4 = 0;
  let stageLabel = '总装咬合锁定';
  if (progress > 0.01 && progress <= 0.28) {
    currentStage = 1;
    stageLabel = direction === 1 ? '工序 I · 顶罩与感知舱垂直剥离' : '合拢 IV · 顶罩与感知舱落位咬合';
  } else if (progress > 0.28 && progress <= 0.54) {
    currentStage = 2;
    stageLabel = direction === 1 ? '工序 II · 左右推进/轮系横向对称拉开' : '合拢 III · 左右推进/轮系横向合拢';
  } else if (progress > 0.54 && progress <= 0.80) {
    currentStage = 3;
    stageLabel = direction === 1 ? '工序 III · 主轴转子/机械臂轴向级联展开' : '合拢 II · 主轴转子/机械臂轴向归位';
  } else if (progress > 0.80) {
    currentStage = 4;
    stageLabel = holdTimer > 0 ? '工序 IV · 全机正交爆炸悬停检视' : '工序 IV · 核心热端与内舱总成浮现';
  }

  return {
    active: true,
    progress,
    direction,
    holdTimer,
    currentStage,
    stageLabel
  };
}

/**
 * Computes rotation-invariant Oriented Bounding Box (OBB) principal dimensions `[lx, ly, lz]`
 * from a mesh's local geometry bounding box `[min, max]` and optional 4x4 world matrix column norms.
 * Eliminates world-AABB diagonal inflation on 45°-angled struts, rocker-bogie links, and articulated joints.
 */
export function computeLocalObbDimensions(
  localGeomMin: [number, number, number],
  localGeomMax: [number, number, number],
  worldMatrixElements?: ArrayLike<number>
): [number, number, number] {
  const rawX = Math.max(0, Math.abs((localGeomMax[0] || 0) - (localGeomMin[0] || 0)));
  const rawY = Math.max(0, Math.abs((localGeomMax[1] || 0) - (localGeomMin[1] || 0)));
  const rawZ = Math.max(0, Math.abs((localGeomMax[2] || 0) - (localGeomMin[2] || 0)));

  if (!worldMatrixElements || worldMatrixElements.length < 11) {
    return [rawX, rawY, rawZ];
  }

  const sx = Math.hypot(
    worldMatrixElements[0] || 0,
    worldMatrixElements[1] || 0,
    worldMatrixElements[2] || 0
  ) || 1;
  const sy = Math.hypot(
    worldMatrixElements[4] || 0,
    worldMatrixElements[5] || 0,
    worldMatrixElements[6] || 0
  ) || 1;
  const sz = Math.hypot(
    worldMatrixElements[8] || 0,
    worldMatrixElements[9] || 0,
    worldMatrixElements[10] || 0
  ) || 1;

  return [rawX * sx, rawY * sy, rawZ * sz];
}

/**
 * Reports geometry extents and explicit URDF identity. A known model envelope
 * permits a labelled scale estimate; an unknown scale stays unknown.
 */
export function computePartBlueprintMetadata(
  contextId: string,
  partName: string,
  layer: 'L1' | 'L2' | 'L3',
  subAssemblyLabel: string,
  normalizedBoxSize: [number, number, number],
  normalizedAssemblyMaxDim: number,
  tris: number,
  vertices: number,
  urdfJoints: UrdfJointDef[],
  localObbSize?: [number, number, number]
): PartBlueprintMetadata {
  const validExtents = (v: readonly number[] | undefined): v is [number, number, number] =>
    !!v && v.length === 3 && v.every(n => Number.isFinite(n) && n >= 0);
  const extents = validExtents(localObbSize) ? localObbSize : normalizedBoxSize;
  const dimensionsModelUnits: [number, number, number] | null =
    validExtents(extents) ? [extents[0], extents[1], extents[2]] : null;
  const refMaxMm = Object.prototype.hasOwnProperty.call(REAL_MAX_ENVELOPE_MM, contextId)
    ? REAL_MAX_ENVELOPE_MM[contextId] : undefined;
  const hasScale = Number.isFinite(refMaxMm) && refMaxMm! > 0 &&
    Number.isFinite(normalizedAssemblyMaxDim) && normalizedAssemblyMaxDim > 0;
  const dimensionsMm: [number, number, number] | null = hasScale && dimensionsModelUnits
    ? dimensionsModelUnits.map(v => Math.round(v * refMaxMm! / normalizedAssemblyMaxDim * 1000) / 1000) as [number, number, number]
    : null;

  // IDs are authoritative. Similar labels, case folding and invented mounts are
  // not evidence that a rendered part is a particular mechanical joint.
  const id = partName.trim().replace(/^\//, '');
  const matches = id ? urdfJoints.filter(j =>
    j.child.replace(/^\//, '') === id || j.name.replace(/^\//, '') === id) : [];
  const bindingStatus = matches.length === 1 ? 'bound' : matches.length ? 'ambiguous' : 'missing';
  const joint = bindingStatus === 'bound' ? matches[0] : null;
  return {
    partName, layer, subAssemblyLabel, dimensionsMm, dimensionsModelUnits,
    dimensionSource: dimensionsMm ? 'reference-envelope' : 'unknown',
    bindingStatus, tris, vertices,
    urdfLinkName: joint?.child ?? '',
    urdfJointName: joint?.name ?? '',
    urdfJointType: joint?.type.toUpperCase() ?? 'UNBOUND',
    urdfAxisText: joint ? `[${joint.axis.map(v => Number(v.toFixed(2))).join(', ')}]` : '未绑定'
  };
}
