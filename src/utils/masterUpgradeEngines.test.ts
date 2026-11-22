import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_LIGHTING_PRESETS,
  evToLinearExposureMultiplier,
  computeSmartFocusDistanceMeters,
  stepFrameBudgetGuard
} from './cinemaOpticsPipeline';
import {
  evaluateScientificColorMap,
  computeLinkVonMisesStress,
  computeConvexHull2D,
  computeRobotComAndSupportPolygon,
  computeCalibratedFlirTemperatureC
} from './scientificVizEngine';
import {
  triggerNaniteSpawnSweep,
  stepNaniteState,
  triggerTacticalPulseWave,
  stepTacticalPulseWave
} from './scifiVfxShaders';
import {
  stepCriticallyDampedSpring3D,
  triggerCameraMicroImpulse,
  stepCameraMicroImpulse,
  detectJointLimitProximity,
  evaluateCinemaMacroPose
} from './tactileCameraRig';

test('cinemaOpticsPipeline: EV exposure multiplier and studio lighting presets are physically bounded', () => {
  assert.equal(Object.keys(STUDIO_LIGHTING_PRESETS).length, 4);
  assert.ok(Math.abs(evToLinearExposureMultiplier(0) - 1.0) < 1e-6);
  assert.ok(Math.abs(evToLinearExposureMultiplier(1.0) - 2.0) < 1e-6);
  assert.ok(Math.abs(evToLinearExposureMultiplier(-1.0) - 0.5) < 1e-6);

  const focusDist = computeSmartFocusDistanceMeters([0, 1.5, 3], [0, 1.5, 0.5]);
  assert.ok(Math.abs(focusDist - 2.5) < 1e-6);

  const smoothBudget = stepFrameBudgetGuard(14.0, 0.015, true, false);
  assert.equal(smoothBudget.isThrottled, false);
  assert.equal(smoothBudget.qualityScale, 1.0);

  const overloadedBudget = stepFrameBudgetGuard(30.0, 0.035, true, false);
  assert.equal(overloadedBudget.isThrottled, true);
  assert.ok(overloadedBudget.anamorphicTapScale < 0.7);
});

test('scientificVizEngine: illustrative load score responds to push-recovery impulse and colormaps stay in [0, 1]', () => {
  for (const map of ['turbo', 'viridis', 'jet'] as const) {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = evaluateScientificColorMap(v, map);
      assert.ok(r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1);
    }
  }

  const idleHip = computeLinkVonMisesStress({
    partName: 'left_hip_pitch_link',
    layer: 'L2',
    cantileverDistMeters: 0.25,
    jointOmegaRadS: 0.1,
    loadFactor: 0.1,
    pushSpike01: 0
  });
  const impactedHip = computeLinkVonMisesStress({
    partName: 'left_hip_pitch_link',
    layer: 'L2',
    cantileverDistMeters: 0.25,
    jointOmegaRadS: 2.2,
    loadFactor: 0.75,
    pushSpike01: 0.9,
    isImpactTarget: true
  });
  assert.ok(impactedHip.sigma01 > idleHip.sigma01);
  assert.ok(impactedHip.stressMpa > idleHip.stressMpa);
  assert.equal(impactedHip.evidence, 'illustrative');
  assert.equal(impactedHip.unit, null);
});

test('scientificVizEngine: CoM, ZMP, convex support polygon, and calibrated FLIR temperatures', () => {
  const hull = computeConvexHull2D([
    [-0.2, -0.2],
    [0.2, -0.2],
    [0.2, 0.2],
    [-0.2, 0.2],
    [0.0, 0.0]
  ]);
  assert.equal(hull.length, 4);

  const stableCom = computeRobotComAndSupportPolygon({
    samples: [
      { partName: 'torso', worldPos: [0, 0.85, 0], volumeWeight: 5.0, isGroundContactCandidate: false },
      ...[[-0.18, -0.15], [-0.18, 0.15], [0.18, -0.15], [0.18, 0.15]].map(([x, z], i) => ({
        partName: `declared_contact_${i}`, worldPos: [x, 0.02, z] as [number, number, number],
        volumeWeight: 0.5, isGroundContactCandidate: true
      }))
    ],
    floorY: 0,
    comAccelXZ: [0, 0]
  });
  assert.equal(stableCom.statusLevel, 'stable');

  const pushedCom = computeRobotComAndSupportPolygon({
    samples: [
      { partName: 'torso', worldPos: [0, 0.85, 0], volumeWeight: 5.0, isGroundContactCandidate: false },
      ...[[-0.18, -0.15], [-0.18, 0.15], [0.18, -0.15], [0.18, 0.15]].map(([x, z], i) => ({
        partName: `declared_contact_${i}`, worldPos: [x, 0.02, z] as [number, number, number],
        volumeWeight: 0.5, isGroundContactCandidate: true
      }))
    ],
    floorY: 0,
    comAccelXZ: [5.5, 4.5]
  });
  assert.ok(pushedCom.stabilityMargin01 < stableCom.stabilityMargin01);

  const rtgTemp = computeCalibratedFlirTemperatureC({
    contextId: 'mars2020',
    partName: 'mmrtg_power_core',
    layer: 'L3',
    loadFactor: 0.6
  });
  assert.ok(rtgTemp.tempC > 190);
});

test('scifiVfxShaders: 0.65s Nanite spawn sweep and Tactical Pulse Wave progress cleanly to completion', () => {
  let nanite = triggerNaniteSpawnSweep(0.65);
  let frame = stepNaniteState(nanite, 0.05, -0.5, 1.1, false, 0);
  for (let i = 0; i < 5; i++) {
    frame = stepNaniteState(frame.nextState, 0.05, -0.5, 1.1, false, 0);
  }
  assert.equal(frame.active, true);
  assert.ok(frame.sweepWorldY > -0.5 && frame.sweepWorldY < 1.35);

  for (let i = 0; i < 10; i++) {
    frame = stepNaniteState(frame.nextState, 0.05, -0.5, 1.1, false, 0);
  }
  assert.equal(frame.nextState.mode, 'idle');
  assert.equal(frame.active, false);

  let pulse = triggerTacticalPulseWave([1, -2], 1.6);
  for (let i = 0; i < 8; i++) {
    pulse = stepTacticalPulseWave(pulse, 0.06, 12.0);
  }
  assert.equal(pulse.active, true);
  assert.ok(pulse.radiusMeters > 1.5);
  for (let i = 0; i < 20; i++) {
    pulse = stepTacticalPulseWave(pulse, 0.08, 12.0);
  }
  assert.equal(pulse.active, false);
});

test('tactileCameraRig: critically damped spring, micro-impulse, joint limit >=92% detection, and 6s cinema macros', () => {
  let spring: { pos: [number, number, number]; vel: [number, number, number] } = {
    pos: [0, 0, 0],
    vel: [0, 0, 0]
  };
  for (let i = 0; i < 40; i++) {
    spring = stepCriticallyDampedSpring3D(spring, [2, -1, 3], 12.0, 0.025);
  }
  assert.ok(Math.abs(spring.pos[0] - 2) < 0.01);
  assert.ok(Math.abs(spring.pos[1] + 1) < 0.01);

  const imp0 = triggerCameraMicroImpulse(0.8, [1, 0, 0], 0.12);
  let impStep = stepCameraMicroImpulse(imp0, 0.03);
  assert.ok(impStep.vignette01 > 0.1);
  for (let i = 0; i < 5; i++) {
    impStep = stepCameraMicroImpulse(impStep.next, 0.03);
  }
  assert.equal(impStep.vignette01, 0);

  const safeJoint = detectJointLimitProximity(0.2, -1.0, 1.0, 'revolute');
  assert.equal(safeJoint.nearLimit, false);
  const nearStopJoint = detectJointLimitProximity(0.95, -1.0, 1.0, 'revolute');
  assert.equal(nearStopJoint.nearLimit, true);
  assert.equal(nearStopJoint.severity, 'amber');

  const macroMid = evaluateCinemaMacroPose(
    'top_down_disassembly',
    3.0,
    [-0.5, 0, -0.5],
    [0.5, 1.6, 0.5],
    1.1
  );
  assert.equal(macroMid.active, true);
  assert.ok((macroMid.suggestedExplosion ?? 0) > 0.5);
});
