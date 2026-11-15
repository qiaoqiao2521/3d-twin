import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANGAR_CAMERA_PRESETS,
  getHangarCameraPreset,
  evaluateSerialChainFk,
  solveCcdIkChain,
  extractManipulatorJointIndices,
  computeMoltenKerfColor,
  stepMoltenKerfTrail,
  IkJointLinkSpec
} from './ccdIkSolver';
import {
  createInitialBulletTimeState,
  stepBulletTimeController,
  createChronoStrobeScheduler,
  stepChronoStrobeScheduler,
  classifyFaultSubsystem,
  computeFaultTolerantAttitudeOffsets,
  applyFaultToUrdfJointAngle,
  computeFaultOscilloscopeHarmonic,
  evaluateSwarmTacticalState,
  computeCatenaryUmbilicalPoints,
  computeSlamElevationColor,
  computeFlirWhiteHotLuminance
} from './hallOfFameEngine';
import {
  RESTRAINED_BLOOM_CONFIG,
  GTAO_CONFIG,
  classifyPbrMaterialEnhancement,
  computeHaltonJitter2D,
  createPathTracerAccumulatorState,
  computeSceneStateSignature,
  stepPathTracerAccumulatorState
} from './hybridRayTracingMath';
import { UrdfJointDef } from './manifestUtils';

test('Hangar fixed camera presets expose Top-Down, Front-Side, and Isometric specs without gimbal lock', () => {
  assert.equal(HANGAR_CAMERA_PRESETS.length, 3);
  const topDown = getHangarCameraPreset('top-down');
  const frontSide = getHangarCameraPreset('front-side');
  const isometric = getHangarCameraPreset('isometric');

  assert.equal(topDown.shortEn, 'Top-Down');
  assert.equal(frontSide.shortEn, 'Front-Side');
  assert.equal(isometric.shortEn, 'Isometric');

  // Top-down avoids colinear Y-up gimbal lock
  assert.equal(topDown.up[1], 0);
  assert.ok(topDown.offset[1] > 3.0);
});

test('solveCcdIkChain converges < 0.02m on reachable 6-DOF serial target and respects URDF joint limits', () => {
  const chain: IkJointLinkSpec[] = [
    { name: 'waist_yaw', axis: [0, 1, 0], localOffset: [0, 0.1, 0], originQuat: [0, 0, 0, 1], lower: -2.8, upper: 2.8 },
    { name: 'shoulder_pitch', axis: [0, 0, 1], localOffset: [0, 0.15, 0], originQuat: [0, 0, 0, 1], lower: -1.6, upper: 1.6 },
    { name: 'elbow_pitch', axis: [0, 0, 1], localOffset: [0.35, 0, 0], originQuat: [0, 0, 0, 1], lower: -2.2, upper: 2.2 },
    { name: 'forearm_roll', axis: [1, 0, 0], localOffset: [0.28, 0, 0], originQuat: [0, 0, 0, 1], lower: -2.5, upper: 2.5 },
    { name: 'wrist_pitch', axis: [0, 0, 1], localOffset: [0.12, 0, 0], originQuat: [0, 0, 0, 1], lower: -1.8, upper: 1.8 },
    { name: 'wrist_yaw', axis: [0, 1, 0], localOffset: [0.08, 0, 0], originQuat: [0, 0, 0, 1], lower: -1.8, upper: 1.8 }
  ];
  const tipOffset: [number, number, number] = [0.1, 0, 0];
  const target: [number, number, number] = [0.52, 0.48, 0.26];

  let angles = [0, 0.1, -0.2, 0, 0, 0];
  let solved = solveCcdIkChain(chain, angles, target, tipOffset, 24, 0.45);
  for (let frame = 0; frame < 6; frame++) {
    solved = solveCcdIkChain(chain, solved.angles, target, tipOffset, 18, 0.45);
  }

  assert.ok(solved.residualDist < 0.02, `Expected IK residual < 0.02m, got ${solved.residualDist}`);
  for (let i = 0; i < chain.length; i++) {
    assert.ok(solved.angles[i] >= chain[i].lower - 1e-6 && solved.angles[i] <= chain[i].upper + 1e-6);
  }

  // Unreachable far target still strictly clamps every joint inside [lower, upper]
  const tightChain: IkJointLinkSpec[] = [
    { name: 'j1', axis: [0, 0, 1], localOffset: [0, 0, 0], originQuat: [0, 0, 0, 1], lower: -0.4, upper: 0.4 },
    { name: 'j2', axis: [0, 0, 1], localOffset: [0.3, 0, 0], originQuat: [0, 0, 0, 1], lower: -0.5, upper: 0.5 }
  ];
  const clamped = solveCcdIkChain(tightChain, [0, 0], [0, 5.0, 0], [0.2, 0, 0], 20, 0.5);
  assert.ok(clamped.angles[0] <= 0.400001 && clamped.angles[0] >= -0.400001);
  assert.ok(clamped.angles[1] <= 0.500001 && clamped.angles[1] >= -0.500001);

  const fkCheck = evaluateSerialChainFk(tightChain, clamped.angles, [0.2, 0, 0]);
  assert.equal(fkCheck.jointPositions.length, 2);
});

test('extractManipulatorJointIndices and stepMoltenKerfTrail handle URDF arms and plasma kerf cooling', () => {
  const sarJoints: UrdfJointDef[] = [
    { name: 'f_front_left', type: 'revolute', parent: 'base', child: 'flipper_fl', xyz: [0, 0, 0], rpy: [0, 0, 0], axis: [0, 1, 0], lower: -1, upper: 1 },
    { name: 'joint_1', type: 'revolute', parent: 'base', child: 'link_1', xyz: [0, 0, 0], rpy: [0, 0, 0], axis: [0, 0, 1], lower: -2, upper: 2 },
    { name: 'joint_2', type: 'revolute', parent: 'link_1', child: 'link_2', xyz: [0, 0, 0], rpy: [0, 0, 0], axis: [0, 1, 0], lower: -2, upper: 2 },
    { name: 'gripper_jaw_left', type: 'prismatic', parent: 'link_6', child: 'jaw_l', xyz: [0, 0, 0], rpy: [0, 0, 0], axis: [1, 0, 0], lower: 0, upper: 0.04 }
  ];
  const indices = extractManipulatorJointIndices('sar', sarJoints);
  assert.deepEqual(indices, [1, 2]);

  let kerf = stepMoltenKerfTrail([], 0.016, [0, 0, 0]);
  kerf = stepMoltenKerfTrail(kerf, 0.016, [0.06, 0, 0]);
  assert.equal(kerf.length, 2);
  const hotRgb = computeMoltenKerfColor(0.95);
  const coldRgb = computeMoltenKerfColor(0.05);
  assert.ok(hotRgb[0] > coldRgb[0] && hotRgb[1] > coldRgb[1]);

  // Advance cooling until fully pruned
  for (let k = 0; k < 90; k++) {
    kerf = stepMoltenKerfTrail(kerf, 0.1, null);
  }
  assert.equal(kerf.length, 0);
});

test('Bullet-Time 0.01x dilation, mid-air explosion snap-back, and Sandevistan 0.12s strobe schedule', () => {
  let bt = createInitialBulletTimeState();
  bt = { ...bt, active: true, explosionTarget: 0.88 };
  for (let i = 0; i < 40; i++) {
    bt = stepBulletTimeController(bt, 0.04);
  }
  assert.ok(bt.simTimeScale < 0.015, `Expected ~0.01x time dilation, got ${bt.simTimeScale}`);
  assert.ok(bt.explosionProgress > 0.85, `Expected exploded mid-air armor, got ${bt.explosionProgress}`);

  // Snap shut when Tab toggled off
  bt = { ...bt, active: false };
  for (let i = 0; i < 25; i++) {
    bt = stepBulletTimeController(bt, 0.04);
  }
  assert.ok(bt.simTimeScale > 0.99);
  assert.equal(bt.explosionProgress, 0);

  // Sandevistan 4D Strobe: <= 3 slots, captures immediately at t=0, waits 0.22s, <= 0.14 peak opacity, and fades out at 0.66s
  let sched = createChronoStrobeScheduler(3);
  assert.equal(sched.slots.length, 3);
  const r0 = stepChronoStrobeScheduler(sched, 0.016, true, true);
  assert.equal(r0.captureSlotIndex, 0);
  assert.ok(r0.next.slots[0].opacity <= 0.14);
  sched = r0.next;

  const r1 = stepChronoStrobeScheduler(sched, 0.08, true, true);
  assert.equal(r1.captureSlotIndex, -1);
  sched = r1.next;

  const r2 = stepChronoStrobeScheduler(sched, 0.08, true, true);
  assert.equal(r2.captureSlotIndex, -1);
  sched = r2.next;

  const r3 = stepChronoStrobeScheduler(sched, 0.08, true, true);
  assert.equal(r3.captureSlotIndex, 1);
  sched = r3.next;

  // Let ghosts decay past 0.66s
  for (let step = 0; step < 14; step++) {
    sched = stepChronoStrobeScheduler(sched, 0.06, false, false).next;
  }
  assert.ok(sched.slots.every((s) => !s.active && s.opacity === 0));
});

test('Fault injection reconfigures Limp-Home gait, ROV depth reallocation, CFM56 surge & oscilloscope harmonics', () => {
  const flClass = classifyFaultSubsystem('unitree_go2', 'FL_thigh_mesh', 'land');
  assert.equal(flClass.kind, 'limb_fl');

  const seaClass = classifyFaultSubsystem('bluerov2', 'thruster_1', 'sea');
  assert.equal(seaClass.kind, 'thruster');

  const airClass = classifyFaultSubsystem('b737_cfm56', 'hpc_rotor', 'air');
  assert.equal(airClass.kind, 'compressor_surge');

  const landFault = [{ partName: 'FL_thigh', kind: 'limb_fl' as const, injectedAtSimTime: 1.0, alertTitle: 'FAULT', compensationLaw: 'LIMP' }];
  const landAtt = computeFaultTolerantAttitudeOffsets(landFault, 2.5, 4.0, 3.2, 'land');
  assert.equal(landAtt.speedMultiplier, 0.78);
  assert.ok(landAtt.rollOffset > 0);

  // Broken FL thigh locks tucked upward while healthy FR thigh amplifies stride
  const lockedThigh = applyFaultToUrdfJointAngle(0.1, 'FL_thigh_joint', 0, landFault, 2.5, 4.0);
  const boostedHealthy = applyFaultToUrdfJointAngle(0.2, 'FR_thigh_joint', 3, landFault, 2.5, 4.0);
  assert.equal(lockedThigh, 1.18);
  assert.notEqual(boostedHealthy, 0.2);

  // Sea ROV reallocates thrusters after transient (>0.65s) and damps roll
  const seaFault = [{ partName: 'thruster_0', kind: 'thruster' as const, injectedAtSimTime: 0.0, alertTitle: 'FAULT', compensationLaw: 'REALLOC' }];
  const seaEarly = computeFaultTolerantAttitudeOffsets(seaFault, 0.15, 0, 2.0, 'sea');
  const seaSettled = computeFaultTolerantAttitudeOffsets(seaFault, 3.0, 0, 2.0, 'sea');
  assert.equal(seaEarly.rovReallocated, false);
  assert.equal(seaSettled.rovReallocated, true);
  assert.ok(Math.abs(seaSettled.rollOffset) < Math.abs(seaEarly.rollOffset));

  // Air CFM56 triggers compressor surge backfire (<1.25s) then Halon spray
  const airFault = [{ partName: 'hpc', kind: 'compressor_surge' as const, injectedAtSimTime: 0.0, alertTitle: 'SURGE', compensationLaw: 'HALON' }];
  const airSurge = computeFaultTolerantAttitudeOffsets(airFault, 0.6, 0, 10, 'air');
  assert.equal(airSurge.surgeBackfireActive, true);
  assert.equal(airSurge.halonSprayActive, true);

  // Oscilloscope harmonic jitter
  assert.equal(computeFaultOscilloscopeHarmonic(0.5, 1.2, false, 0), 0.5);
  assert.notEqual(computeFaultOscilloscopeHarmonic(0.5, 1.23, true, 0), 0.5);
});

test('Multi-GLB Swarm formation, Catenary Umbilical sag, and Machine-Eye SLAM/FLIR palettes', () => {
  const landSwarm = evaluateSwarmTacticalState('unitree_go2', 'land', 0, 0, 0, 0, 5.0, 4.5, [12, 0, 2]);
  assert.equal(landSwarm.wingmen.length, 2);
  const ids = new Set(['unitree_go2', ...landSwarm.wingmen.map((w) => w.actorId)]);
  assert.ok(ids.has('unitree_go2') && ids.has('sar') && ids.has('unitree_g1'));

  const seaSwarm = evaluateSwarmTacticalState('rexrov2', 'sea', 0, -4, 0, 0, 2.0, 1.0, [10, -4, 0]);
  assert.equal(seaSwarm.wingmen.length, 1);
  assert.equal(seaSwarm.wingmen[0].actorId, 'bluerov2');

  const tether = computeCatenaryUmbilicalPoints([0, 2, 0], [10, 2, 0], 0.0, 24);
  assert.equal(tether.length, 25);
  // Midpoint sags significantly below endpoints due to catenary gravity envelope
  assert.ok(tether[12][1] < tether[0][1] - 0.5);

  const lowCol = computeSlamElevationColor(-3.0);
  const highCol = computeSlamElevationColor(5.5);
  assert.ok(lowCol[2] > highCol[2] && highCol[0] > lowCol[0]);
  assert.ok(computeFlirWhiteHotLuminance('exhaust_or_target') > computeFlirWhiteHotLuminance('terrain'));
});

test('Dual-Gear Hybrid Ray-Tracing PBR classification, restrained bloom/GTAO, Halton QMC jitter, and 256-SPP convergence', () => {
  assert.ok(RESTRAINED_BLOOM_CONFIG.threshold >= 0.85);
  assert.ok(RESTRAINED_BLOOM_CONFIG.strength >= 0.15 && RESTRAINED_BLOOM_CONFIG.strength <= 0.25);
  assert.ok(GTAO_CONFIG.intensity >= 0.5);

  // Outer structural castings use matte bead-blasted anodized aluminum / powder-coat (roughness 0.45-0.70, low metalness)
  const casting = classifyPbrMaterialEnhancement('unitree_g1', 'torso_link', 'L1');
  assert.equal(casting.surfaceClass, 'anodized_aluminum');
  assert.ok(casting.roughness >= 0.45 && casting.roughness <= 0.70, `Expected matte casting roughness in [0.45,0.70], got ${casting.roughness}`);
  assert.ok(casting.metalness < 0.40);

  // Precision kinematic motion parts (rods, bearings, rails, harmonic actuators) retain high metalness (0.9+) & low roughness (0.1-0.2)
  const motionRod = classifyPbrMaterialEnhancement('unitree_g1', 'left_ankle_actuator_rod', 'L3');
  assert.equal(motionRod.surfaceClass, 'precision_steel_machined');
  assert.ok(motionRod.metalness >= 0.90);
  assert.ok(motionRod.roughness >= 0.10 && motionRod.roughness <= 0.20);

  const combustor = classifyPbrMaterialEnhancement('b737_cfm56', 'annular_combustor_core', 'L3');
  assert.equal(combustor.isEmissiveAreaLight, true);
  assert.equal(combustor.surfaceClass, 'emissive_combustor_core');

  const mmrtg = classifyPbrMaterialEnhancement('mars2020', 'mmrtg_heat_exchanger', 'L2');
  assert.equal(mmrtg.isEmissiveAreaLight, true);
  assert.equal(mmrtg.surfaceClass, 'emissive_mmrtg_core');

  const fanBlade = classifyPbrMaterialEnhancement('b737_cfm56', 'n1_wide_chord_titanium_fan', 'L1');
  assert.equal(fanBlade.surfaceClass, 'titanium_anisotropic');
  assert.ok(fanBlade.anisotropy > 0.7);
  assert.ok(fanBlade.metalness >= 0.90);

  const dome = classifyPbrMaterialEnhancement('bluerov2', 'front_acrylic_dome', 'L1');
  assert.equal(dome.surfaceClass, 'acrylic_pressure_dome');
  assert.equal(dome.clearcoat, 1.0);

  // Halton (2,3) sample 1 is centered, subsequent samples stay strictly within [-0.5, 0.5]^2
  assert.deepEqual(computeHaltonJitter2D(1), [0, 0]);
  for (let s = 2; s <= 32; s++) {
    const [jx, jy] = computeHaltonJitter2D(s);
    assert.ok(jx >= -0.5 && jx <= 0.5 && jy >= -0.5 && jy <= 0.5);
  }

  // Progressive accumulator converges monotonically to 256 SPP when stationary, and resets on movement
  const camIdentity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.5, 4.0, 1];
  const sigStatic = computeSceneStateSignature(camIdentity, 0, 1.0, 0.42);
  let ptState = createPathTracerAccumulatorState(256);

  for (let frame = 0; frame < 70; frame++) {
    ptState = stepPathTracerAccumulatorState(ptState, true, sigStatic, 4).next;
  }
  assert.equal(ptState.spp, 256);
  assert.equal(ptState.converged, true);

  // Moving camera or explosion slider resets SPP cleanly back to interactive preview
  const sigMoved = computeSceneStateSignature(camIdentity, 0.55, 1.0, 0.42);
  const resetStep = stepPathTracerAccumulatorState(ptState, true, sigMoved, 4);
  assert.equal(resetStep.didReset, true);
  assert.equal(resetStep.next.spp, 4);
  assert.equal(resetStep.next.converged, false);
});
