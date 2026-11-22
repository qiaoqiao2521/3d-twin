import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubAssemblyMatrix,
  computePartOrthogonalExplosionPlan,
  evaluateStagedExplosionOffset,
  stepAutoDisassemblyDemo,
  computePartBlueprintMetadata
} from './cadDisassemblyEngine';
import {
  SANDBOX_ACTORS,
  getSandboxActorSpec,
  sampleLandTerrainHeight,
  sampleLandTerrainNormal,
  sampleSeabedHeight,
  buildArenaWaypoints,
  createInitialKinematicState,
  stepSandboxKinematics,
  computeSandboxUrdfJointAngle
} from './actionSandboxEngine';

test('System 1: buildSubAssemblyMatrix generates 8-12 populated mechanical sub-assemblies across twins', () => {
  const cfm56Parts = [
    { name: 'acoustic_inlet_lip', tris: 1200, layer: 'L1' as const, center: [-0.8, 0, 0] as [number, number, number] },
    { name: 'kevlar_fan_containment_case', tris: 1800, layer: 'L1' as const, center: [-0.4, 0, 0] as [number, number, number] },
    { name: 'thrust_reverser_c_duct_port', tris: 1600, layer: 'L1' as const, center: [0.1, 0, 0.4] as [number, number, number] },
    { name: 'thrust_reverser_c_duct_stbd', tris: 1600, layer: 'L1' as const, center: [0.1, 0, -0.4] as [number, number, number] },
    { name: 'n1_wide_chord_titanium_fan', tris: 3400, layer: 'L2' as const, center: [-0.55, 0, 0] as [number, number, number] },
    { name: 'lpc_booster_4stage', tris: 2200, layer: 'L2' as const, center: [-0.3, 0, 0] as [number, number, number] },
    { name: 'ogv_outlet_guide_vanes', tris: 1900, layer: 'L2' as const, center: [-0.1, 0, 0] as [number, number, number] },
    { name: 'hpc_9stage_compressor', tris: 4100, layer: 'L2' as const, center: [0.18, 0, 0] as [number, number, number] },
    { name: 'sac_annular_combustor', tris: 2800, layer: 'L3' as const, center: [0.38, 0, 0] as [number, number, number] },
    { name: 'hpt_single_crystal_stage', tris: 2600, layer: 'L3' as const, center: [0.55, 0, 0] as [number, number, number] },
    { name: 'lpt_4stage_concentric_shaft', tris: 3100, layer: 'L3' as const, center: [0.72, 0, 0] as [number, number, number] },
    { name: 'chevron_exhaust_nozzle', tris: 1500, layer: 'L1' as const, center: [0.9, 0, 0] as [number, number, number] }
  ];

  const matrix = buildSubAssemblyMatrix('b737_cfm56', cfm56Parts);
  assert.equal(matrix.length, 12, 'CFM56 should produce 12 distinct mechanical sub-assemblies');
  const assignedCount = matrix.reduce((acc, s) => acc + s.partNames.length, 0);
  assert.equal(assignedCount, cfm56Parts.length, 'Every real GLB mesh must belong to a sub-assembly');
});

test('System 1: 4-stage orthogonal explosion gating, surgical peel, and auto-disassembly state machine', () => {
  const sarParts = [
    { name: 'lidar_dome_top', tris: 900, layer: 'L2' as const, center: [0, 0.4, 0] as [number, number, number] },
    { name: 'left_track_wheel_1', tris: 1100, layer: 'L1' as const, center: [0, -0.1, 0.35] as [number, number, number] },
    { name: 'ar4_link_3', tris: 950, layer: 'L2' as const, center: [0.3, 0.25, 0] as [number, number, number] },
    { name: 'main_chassis_core', tris: 2400, layer: 'L3' as const, center: [-0.2, 0, 0] as [number, number, number] }
  ];
  const subs = buildSubAssemblyMatrix('sar', sarParts);

  const stage1Plan = computePartOrthogonalExplosionPlan('sar', 'lidar_dome_top', 'L2', [0, 0.4, 0], subs);
  const stage4Plan = computePartOrthogonalExplosionPlan('sar', 'main_chassis_core', 'L3', [-0.2, 0, 0], subs);
  assert.equal(stage1Plan.stage, 1);
  assert.equal(stage4Plan.stage, 4);

  // At progress 0, peel 0 => exact zero offset
  assert.deepEqual(evaluateStagedExplosionOffset(stage1Plan, 0, 0), [0, 0, 0]);

  // At progress 0.25, Stage 1 has already lifted along +Y while Stage 4 is still locked at 0!
  const s1At25 = evaluateStagedExplosionOffset(stage1Plan, 0.25, 0);
  const s4At25 = evaluateStagedExplosionOffset(stage4Plan, 0.25, 0);
  assert.ok(s1At25[1] > 0.4, 'Stage 1 sensor pod must lift vertically in early stage');
  assert.deepEqual(s4At25, [0, 0, 0], 'Stage 4 core must stay locked until final stage');

  // Surgical peel at explosionProgress=0 cleanly extracts just that single part
  const peeled = evaluateStagedExplosionOffset(stage1Plan, 0, 1.0);
  assert.ok(Math.hypot(peeled[0], peeled[1], peeled[2]) > 0.55, 'Single-part peel must extract >= 0.55 normalized units');

  // Auto-disassembly demo cycles 0 -> 1 -> hold -> reverse
  let demo = {
    active: true,
    progress: 0,
    direction: 1 as 1 | -1,
    holdTimer: 0,
    currentStage: 0 as 0 | 1 | 2 | 3 | 4,
    stageLabel: ''
  };
  for (let i = 0; i < 72; i++) {
    demo = stepAutoDisassemblyDemo(demo, 0.06);
  }
  assert.equal(demo.progress, 1.0, 'Auto disassembly reaches full explosion plateau');
  assert.equal(demo.direction, -1, 'Auto disassembly switches direction to re-assemble');
  assert.equal(demo.currentStage, 4);

  for (let i = 0; i < 48; i++) {
    demo = stepAutoDisassemblyDemo(demo, 0.06);
  }
  assert.ok(demo.progress < 0.5, 'Auto disassembly smoothly re-assembles after hold pause');
});

test('System 1: computePartBlueprintMetadata labels a reference estimate and binds an exact URDF ID', () => {
  const meta = computePartBlueprintMetadata(
    'unitree_go2',
    'FL_thigh',
    'L2',
    '左前腿 FL 三轴高动态关节链',
    [0.24, 0.11, 0.09],
    1.0,
    4820,
    2650,
    [
      {
        name: 'FL_thigh_joint',
        type: 'revolute',
        parent: 'FL_hip',
        child: 'FL_thigh',
        xyz: [0, 0, 0],
        rpy: [0, 0, 0],
        axis: [0, 1, 0],
        lower: -1.57,
        upper: 3.49
      }
    ]
  );

  assert.equal(meta.dimensionSource, 'reference-envelope');
  assert.equal(meta.bindingStatus, 'bound');
  assert.ok(meta.dimensionsMm);
  assert.ok(meta.dimensionsMm[0] > 100 && meta.dimensionsMm[0] < 300);
  assert.equal(meta.urdfLinkName, 'FL_thigh');
  assert.equal(meta.urdfJointName, 'FL_thigh_joint');
  assert.equal(meta.urdfJointType, 'REVOLUTE');
  assert.equal(meta.urdfAxisText, '[0, 1, 0]');
});

test('System 2: Land, Sea, and Air sandbox kinematics, reverse thrust C-duct, and autonomous patrol fire/scan', () => {
  assert.ok(SANDBOX_ACTORS.length >= 8);

  // Terrain analytical height & unit normal
  const nrm = sampleLandTerrainNormal(12, -8);
  assert.ok(Math.abs(Math.hypot(nrm[0], nrm[1], nrm[2]) - 1.0) < 1e-5, 'Terrain normal must be unit-length');
  assert.ok(sampleSeabedHeight(5, 5) < -2.0, 'Seabed must sit below mid-water swim zone');

  // Land quadruped sprint + jump
  const go2 = getSandboxActorSpec('unitree_go2');
  const landWps = buildArenaWaypoints('land');
  let go2Kin = createInitialKinematicState(go2);
  go2Kin = stepSandboxKinematics(
    go2Kin,
    { forward: true, backward: false, left: false, right: true, up: true, down: false, sprint: true },
    go2,
    landWps,
    0.04,
    true,
    0
  );
  assert.equal(go2Kin.isGrounded, false, 'Jump impulse lifts quadruped airborne');
  assert.ok(go2Kin.vy > 5.0);

  // Air turbofan Mach afterburner & Reverse thrust C-duct actuation
  const cfm = getSandboxActorSpec('b737_cfm56');
  const airWps = buildArenaWaypoints('air');
  let airKin = createInitialKinematicState(cfm);
  for (let i = 0; i < 30; i++) {
    airKin = stepSandboxKinematics(
      airKin,
      { forward: false, backward: true, left: false, right: false, up: false, down: false, sprint: false },
      cfm,
      airWps,
      0.05
    );
  }
  assert.equal(airKin.isBrakingReverse, true);
  assert.ok(airKin.reverserStroke > 0.85, 'Pressing S in Air sandbox smoothly opens CFM56 C-duct thrust reverser');

  // Autonomous patrol (Key P) emits scan + weapon fire upon waypoint arrival
  const rov = getSandboxActorSpec('bluerov2');
  const seaWps = buildArenaWaypoints('sea');
  let rovKin = createInitialKinematicState(rov);
  rovKin.autoPatrol = true;
  rovKin.x = seaWps[0].x - 1.2;
  rovKin.y = seaWps[0].y;
  rovKin.z = seaWps[0].z;

  rovKin = stepSandboxKinematics(
    rovKin,
    { forward: false, backward: false, left: false, right: false, up: false, down: false, sprint: false },
    rov,
    seaWps,
    0.04
  );
  assert.equal(rovKin.emittedAutoScan, true, 'Auto-patrol emits pulse radar scan at waypoint');
  assert.equal(rovKin.emittedAutoFire, true, 'Auto-patrol fires tactical weapon at waypoint');

  // URDF procedural joint excitation stays finite and within joint bounds
  const angle = computeSandboxUrdfJointAngle(
    'unitree_g1',
    {
      name: 'left_knee_joint',
      type: 'revolute',
      parent: 'left_thigh',
      child: 'left_shin',
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
      axis: [0, 1, 0],
      lower: -0.1,
      upper: 2.1
    },
    3,
    { ...go2Kin, isGrounded: true, speed: 5.2, gaitDistance: 4.1 },
    1.5,
    0
  );
  assert.ok(Number.isFinite(angle) && angle >= -0.1 && angle <= 2.1);
});
