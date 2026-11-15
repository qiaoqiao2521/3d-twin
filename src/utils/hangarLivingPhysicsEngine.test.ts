import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialHangarGazeState,
  stepHangarGazeTracking,
  computeHangarGazeUrdfDelta,
  createInitialPushRecoveryState,
  triggerPushRecoveryImpulse,
  stepPushRecoveryState,
  computePushRecoveryUrdfDelta,
  isHighLoadPushJointPart,
  triggerAssemblySnapShake,
  stepAssemblySnapShake,
  createInitialHangarMpcWalkState,
  setMpcFloorTarget,
  stepHangarMpcWalk,
  reconcileHangarStateTransition,
  shouldAutoRevealInternalSkeleton,
  MICRO_FPV_SAFE_EXPLOSION_RATIO,
  buildSafeWorldBBoxFpvWaypoints
} from './hangarLivingPhysicsEngine';
import { UrdfJointDef } from './manifestUtils';

function mockJoint(name: string, child = `${name}_link`): UrdfJointDef {
  return {
    name,
    type: 'revolute',
    parent: 'base_link',
    child,
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 1, 0],
    lower: -2.5,
    upper: 2.5
  };
}

test('Module 3: Hangar Gaze Tracking smoothly follows cursor in standby and pauses during explosion or isolation', () => {
  let gaze = createInitialHangarGazeState();
  for (let i = 0; i < 10; i++) {
    gaze = stepHangarGazeTracking(gaze, {
      dt: 0.033,
      cursorValid: true,
      pointerNdcX: 0.75,
      pointerNdcY: -0.4,
      explosion: 0,
      isolatedPart: null,
      microFpvActive: false,
      ultimateActive: false
    });
  }
  assert.equal(gaze.active, true);
  assert.ok(gaze.yawRad > 0.25);
  assert.ok(computeHangarGazeUrdfDelta('unitree_g1', mockJoint('head_yaw_joint', 'head_link'), gaze) > 0.15);

  // Exploding model > 0.015 automatically returns gaze smoothly back to neutral
  for (let i = 0; i < 20; i++) {
    gaze = stepHangarGazeTracking(gaze, {
      dt: 0.05,
      cursorValid: true,
      pointerNdcX: 0.75,
      pointerNdcY: -0.4,
      explosion: 0.45,
      isolatedPart: null,
      microFpvActive: false,
      ultimateActive: false
    });
  }
  assert.equal(gaze.active, false);
  assert.ok(Math.abs(gaze.yawRad) < 0.01);
});

test('Module 3: Push-Recovery Impulse triggers 2nd-order balance recovery, counterweight arms, thermal spike & torque surge', () => {
  let push = createInitialPushRecoveryState();
  push = triggerPushRecoveryImpulse(push, {
    contactWorld: [0, 0.5, 0.2],
    pushDirWorld: [0, 0, 1],
    forceNewtons: 240,
    impactPartName: 'torso_link',
    robotYaw: 0
  });

  assert.equal(push.active, true);
  assert.equal(push.forceNewtons, 240);
  assert.ok(push.arrowVisibleTimer > 1.2);
  assert.equal(push.thermalSpike01, 1.0);
  assert.equal(push.powerArteryBoost, 1.0);
  assert.ok(push.telemetryTorqueSpikeNm > 100);

  // Step 0.18s into push -> CoM tilts, knees flex, and arms flare outward
  for (let i = 0; i < 6; i++) {
    push = stepPushRecoveryState(push, 0.03);
  }
  const kneeFlex = computePushRecoveryUrdfDelta('unitree_g1', mockJoint('left_knee_joint'), push);
  const armFlare = computePushRecoveryUrdfDelta('unitree_g1', mockJoint('left_shoulder_roll_joint'), push);
  assert.ok(kneeFlex > 0.25, `Expected stabilizing knee flexion, got ${kneeFlex}`);
  assert.ok(armFlare > 0.15, `Expected counterweight arm flare, got ${armFlare}`);
  assert.equal(isHighLoadPushJointPart('left_knee_link'), true);

  // Step 2.2s -> robot recovers cleanly back to upright equilibrium
  for (let i = 0; i < 60; i++) {
    push = stepPushRecoveryState(push, 0.04);
  }
  assert.equal(push.active, false);
  assert.equal(push.tiltPitch, 0);
});

test('Module 3: Assembly Snap-Back Shake & Floor-Click MPC Predictive Walk converge cleanly', () => {
  const snap0 = triggerAssemblySnapShake(1.2);
  const step1 = stepAssemblySnapShake(snap0, 0.02);
  assert.ok(step1.offsetY < 0 || Math.abs(step1.pitchRad) > 0);

  let walk = createInitialHangarMpcWalkState();
  walk = setMpcFloorTarget(walk, 1.2, 0.9);
  assert.equal(walk.hasTarget, true);
  assert.equal(walk.isWalking, true);

  for (let i = 0; i < 120; i++) {
    walk = stepHangarMpcWalk(walk, 0.033);
  }
  assert.equal(walk.isWalking, false);
  assert.ok(Math.hypot(walk.x - 1.2, walk.z - 0.9) < 0.06);
  assert.ok(walk.gaitDistance > 1.5);
});

test('Module 4: Global Hangar State Coordinator enforces [C] 18% explosion clamp, clip reset, and Optical Section auto-skeleton reveal', () => {
  // Bug repro: previously 100% explosion + active sectioning caused [C] to fly in black empty void!
  const brokenBefore = {
    explosion: 1.0,
    clipRatio: 0.32,
    autoSectionScan: true,
    autoDisassembly: true,
    microFpvActive: false,
    isolatedPart: 'head_link'
  };

  const afterMicroFpv = reconcileHangarStateTransition(brokenBefore, { type: 'enter_micro_fpv' });
  assert.equal(afterMicroFpv.microFpvActive, true);
  assert.equal(afterMicroFpv.explosion, MICRO_FPV_SAFE_EXPLOSION_RATIO);
  assert.equal(afterMicroFpv.clipRatio, 1.0);
  assert.equal(afterMicroFpv.autoSectionScan, false);
  assert.equal(afterMicroFpv.isolatedPart, null);

  // Optical sectioning < 0.985 automatically reveals internal cyan URDF skeleton so model is never "only two severed feet"!
  assert.equal(shouldAutoRevealInternalSkeleton(false, 0.48, false, null, false), true);
  assert.equal(shouldAutoRevealInternalSkeleton(false, 1.0, false, null, false), false);

  // Entering standalone mode (e.g., SLS 3D Print or Push Test) smoothly resets clipRatio back to 1.0
  const afterStandalone = reconcileHangarStateTransition(
    { ...afterMicroFpv, clipRatio: 0.45, microFpvActive: false },
    { type: 'enter_standalone_mode', mode: 'sls_print' }
  );
  assert.equal(afterStandalone.clipRatio, 1.0);

  const fpvRoute = buildSafeWorldBBoxFpvWaypoints('unitree_g1', [-0.4, 0, -0.35], [0.4, 1.35, 0.35]);
  assert.equal(fpvRoute.points.length, 8);
  assert.equal(fpvRoute.labels.length, 8);
});
