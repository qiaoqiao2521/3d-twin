import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ODRADEK_GRID_COUNT,
  ODRADEK_GRID_SPACING,
  snapToOdradekWorldGrid,
  findOdradekSensorJointIndex,
  computeOdradekSensorSnapPose,
  computeOdradekWavefrontRadius,
  classifyTraversabilityTier,
  sampleOdradekTraversabilityGrid,
  evaluateOdradekTargetBeacons
} from './odradekScannerEngine';
import {
  triggerOrbitalDropfall,
  stepOrbitalDropfall,
  computeDropfallUrdfJointDelta,
  createInitialOverheatState,
  stepOverheatAndRcsState,
  classifyShipbreakerPartRole,
  stepSpringDamperVec3,
  createInitialWeatheringState,
  stepDynamicWeathering,
  computeHorizonFocusMode,
  computeDiegeticSpineTelemetry
} from './aaaGameVfxEngine';
import { buildArenaWaypoints } from './actionSandboxEngine';

test('Odradek 0.85m world-grid snapping locks coordinates against sub-cell robot drift', () => {
  const s1 = snapToOdradekWorldGrid(10.2, ODRADEK_GRID_SPACING);
  const s2 = snapToOdradekWorldGrid(10.38, ODRADEK_GRID_SPACING);
  const s3 = snapToOdradekWorldGrid(10.05, ODRADEK_GRID_SPACING);
  // 12 * 0.85 = 10.20
  assert.ok(Math.abs(s1 - 10.2) < 1e-6);
  assert.equal(s1, s2);
  assert.equal(s1, s3);
});

test('Odradek sensor joint finder & 0.15s mechanical calibration snap envelope', () => {
  const joints = [
    { name: 'fl_hip_joint', child: 'fl_hip_link' },
    { name: 'sonar_scan_joint', child: 'ping360_head' },
    { name: 'wrist_joint', child: 'gripper' }
  ];
  assert.equal(findOdradekSensorJointIndex(joints), 1);

  const pre = computeOdradekSensorSnapPose(0);
  assert.equal(pre.active, false);

  const midSnap = computeOdradekSensorSnapPose(0.075);
  assert.equal(midSnap.active, true);
  assert.ok(midSnap.yawSnapOffsetRad > 0.35);
  assert.ok(midSnap.flareIntensity > 0.9);

  const post = computeOdradekSensorSnapPose(0.55);
  assert.equal(post.active, false);
  assert.equal(computeOdradekWavefrontRadius(1.0), 38.0);
});

test('Odradek 3-tier slope & obstacle classification matches <22° / 22°..36° / >=36° with compact stems', () => {
  const safe = classifyTraversabilityTier(15.5, false);
  assert.equal(safe.tier, 0);
  assert.equal(safe.stemHeight, 0.09);

  const warn = classifyTraversabilityTier(28.2, false);
  assert.equal(warn.tier, 1);
  assert.equal(warn.stemHeight, 0.13);

  const steep = classifyTraversabilityTier(41.4, false);
  assert.equal(steep.tier, 2);
  assert.equal(steep.stemHeight, 0.17);

  const obstacleOnFlat = classifyTraversabilityTier(2.0, true);
  assert.equal(obstacleOnFlat.tier, 2);
  assert.equal(obstacleOnFlat.stemHeight, 0.17);
});

test('Odradek 2,500-cell world grid sampling works on Land & Sea and enforces strict Airspace isolation', () => {
  const landGrid = sampleOdradekTraversabilityGrid(3.4, 0, -5.1, 'land', [
    { x: 3.4, y: 0, z: -5.1, radius: 1.5, label: 'boulder' }
  ]);
  assert.equal(landGrid.tiers.length, ODRADEK_GRID_COUNT);
  assert.equal(landGrid.worldPositions.length, ODRADEK_GRID_COUNT * 3);
  assert.equal(
    landGrid.counts.safeBlue + landGrid.counts.warnYellow + landGrid.counts.dangerRed,
    2500
  );
  assert.ok(landGrid.counts.dangerRed >= 1);

  const seaGrid = sampleOdradekTraversabilityGrid(0, -4, 0, 'sea', []);
  assert.equal(
    seaGrid.counts.safeBlue + seaGrid.counts.warnYellow + seaGrid.counts.dangerRed,
    2500
  );

  // Strict Airspace Isolation: high-altitude turbofans never spawn ground traversability pins!
  const airGrid = sampleOdradekTraversabilityGrid(0, 18, 0, 'air', []);
  assert.equal(
    airGrid.counts.safeBlue + airGrid.counts.warnYellow + airGrid.counts.dangerRed,
    0
  );

  const wps = buildArenaWaypoints('land');
  const beacons = evaluateOdradekTargetBeacons({
    scanElapsed: 2.0, // R = 76m sweeps nearby waypoints
    scanOrigin: [0, 0, 0],
    actorPos: [0, 0, 0],
    domain: 'land',
    waypoints: wps,
    wingmenPositions: [{ id: 'w1', label: 'GO2-ALPHA', x: 8, y: 0, z: 6 }]
  });
  assert.ok(beacons.length >= 2);
  assert.ok(beacons.some((b) => b.formattedTag.includes('◆') && b.formattedTag.includes('[SLOPE')));
  assert.ok(beacons.some((b) => b.category === 'wingman'));
});

test('Titanfall 2 Orbital Dropfall transitions Y=+160m -> 12m retro -> touchdown slam -> URDF crouch & rise', () => {
  let drop = triggerOrbitalDropfall();
  assert.equal(drop.active, true);
  assert.equal(drop.altitudeOffsetMeters, 160.0);
  assert.equal(drop.phase, 'supersonic_fall');

  // Advance to 0.75s (retro-burn segment)
  drop = stepOrbitalDropfall(drop, 0.25);
  drop = stepOrbitalDropfall(drop, 0.25);
  drop = stepOrbitalDropfall(drop, 0.25);
  assert.equal(drop.phase, 'retro_burn');
  assert.ok(drop.altitudeOffsetMeters > 0 && drop.altitudeOffsetMeters <= 12.0);
  assert.ok(drop.retroBurnIntensity > 0.2);

  // Cross 0.90s touchdown
  drop = stepOrbitalDropfall(drop, 0.20); // elapsed = 0.95s
  assert.equal(drop.justTouchedDown, true);
  assert.equal(drop.phase, 'hydraulic_crouch_rise');
  assert.equal(drop.altitudeOffsetMeters, 0);

  // Hold deep hydraulic crouch around 1.05s
  drop = stepOrbitalDropfall(drop, 0.10);
  assert.ok(drop.crouchCompression > 0.85);
  const g1Knee = computeDropfallUrdfJointDelta(
    'unitree_g1',
    { name: 'left_knee_joint', lower: -0.2, upper: 2.1 },
    drop.crouchCompression
  );
  assert.ok(g1Knee > 0.9);

  // Complete 1.8s deployment
  for (let i = 0; i < 6; i++) {
    drop = stepOrbitalDropfall(drop, 0.15);
  }
  assert.equal(drop.active, false);
});

test('Armored Core 6 Overheat 12% armor-pop venting & 60ms RCS cold-gas attitude thrusters', () => {
  let st = createInitialOverheatState();
  // Sharp counter-clockwise yaw impulse + manual X vent trigger
  st = stepOverheatAndRcsState(st, {
    dt: 0.016,
    isBoosting: true,
    justFiredWeapon: false,
    manualVentRequested: true,
    yawAccelRadS2: 3.2,
    forwardDecelMS2: 0
  });
  assert.equal(st.ventingActive, true);
  assert.equal(st.justTriggeredVent, true);
  assert.equal(st.rcsTimers[1], 0.06);
  assert.equal(st.rcsTimers[2], 0.06);

  // Advance 0.2s into venting -> exact 12% (0.12) armor gap!
  st = stepOverheatAndRcsState(st, {
    dt: 0.2,
    isBoosting: false,
    justFiredWeapon: false,
    manualVentRequested: false,
    yawAccelRadS2: 0,
    forwardDecelMS2: 0
  });
  assert.ok(Math.abs(st.armorGapRatio - 0.12) < 1e-6);
  assert.ok(st.steamJetIntensity > 0.95);
});

test('Shipbreaker role color-coding, 2nd-order Spring-Damper tether, Weathering, Focus & Diegetic Spine', () => {
  assert.equal(classifyShipbreakerPartRole('mmrtg_nuclear_core', 'L3').code, 4);
  assert.equal(classifyShipbreakerPartRole('lidar_dome_top', 'L3').code, 3);
  assert.equal(classifyShipbreakerPartRole('front_left_flipper_link', 'L2').code, 2);
  assert.equal(classifyShipbreakerPartRole('chassis_armor_shell', 'L1').code, 1);

  let sp = { pos: [0, 0, 0] as [number, number, number], vel: [0, 0, 0] as [number, number, number], target: [0.6, 0.4, -0.3] as [number, number, number] };
  for (let i = 0; i < 90; i++) {
    sp = stepSpringDamperVec3(sp, 1 / 60, 95.0, 12.5);
  }
  assert.ok(Math.abs(sp.pos[0] - 0.6) < 0.02);
  assert.ok(Math.abs(sp.pos[1] - 0.4) < 0.02);

  let w = createInitialWeatheringState();
  w = stepDynamicWeathering(w, { dt: 0.2, domain: 'land', speedMetersPerSec: 4.5, throttlePct: 85 });
  assert.ok(w.marsDust > 0);
  w = stepDynamicWeathering(w, { dt: 0.2, domain: 'air', speedMetersPerSec: 28, throttlePct: 95 });
  assert.ok(w.intakeFrost > 0 && w.titaniumHeatBluing > 0);

  assert.equal(computeHorizonFocusMode(true, 'chassis_outer_shell', 'L1'), 1);
  assert.equal(computeHorizonFocusMode(true, 'annular_combustor_hpt', 'L3'), 2);
  assert.equal(computeHorizonFocusMode(false, 'annular_combustor_hpt', 'L3'), 0);

  const spine = computeDiegeticSpineTelemetry({
    throttlePct: 82,
    heatPct: 64,
    speedNorm: 0.75,
    fireCooldownTimer: 0.2
  });
  assert.ok(Math.abs(spine.powerArcFill - 0.82) < 1e-6);
  assert.ok(Math.abs(spine.thermalSlotFill - 0.64) < 1e-6);
  assert.ok(Math.abs(spine.weaponChargeFill - 0.8) < 1e-6);
});
