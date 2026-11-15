import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSlsState,
  triggerSlsMaterialization,
  stepSlsMaterializationState,
  clampMagLensRadius,
  computeMpcCostColor,
  computeMpcRolloutFan,
  computeUrdfPowerFlowMetrics,
  createDefaultWindTunnelConfig,
  generateSurfaceLightningArcPoints,
  buildMicroFpvCavityWaypoints,
  evaluateMicroFpvSplinePose,
  computeFocServoAcousticParams,
  computeTurbofanAcousticParams
} from './sciTechEngine';

test('Module 1: Dual-Laser SLS 3D printing sweeps laserY from yMin to yMax over 1.8s and completes cleanly', () => {
  const idle = createInitialSlsState(1.8);
  assert.equal(idle.active, false);

  let s = triggerSlsMaterialization(-0.8, 1.8);
  assert.equal(s.active, true);
  assert.equal(s.progress, 0);
  assert.ok(s.laserY < -0.8);

  // Advance 15 frames of 60ms (= 0.9s midpoint of 1.8s duration)
  for (let i = 0; i < 15; i++) {
    s = stepSlsMaterializationState(s, 0.06, -0.8, 1.0);
  }
  assert.equal(s.active, true);
  assert.ok(Math.abs(s.progress - 0.5) < 0.01);
  assert.ok(s.laserY > -0.6 && s.laserY < 0.8);

  // Advance another 16 frames of 60ms past 1.8s completion
  for (let i = 0; i < 16; i++) {
    s = stepSlsMaterializationState(s, 0.06, -0.8, 1.0);
  }
  assert.equal(s.active, false);
  assert.equal(s.progress, 1.0);
  assert.equal(s.meltIntensity, 0.0);
});

test('Module 1: 3D Mag-Lens X-Ray Sphere radius clamps safely on mouse wheel scroll', () => {
  const shrunk = clampMagLensRadius(0.45, 100, 0.16, 1.15);
  assert.ok(shrunk < 0.45 && shrunk >= 0.16);

  const grown = clampMagLensRadius(0.45, -100, 0.16, 1.15);
  assert.ok(grown > 0.45 && grown <= 1.15);

  assert.equal(clampMagLensRadius(0.17, 120, 0.16, 1.15), 0.16);
  assert.equal(clampMagLensRadius(1.14, -120, 0.16, 1.15), 1.15);
});

test('Module 2: MPC Predictive Rollout scatters 11 curved 2nd-order arcs with optimal cyan & 0.8s/1.6s future poses', () => {
  const res = computeMpcRolloutFan(
    0,
    0,
    0,
    0,
    3.2,
    0.15,
    (x, z) => Math.sin(x * 0.2) * 0.1 + Math.cos(z * 0.2) * 0.05,
    1.25,
    2.0,
    16
  );

  assert.equal(res.arcs.length, 11);
  assert.ok(res.optimalIndex >= 0 && res.optimalIndex < 11);
  assert.equal(res.arcs[res.optimalIndex].isOptimal, true);
  assert.equal(res.arcs[res.optimalIndex].costNorm, 0);

  // Verify each arc has 17 3D points (origin + 16 rollout steps)
  for (const arc of res.arcs) {
    assert.equal(arc.points.length, 17);
  }

  // Verify 0.8s and 1.6s future pose predictions advance monotonically forward along optimal rollout
  const [pose08, pose16] = res.futurePoses;
  assert.equal(pose08.horizonSec, 0.8);
  assert.equal(pose16.horizonSec, 1.6);
  const d08 = Math.hypot(pose08.x, pose08.z);
  const d16 = Math.hypot(pose16.x, pose16.z);
  assert.ok(d08 > 0.5, '0.8s ghost pose must project ahead of chassis');
  assert.ok(d16 > d08, '1.6s ghost pose must project further than 0.8s pose');

  const optColor = computeMpcCostColor(0, true);
  const highCostColor = computeMpcCostColor(1.0, false);
  assert.ok(optColor[1] > 0.9 && optColor[2] > 0.8, 'Optimal path should be fluorescent cyan');
  assert.ok(highCostColor[0] > 0.9 && highCostColor[1] < 0.35, 'High-cost boundary should be crimson-amber');
});

test('Module 2: URDF Power-Flow Arteries scale pulse rate and intensity with |tau * omega|', () => {
  const metrics = computeUrdfPowerFlowMetrics(
    [
      { name: 'hip_pitch', type: 'revolute' },
      { name: 'knee_pitch', type: 'revolute' }
    ],
    [0.0, 4.5],
    [20.0, 25.0]
  );

  assert.equal(metrics.joints.length, 2);
  assert.equal(metrics.joints[0].powerWatts, 0);
  assert.equal(metrics.joints[1].powerWatts, 112.5);
  assert.equal(metrics.totalPowerWatts, 112.5);
  assert.ok(metrics.joints[1].pulseRateHz > metrics.joints[0].pulseRateHz);
});

test('Module 3: Faraday-cage surface lightning arcs connect exact real GLB start/end vertices', () => {
  const cfg = createDefaultWindTunnelConfig();
  assert.equal(cfg.schlierenMode, false);
  assert.equal(cfg.mach8PlasmaSheath, false);
  assert.equal(cfg.faradayLightningArcs, false);

  const start: [number, number, number] = [-0.6, 0.4, 0.2];
  const end: [number, number, number] = [0.5, 0.45, -0.15];
  const pts = generateSurfaceLightningArcPoints(start, end, [0, 0, 0], 3.7, 8);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], start);
  assert.deepEqual(pts[pts.length - 1], end);
});

test('Module 4: Micro-FPV Cavity Fly-Through spline loops seamlessly with bounded bank roll', () => {
  const aeroWp = buildMicroFpvCavityWaypoints('b737_cfm56', [-1.2, -0.8, -0.8], [1.2, 0.8, 0.8]);
  const roboWp = buildMicroFpvCavityWaypoints('unitree_go2', [-0.9, 0.0, -0.6], [0.9, 1.1, 0.6]);
  assert.equal(aeroWp.points.length, 8);
  assert.equal(roboWp.points.length, 8);

  const pStart = evaluateMicroFpvSplinePose(aeroWp, 0.0, 0.72);
  const pLoop = evaluateMicroFpvSplinePose(aeroWp, 1.0, 0.72);
  assert.ok(Math.abs(pStart.position[0] - pLoop.position[0]) < 1e-6);
  assert.ok(Math.abs(pStart.position[1] - pLoop.position[1]) < 1e-6);
  assert.ok(Math.abs(pStart.position[2] - pLoop.position[2]) < 1e-6);

  for (let k = 0; k < 20; k++) {
    const pose = evaluateMicroFpvSplinePose(roboWp, k / 20, 0.72);
    assert.ok(Math.abs(pose.bankRollRad) <= 0.62001);
    const upNorm = Math.hypot(pose.up[0], pose.up[1], pose.up[2]);
    assert.ok(Math.abs(upNorm - 1.0) < 1e-5);
    assert.ok(pose.segmentLabel.length > 0);
  }
});

test('Module 5: Procedural WebAudio FOC servo (180Hz..1400Hz) & CFM56 dual-spool BPF parameters', () => {
  const idle = computeFocServoAcousticParams(0);
  assert.equal(idle.primaryCarrierHz, 180);
  assert.equal(idle.gain, 0);

  const fast = computeFocServoAcousticParams(28.0);
  assert.equal(fast.primaryCarrierHz, 1400);
  assert.ok(fast.harmonicSidebandHz > fast.primaryCarrierHz);
  assert.ok(fast.gain > 0.05);

  const cruise = computeTurbofanAcousticParams(4100, 13200, false);
  const rev = computeTurbofanAcousticParams(4100, 13200, true);
  assert.ok(rev.jetBandpassHz > cruise.jetBandpassHz);
  assert.ok(rev.gain > cruise.gain);
});
