import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dampValue,
  formatSimClock,
  computeFresnelPulseIntensity,
  computeRobotLiveJointTarget,
  computeAeroFadecTargets,
  computeMarsLiveTargets,
  computeThermalIrColor,
  estimatePartThermalNormalized,
  buildSpatialTelemetryProbes,
  computeCalloutLeaderGeometry,
  sampleTelemetryWaveforms
} from './liveTwinEngine';
import { UrdfJointDef } from './manifestUtils';

test('dampValue smoothly interpolates toward target and clamps dt', () => {
  const halfStep = dampValue(0, 10, 8, 0.05);
  assert.ok(halfStep > 0 && halfStep < 10);
  assert.equal(dampValue(5, 5, 10, 0.016), 5);
  assert.equal(dampValue(2, 10, 8, 0), 2);
});

test('formatSimClock formats simulation clock with 14m20s mission offset', () => {
  assert.equal(formatSimClock(8.425), '00:14:28.42');
  assert.equal(formatSimClock(0), '00:14:20.00');
});

test('computeFresnelPulseIntensity peaks during 1.2s scan and settles to 0.24', () => {
  assert.equal(computeFresnelPulseIntensity(-0.1), 0);
  const peak = computeFresnelPulseIntensity(0.22);
  assert.ok(peak > 0.95 && peak <= 1.0);
  assert.equal(computeFresnelPulseIntensity(1.5), 0.24);
});

test('computeRobotLiveJointTarget respects URDF revolute limits and continuous thruster/sonar joints', () => {
  const revoluteJoint: UrdfJointDef = {
    name: 'fl_thigh_joint',
    type: 'revolute',
    parent: 'fl_hip',
    child: 'fl_thigh',
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 1, 0],
    lower: -0.5,
    upper: 1.2
  };

  for (let t = 0; t <= 6; t += 0.35) {
    const idleAngle = computeRobotLiveJointTarget('unitree_go2', revoluteJoint, 1, 'idle', t);
    const patrolAngle = computeRobotLiveJointTarget('unitree_go2', revoluteJoint, 1, 'patrol', t);
    const sweepAngle = computeRobotLiveJointTarget('unitree_go2', revoluteJoint, 1, 'sweep', t);

    assert.ok(idleAngle >= revoluteJoint.lower && idleAngle <= revoluteJoint.upper);
    assert.ok(patrolAngle >= revoluteJoint.lower && patrolAngle <= revoluteJoint.upper);
    assert.ok(sweepAngle >= revoluteJoint.lower && sweepAngle <= revoluteJoint.upper);
  }

  const thrusterJoint: UrdfJointDef = {
    name: 'thruster_1_joint',
    type: 'continuous',
    parent: 'base_link',
    child: 'thruster_1_prop',
    xyz: [0.2, 0.2, 0],
    rpy: [0, 0, 0],
    axis: [0, 0, 1],
    lower: -Math.PI,
    upper: Math.PI
  };
  const propA = computeRobotLiveJointTarget('bluerov2', thrusterJoint, 0, 'patrol', 0.2);
  const propB = computeRobotLiveJointTarget('bluerov2', thrusterJoint, 0, 'patrol', 0.4);
  assert.notEqual(propA, propB);
  assert.ok(propA >= -Math.PI && propA <= Math.PI);
});

test('computeAeroFadecTargets enforces N2 > N1 differential spool ratio and Reverse deployment', () => {
  const idle = computeAeroFadecTargets('idle_24');
  const cruise = computeAeroFadecTargets('cruise_78');
  const toga = computeAeroFadecTargets('toga_100');
  const rev = computeAeroFadecTargets('reverse');

  assert.ok(idle.n1Rpm < cruise.n1Rpm && cruise.n1Rpm < toga.n1Rpm);
  assert.ok(idle.egtCelsius < cruise.egtCelsius && cruise.egtCelsius < toga.egtCelsius);
  assert.ok(toga.n2SpinRadS > toga.n1SpinRadS * 2.0);
  assert.equal(cruise.reverserStroke, 0);
  assert.equal(rev.reverserStroke, 1);
});

test('computeMarsLiveTargets differentiates traverse, coring, and panorama regimes', () => {
  const traverse = computeMarsLiveTargets('traverse', 1.2);
  const coring = computeMarsLiveTargets('coring', 1.2);
  const panorama = computeMarsLiveTargets('panorama', 1.2);

  assert.ok(traverse.wheelSpinRadS > panorama.wheelSpinRadS);
  assert.equal(coring.wheelSpinRadS, 0);
  assert.ok(coring.armPitch > traverse.armPitch);
});

test('computeThermalIrColor and estimatePartThermalNormalized map cold intake to hot combustor/MMRTG', () => {
  const coldRgb = computeThermalIrColor(0.05);
  const hotRgb = computeThermalIrColor(0.95);
  assert.ok(coldRgb[2] > coldRgb[0], 'Cryo intake should be blue-dominant');
  assert.ok(hotRgb[0] > hotRgb[2], 'Incandescent core should be red/warm-dominant');

  const fanTemp = estimatePartThermalNormalized('b737_cfm56', 'n1_wide_chord_titanium_fan', 'L2', 0.9);
  const combTemp = estimatePartThermalNormalized('b737_cfm56', 'annular_combustor_liner', 'L3', 0.9);
  assert.ok(combTemp > fanTemp + 0.5);

  const rtgTemp = estimatePartThermalNormalized('mars2020', 'mmrtg_housing', 'L3', 0.7, -0.5);
  const wheelTemp = estimatePartThermalNormalized('mars2020', 'wheel_fl', 'L1', 0.7, 0.4);
  assert.ok(rtgTemp > wheelTemp + 0.4);
});

test('buildSpatialTelemetryProbes, computeCalloutLeaderGeometry, and sampleTelemetryWaveforms return valid HUD structures', () => {
  for (const ctx of ['b737_cfm56', 'mars2020', 'bluerov2', 'rexrov2', 'unitree_g1', 'sar']) {
    const probes = buildSpatialTelemetryProbes(ctx, 2.5, 0.75);
    assert.equal(probes.length, 4, `Expected 4 spatial callouts for ${ctx}`);
    for (const p of probes) {
      assert.ok(p.label.length > 0);
      assert.ok(p.primaryValue.length > 0);
    }

    const wave = sampleTelemetryWaveforms(ctx, 2.5, 0.75);
    assert.ok(wave.ch1Value >= 0 && wave.ch1Value <= 1);
    assert.ok(wave.ch2Value >= 0 && wave.ch2Value <= 1);
    assert.ok(wave.ch3Value >= 0 && wave.ch3Value <= 1);
    assert.ok(wave.protocolBadge.length > 0);
  }

  const leader = computeCalloutLeaderGeometry(520, 310, 1024, 720, 0);
  assert.equal(leader.yEnd, leader.yElbow);
  assert.notEqual(leader.xElbow, leader.x0);
});
