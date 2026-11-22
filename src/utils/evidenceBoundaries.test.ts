import test from 'node:test';
import assert from 'node:assert/strict';
import { computePartBlueprintMetadata } from './cadDisassemblyEngine';
import { computeRobotComAndSupportPolygon, computeLinkVonMisesStress, type PartMassSample } from './scientificVizEngine';
import { buildSpatialTelemetryProbes, sampleTelemetryWaveforms } from './liveTwinEngine';
import type { UrdfJointDef } from './manifestUtils';

const joint: UrdfJointDef = {
  name: 'shoulder_joint', type: 'revolute', parent: 'torso', child: 'shoulder',
  xyz: [0, 0, 0], rpy: [0, 0, 0], axis: [0, 1, 0], lower: -1, upper: 1
};
const metadata = (context: string, id = 'shoulder', joints = [joint], scale = 1) =>
  computePartBlueprintMetadata(context, id, 'L2', 'inspection', [.001, .1, .2], scale, 12, 8, joints);

test('virtual or unregistered geometry never acquires a 1500mm physical scale', () => {
  for (const id of ['iron:grimlock', 'unknown', '__proto__']) {
    const result = metadata(id);
    assert.equal(result.dimensionsMm, null);
    assert.equal(result.dimensionSource, 'unknown');
    assert.deepEqual(result.dimensionsModelUnits, [.001, .1, .2]);
  }
  assert.equal(metadata('unitree_go2', 'shoulder', [joint], 0).dimensionsMm, null);
});

test('known envelopes remain labelled estimates and do not inflate small parts to 4mm', () => {
  const result = metadata('unitree_go2');
  assert.equal(result.dimensionSource, 'reference-envelope');
  assert.ok(result.dimensionsMm);
  assert.equal(result.dimensionsMm[0], .7);
});

test('joint metadata requires one exact identity, never a similar label or guessed mount', () => {
  assert.equal(metadata('unitree_go2').bindingStatus, 'bound');
  for (const name of ['shoulder_shell', 'left_shoulder', 'Shoulder', 'arm']) {
    const result = metadata('unitree_go2', name);
    assert.equal(result.bindingStatus, 'missing');
    assert.equal(result.urdfJointName, '');
    assert.equal(result.urdfJointType, 'UNBOUND');
  }
  const ambiguous = metadata('unitree_go2', 'shoulder', [joint, { ...joint, name: 'other_joint' }]);
  assert.equal(ambiguous.bindingStatus, 'ambiguous');
  assert.equal(ambiguous.urdfJointName, '');
  assert.equal(metadata('mars2020', 'wheel', []).urdfJointType, 'UNBOUND');
});

test('missing, two-point, collinear or invalid support data cannot produce stable', () => {
  const sample = (x: number, z: number, contact = true): PartMassSample => ({
    partName: 'contact', worldPos: [x, 0, z], volumeWeight: 1, isGroundContactCandidate: contact
  });
  const cases: PartMassSample[][] = [
    [], [sample(0, 0)], [sample(-.2, 0), sample(.2, 0)],
    [sample(-.2, 0), sample(0, 0), sample(.2, 0)],
    [sample(-.2, -.2, false), sample(.2, -.2, false), sample(0, .2, false)],
    [sample(NaN, 0), sample(Infinity, 0)]
  ];
  for (const samples of cases) {
    const result = computeRobotComAndSupportPolygon({ samples, floorY: 0 });
    assert.equal(result.statusLevel, 'unknown');
    assert.equal(result.supportAvailable, false);
    assert.deepEqual(result.supportHull2D, []);
    assert.equal(result.evidence, 'illustrative');
    assert.ok(result.comWorld.every(Number.isFinite));
  }
});

test('authored stress colour is identified as an illustrative score without a physical unit', () => {
  const result = computeLinkVonMisesStress({ partName: 'hip', layer: 'L2',
    cantileverDistMeters: 1, jointOmegaRadS: 2, loadFactor: .5, pushSpike01: 0 });
  assert.equal(result.evidence, 'illustrative');
  assert.equal(result.unit, null);
  assert.ok(result.sigma01 >= 0 && result.sigma01 <= 1);
});

test('every demo waveform and probe explicitly reports no device connection', () => {
  for (const context of ['b737_cfm56', 'mars2020', 'bluerov2', 'rexrov2', 'unitree_g1']) {
    const waveform = sampleTelemetryWaveforms(context, 4, .5);
    assert.equal(waveform.source, 'demo');
    assert.equal(waveform.connected, false);
    assert.match(waveform.protocolBadge, /演示.*未连接/);
    for (const probe of buildSpatialTelemetryProbes(context, 4, .5)) {
      assert.equal(probe.source, 'demo');
      assert.equal(probe.connected, false);
      assert.match(probe.primaryValue, /^演示/);
      assert.doesNotMatch(probe.secondaryValue, /100Hz 锁定/);
    }
  }
});
