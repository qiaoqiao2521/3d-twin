import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocomotionModesForRobot,
  cycleLocomotionMode,
  computeLocomotionUrdfJointDelta,
  createInitialVectorDashState,
  triggerVectorDash,
  stepVectorDash,
  triggerUltimateSkill,
  stepUltimateSkill,
  computeUltimateUrdfJointDelta,
  computeDirectorCameraPose,
  cycleDirectorCameraMode,
  createArenaInteractiveTargets,
  createInitialTacticalScoreState,
  damageInteractiveTarget,
  stepInteractiveTargets,
  findBestInteractiveTarget
} from './signatureShowcaseEngine';

test('getLocomotionModesForRobot returns 4 distinct modes per robot and cycles cleanly', () => {
  const go2Modes = getLocomotionModesForRobot('unitree_go2', 'land');
  assert.equal(go2Modes.length, 4);
  assert.equal(go2Modes[1].id, 'assault');
  assert.ok(go2Modes[1].speedMultiplier > 1.3);

  assert.equal(cycleLocomotionMode('standard'), 'assault');
  assert.equal(cycleLocomotionMode('assault'), 'agile');
  assert.equal(cycleLocomotionMode('agile'), 'acrobatic');
  assert.equal(cycleLocomotionMode('acrobatic'), 'standard');

  const delta = computeLocomotionUrdfJointDelta(
    'unitree_go2',
    {
      name: 'FL_thigh_joint',
      type: 'revolute',
      parent: 'FL_hip',
      child: 'FL_thigh',
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
      axis: [0, 1, 0],
      lower: -1.5,
      upper: 3.4
    },
    'agile',
    2.0,
    1.0
  );
  assert.ok(Math.abs(delta) > 0.1);
});

test('VectorDash produces smooth impulse displacement and respects cooldown', () => {
  let dash = createInitialVectorDashState();
  dash = triggerVectorDash(dash, 0, 1, 12);
  assert.equal(dash.active, true);
  const step1 = stepVectorDash(dash, 0.12);
  assert.ok(Math.hypot(step1.dispX, step1.dispZ) > 0.2);
  // Cannot re-trigger while on cooldown
  const blocked = triggerVectorDash(step1.next, 0, -1, 12);
  assert.equal(blocked.dirZ, dash.dirZ);
});

test('UltimateSkill progresses through all 4 shots, sweeps showcaseClipRatio in Shot 1, and returns armorExplosionRatio cleanly to 0', () => {
  let st = triggerUltimateSkill();
  assert.equal(st.active, true);
  assert.equal(st.duration, 4.2);
  assert.equal(st.shotIndex, 1);
  assert.equal(st.phase, 'charge_awaken');
  assert.ok(st.showcaseClipRatio < 0.5);

  const seenShots = new Set<number>([st.shotIndex]);
  let sawStunt = false;
  let sawBurst = false;
  let sawLock = false;
  let maxExplosion = 0;
  let maxAltitude = 0;

  for (let i = 0; i < 95; i++) {
    st = stepUltimateSkill(st, 0.05, 'unitree_go2');
    if (st.active) seenShots.add(st.shotIndex);
    if (st.phase === 'kinematic_stunt') {
      sawStunt = true;
      assert.equal(st.showcaseClipRatio, 1.0);
    }
    if (st.phase === 'twin_burst') sawBurst = true;
    if (st.phase === 'armor_lock') sawLock = true;
    maxExplosion = Math.max(maxExplosion, st.armorExplosionRatio);
    maxAltitude = Math.max(maxAltitude, st.altitudeOffset);
  }

  assert.equal(seenShots.size, 4);
  assert.equal(sawStunt, true);
  assert.equal(sawBurst, true);
  assert.equal(sawLock, true);
  assert.ok(maxExplosion > 0.3);
  assert.ok(maxAltitude > 1.2);
  assert.equal(st.active, false);
  assert.equal(st.armorExplosionRatio, 0);
  assert.equal(st.showcaseClipRatio, 1.0);

  const stuntState = stepUltimateSkill(triggerUltimateSkill(), 0.1, 'unitree_g1');
  const g1Delta = computeUltimateUrdfJointDelta(
    'unitree_g1',
    {
      name: 'left_knee_joint',
      type: 'revolute',
      parent: 'left_hip',
      child: 'left_shin',
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
      axis: [0, 1, 0],
      lower: -0.2,
      upper: 2.5
    },
    stuntState
  );
  assert.ok(g1Delta > 0.02);
});

test('DirectorCamera choreography executes 4-shot unified showcase and preserves Vertigo constant subject framing', () => {
  assert.equal(cycleDirectorCameraMode('off'), 'hero_orbit');
  assert.equal(cycleDirectorCameraMode('fpv_flyby'), 'off');

  const shot1 = computeDirectorCameraPose({
    mode: 'off',
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    actorYaw: 0,
    modelRadius: 2.0,
    elapsed: 0.4,
    ultimateActive: true,
    ultimateProgress01: 0.12
  });
  const shot2 = computeDirectorCameraPose({
    mode: 'off',
    anchorX: 0,
    anchorY: 1.5,
    anchorZ: 0,
    actorYaw: 0,
    modelRadius: 2.0,
    elapsed: 1.8,
    ultimateActive: true,
    ultimateProgress01: 0.45
  });
  const shot3 = computeDirectorCameraPose({
    mode: 'off',
    anchorX: 0,
    anchorY: 0.2,
    anchorZ: 0,
    actorYaw: 0,
    modelRadius: 2.0,
    elapsed: 3.0,
    ultimateActive: true,
    ultimateProgress01: 0.75
  });
  assert.equal(shot1.fovDeg, 38);
  assert.ok(shot1.position[1] > shot1.lookAt[1]);
  assert.ok(shot2.fovDeg > 55);
  assert.equal(shot3.fovDeg, 54);
  assert.ok(shot1.modeLabel.includes('镜头 I'));
  assert.ok(shot2.modeLabel.includes('镜头 II'));
  assert.ok(shot3.modeLabel.includes('镜头 III'));

  const pA = computeDirectorCameraPose({
    mode: 'dolly_vertigo',
    anchorX: 0,
    anchorY: 1,
    anchorZ: 0,
    actorYaw: 0,
    modelRadius: 2.0,
    elapsed: 0.2,
    ultimateActive: false,
    ultimateProgress01: 0
  });
  const pB = computeDirectorCameraPose({
    mode: 'dolly_vertigo',
    anchorX: 0,
    anchorY: 1,
    anchorZ: 0,
    actorYaw: 0,
    modelRadius: 2.0,
    elapsed: 1.3,
    ultimateActive: false,
    ultimateProgress01: 0
  });
  assert.notEqual(pA.fovDeg, pB.fovDeg);
  const distA = Math.hypot(pA.position[0], pA.position[2]);
  const distB = Math.hypot(pB.position[0], pB.position[2]);
  const apparentWidthA = distA * Math.tan((pA.fovDeg * Math.PI) / 360);
  const apparentWidthB = distB * Math.tan((pB.fovDeg * Math.PI) / 360);
  assert.ok(Math.abs(apparentWidthA - apparentWidthB) < 1e-4);
});

test('InteractiveFieldTargets handle shield break, KO hitstop, shatter, and auto-respawn', () => {
  let targets = createArenaInteractiveTargets('land', () => 0);
  let score = createInitialTacticalScoreState();
  assert.equal(targets.length, 4);

  const best = findBestInteractiveTarget(targets, 0, 0, 0, 0, null);
  assert.ok(best !== null);

  // First hit strips shield and chips hull
  const hit1 = damageInteractiveTarget(targets, score, targets[0].id, 80);
  assert.equal(hit1.hitOccurred, true);
  assert.equal(hit1.justDestroyed, false);
  assert.equal(hit1.targets[0].shield, 0);
  assert.equal(hit1.targets[0].hp, 80);
  assert.ok(hit1.score.hitstopTimer > 0.02);

  // Lethal hit triggers shatter & increments destroyedCount + comboCount
  const hit2 = damageInteractiveTarget(hit1.targets, hit1.score, targets[0].id, 100);
  assert.equal(hit2.justDestroyed, true);
  assert.equal(hit2.targets[0].alive, false);
  assert.equal(hit2.score.destroyedCount, 1);
  assert.equal(hit2.score.comboCount, 2);

  // Step past 6.0s respawn timer -> target respawns with full shield & HP
  let curTargets = hit2.targets;
  let curScore = hit2.score;
  for (let k = 0; k < 70; k++) {
    const stepped = stepInteractiveTargets(curTargets, curScore, 0.1, k * 0.1);
    curTargets = stepped.targets;
    curScore = stepped.score;
  }
  assert.equal(curTargets[0].alive, true);
  assert.equal(curTargets[0].hp, curTargets[0].maxHp);
});
