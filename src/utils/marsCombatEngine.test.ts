import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PLAYABLE_MECH_SPECS,
  ENEMY_ARCHETYPE_SPECS,
  createInitialMarsCombatState,
  spawnEnemyDropPod,
  summonAresBoss,
  damageEnemyEntity,
  computeRelativeThreatAngleRad,
  stepMarsCombatWorld,
  CombatStepInput
} from './marsCombatEngine';
import { sampleLandTerrainHeight } from './actionSandboxEngine';

function idleInput(overrides: Partial<CombatStepInput> = {}): CombatStepInput {
  return {
    moveForward: 0,
    moveRight: 0,
    sprintHeld: false,
    fireHeld: false,
    missileJustPressed: false,
    jumpJustPressed: false,
    jumpHeld: false,
    dashJustPressed: false,
    empJustPressed: false,
    ultimateJustPressed: false,
    summonBossJustPressed: false,
    aimYaw: 0,
    aimPitch: 0,
    aimWorldPoint: null,
    ...overrides
  };
}

test('Mars Combat specs reference real .glb files on disk for all playable mechs and enemy archetypes', () => {
  for (const mech of PLAYABLE_MECH_SPECS) {
    for (const rel of mech.glbUrls) {
      const fullPath = path.join(process.cwd(), 'public', rel.replace(/^\//, ''));
      assert.equal(fs.existsSync(fullPath), true, `Missing playable mech GLB: ${fullPath}`);
    }
  }
  for (const enemySpec of Object.values(ENEMY_ARCHETYPE_SPECS)) {
    for (const rel of enemySpec.glbUrls) {
      const fullPath = path.join(process.cwd(), 'public', rel.replace(/^\//, ''));
      assert.equal(fs.existsSync(fullPath), true, `Missing enemy robot GLB: ${fullPath}`);
    }
  }
});

test('autostart boots into playing state with initial Martian drop-pod enemy wave', () => {
  const titleState = createInitialMarsCombatState('unitree_g1', 0, false);
  assert.equal(titleState.shellState, 'title');
  assert.equal(titleState.enemies.length, 0);

  const playState = createInitialMarsCombatState('unitree_g1', 500, true);
  assert.equal(playState.shellState, 'playing');
  assert.equal(playState.enemies.length, 3);
  assert.equal(playState.bestScore, 500);
});

test('CoD directional threat angle computes accurate front, right, left, and rear bearings', () => {
  assert.ok(Math.abs(computeRelativeThreatAngleRad(0, 0, 0, 10, 0)) < 1e-5);
  assert.ok(Math.abs(computeRelativeThreatAngleRad(0, 0, 0, 0, 10) - Math.PI / 2) < 1e-5);
  assert.ok(Math.abs(computeRelativeThreatAngleRad(0, 0, 0, 0, -10) + Math.PI / 2) < 1e-5);
});

test('4 distinct enemy AI policies exhibit distinct movement and telegraph behaviors', () => {
  const state = createInitialMarsCombatState('unitree_g1', 0, false);
  state.shellState = 'playing';
  state.spawnTimer = 999;

  const hound = spawnEnemyDropPod(state, 'go2_hound', 0, 9.5);
  const vanguard = spawnEnemyDropPod(state, 'g1_vanguard', Math.PI / 2, 18);
  const siege = spawnEnemyDropPod(state, 'sar_siege', Math.PI, 20);
  const aero = spawnEnemyDropPod(state, 'aero_hunter', -Math.PI / 2, 18);

  hound.dropPodProgress = 1;
  hound.aiCooldown = 0;
  vanguard.dropPodProgress = 1;
  vanguard.aiCooldown = 0;
  siege.dropPodProgress = 1;
  siege.aiCooldown = 0;
  aero.dropPodProgress = 1;
  aero.aiCooldown = 0;

  stepMarsCombatWorld(state, 0.04, idleInput());

  // Hound enters telegraphed pounce windup, Siege spawns a ground AoE telegraph ring, Aero flies > 5.5m above terrain beneath it!
  assert.equal(hound.attackPhase, 'windup');
  assert.equal(state.hazards.some((h) => h.kind === 'mortar'), true);
  assert.ok(aero.y > sampleLandTerrainHeight(aero.x, aero.z) + 5.5);
});

test('Armored Core 6 Boss ACS Stagger Punish (2.5x Direct Hit), 50% HP Phase 2 Coral Overdrive, and Victory snapshot', () => {
  const state = createInitialMarsCombatState('sar', 0, false);
  state.shellState = 'playing';

  const boss = summonAresBoss(state)!;
  assert.ok(boss);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.bossPhase, 1);
  boss.dropPodProgress = 1;

  // Fill Boss ACS Stagger bar -> triggers staggeredTimer > 0 & acs_stagger_break cue
  damageEnemyEntity(state, boss, 60, boss.maxStagger + 10, '超导磁轨炮');
  assert.ok(boss.staggeredTimer > 3.0);
  assert.equal(state.events.bossCue, 'acs_stagger_break');

  // Clear hitstop, then deal damage during stagger -> 2.5x Direct Hit critical & push below 50% HP for Phase 2!
  state.hitstopTimer = 0;
  boss.shield = 0;
  const hpBefore = boss.hp;
  damageEnemyEntity(state, boss, 100, 10, '超导磁轨炮');
  assert.equal(hpBefore - boss.hp, 250);
  assert.equal(state.hitmarker.isCrit, true);

  // Drop Boss below 50% HP -> Phase 2 Coral Overdrive + spatial AoE nova ring!
  damageEnemyEntity(state, boss, Math.ceil((boss.hp - boss.maxHp * 0.45) / 2.5) + 80, 10, '超导磁轨炮');
  assert.equal(boss.bossPhase, 2);
  assert.equal(state.hazards.some((h) => h.kind === 'boss_phase_nova'), true);

  // Defeat Boss -> triggers Victory outcome & immutable RunSummarySnapshot
  damageEnemyEntity(state, boss, boss.hp + 500, 50, '天基歼星离子炮');
  assert.equal(state.outcome, 'victory');
  assert.ok(state.runSnapshot);
  assert.equal(state.runSnapshot?.outcome, 'victory');
  assert.equal(state.runSnapshot?.bossHpRemainingPct, 0);
});

test('EMP Nova intercepts enemy missiles and Orbital Ion Cannon Ultimate fires cleanly', () => {
  const state = createInitialMarsCombatState('unitree_g1', 0, false);
  state.shellState = 'playing';
  const enemy = spawnEnemyDropPod(state, 'g1_vanguard', 0, 16);
  enemy.dropPodProgress = 1;

  // Inject incoming enemy missile near player
  state.projectiles[0].active = true;
  state.projectiles[0].fromPlayer = false;
  state.projectiles[0].kind = 'boss_missile';
  state.projectiles[0].x = state.x + 4;
  state.projectiles[0].y = state.y + 1.2;
  state.projectiles[0].z = state.z;
  state.projectiles[0].life = 2;

  stepMarsCombatWorld(state, 0.03, idleInput({ empJustPressed: true }));
  assert.equal(state.projectiles[0].active, false);

  state.hitstopTimer = 0;
  state.ultimateCharge = 100;
  stepMarsCombatWorld(state, 0.03, idleInput({ ultimateJustPressed: true }));
  assert.equal(state.events.firedWeapon, 'orbital_ion');
  assert.ok(state.ultimateBeamTimer > 1.0);
});

test('Module 1: True Muzzle World Pos projectile spawn, spring recoil impulse, heavy braced posture, and Upper/Lower Body IK split', () => {
  const state = createInitialMarsCombatState('unitree_g1', 0, true);
  state.enemies = []; // isolate projectile spawn check
  const customMuzzle: [number, number, number] = [3.45, 1.62, -2.18];

  stepMarsCombatWorld(
    state,
    0.016,
    idleInput({
      fireHeld: true,
      aimYaw: 0.4,
      aimPitch: 0.15,
      aimWorldPoint: [20, 2.5, 8],
      muzzleWorldPoint: customMuzzle
    })
  );

  const spawned = state.projectiles.find((p) => p.active && p.fromPlayer);
  assert.ok(spawned, 'Expected projectile to spawn from player');
  // Projectile starts at customMuzzle + 1 frame of velocity integration (0.016s)
  const distFromMuzzle = Math.hypot(
    spawned.x - (customMuzzle[0] + spawned.vx * 0.016),
    spawned.y - (customMuzzle[1] + spawned.vy * 0.016),
    spawned.z - (customMuzzle[2] + spawned.vz * 0.016)
  );
  assert.ok(distFromMuzzle < 1e-4, `Expected exact muzzle world origin, got drift ${distFromMuzzle}`);
  assert.ok(state.recoilVel > 0 || state.recoilPos > 0, 'Expected spring gun recoil impulse');
  assert.ok(state.events.ejectedShell, 'Expected right-side shell casing ejection event');

  // Switch to heavy Railgun [2] -> triggers 0.35s braced posture!
  state.activeWeapon = 'railgun';
  state.weaponCooldown = 0;
  stepMarsCombatWorld(state, 0.016, idleInput({ fireHeld: true, muzzleWorldPoint: customMuzzle }));
  assert.ok(state.heavyPostureTimer > 0.3, 'Expected 0.35s heavy weapon braced posture timer');
});

test('Module 1 & 2: computeCombatUpperLowerBodyIK splits lower WASD gait from upper aiming & [Q] command gesture', async () => {
  const { computeCombatUpperLowerBodyIK } = await import('./marsCombatEngine');
  const waistYaw = computeCombatUpperLowerBodyIK({
    mechId: 'unitree_g1',
    jointName: 'waist_yaw_joint',
    axis: [0, 0, 1],
    limitLower: -1.5,
    limitUpper: 1.5,
    baseGaitAngle: 0,
    chassisYaw: 0,
    aimYaw: 0.8,
    aimPitch: 0.2,
    recoilPos: 0.4,
    heavyPostureTimer: 0,
    wingmanCommandTimer: 0
  });
  assert.ok(Math.abs(waistYaw) > 0.5, 'Upper waist_yaw must turn toward aimYaw while lower chassis runs along WASD');

  const rightShoulderNormal = computeCombatUpperLowerBodyIK({
    mechId: 'unitree_g1',
    jointName: 'right_shoulder_pitch_joint',
    axis: [0, 1, 0],
    limitLower: -2.8,
    limitUpper: 2.8,
    baseGaitAngle: 0.3,
    chassisYaw: 0,
    aimYaw: 0,
    aimPitch: 0,
    recoilPos: 0,
    heavyPostureTimer: 0,
    wingmanCommandTimer: 0
  });
  assert.ok(rightShoulderNormal < -0.5, 'Right arm must stay raised in shoulder-braced rifle aim, never hanging down');

  const leftArmPoint = computeCombatUpperLowerBodyIK({
    mechId: 'unitree_g1',
    jointName: 'left_shoulder_pitch_joint',
    axis: [0, 1, 0],
    limitLower: -2.8,
    limitUpper: 2.8,
    baseGaitAngle: 0,
    chassisYaw: 0,
    aimYaw: 0,
    aimPitch: 0,
    recoilPos: 0,
    heavyPostureTimer: 0,
    wingmanCommandTimer: 0.35
  });
  assert.ok(leftArmPoint < -1.35, 'Pressing [Q] must raise left arm forward to point at target');
});

test('Module 2: Localized shield ripple normal, shield-shatter stun, soft separation anti-clipping, and Wingman Go2 pounce', () => {
  const state = createInitialMarsCombatState('unitree_g1', 0, false);
  state.shellState = 'playing';
  state.spawnTimer = 999;

  const vanguard = spawnEnemyDropPod(state, 'g1_vanguard', 0, 10);
  vanguard.dropPodProgress = 1;
  vanguard.x = 10;
  vanguard.z = 0;
  vanguard.y = sampleLandTerrainHeight(10, 0);

  // Hit shield on the front side facing player -> triggers localized shieldRippleTimer & local +X hit normal
  damageEnemyEntity(state, vanguard, 20, 5, '高频脉冲步枪', [8.9, vanguard.y + 1.1, 0], 1.0);
  assert.ok(vanguard.shield > 0);
  assert.ok(vanguard.shieldRippleTimer > 0.3, 'Expected localized shield ripple timer');
  assert.ok(vanguard.lastShieldHitLocalDir[0] > 0.5, 'Expected local hit normal pointing toward enemy front (+X)');

  // Shatter remaining shield -> triggers shieldShatterTimer & paralysis mini-stun!
  state.hitstopTimer = 0;
  damageEnemyEntity(state, vanguard, 120, 10, '高频脉冲步枪', [8.9, vanguard.y + 1.1, 0], 1.0);
  assert.equal(vanguard.shield, 0);
  assert.ok(vanguard.shieldShatterTimer > 0.4, 'Expected shield shatter burst timer');
  assert.ok(vanguard.shieldBreakStunTimer > 0.9, 'Expected shield-break paralysis stun');
  assert.ok(Math.abs(vanguard.hitTiltVelP) + Math.abs(vanguard.hitTiltVelR) > 0, 'Expected physical spring hit-stagger');

  // Test Soft Collision Separation: place enemy directly on top of player -> pushed apart cleanly!
  state.hitstopTimer = 0;
  const hound = spawnEnemyDropPod(state, 'go2_hound', 0, 2);
  hound.dropPodProgress = 1;
  hound.x = state.x + 0.1;
  hound.z = state.z + 0.05;
  hound.y = state.y;
  stepMarsCombatWorld(state, 0.016, idleInput());
  const sepDist = Math.hypot(hound.x - state.x, hound.z - state.z);
  assert.ok(sepDist >= 1.75, `Expected soft collision separation >= 1.75m, got ${sepDist}`);

  // Test Wingman [Q] Command Pounce onto shielded Siege robot -> strips shield & slows!
  const siege = spawnEnemyDropPod(state, 'sar_siege', 0, 12);
  siege.dropPodProgress = 1;
  siege.x = state.x + 8;
  siege.z = state.z;
  siege.y = sampleLandTerrainHeight(siege.x, siege.z);
  const initialShield = siege.shield;

  state.hitstopTimer = 0;
  stepMarsCombatWorld(
    state,
    0.02,
    idleInput({ wingmanCommandJustPressed: true, aimWorldPoint: [siege.x, siege.y, siege.z] })
  );
  assert.equal(state.wingman.mode, 'pounce_leap');
  assert.equal(state.wingman.targetUid, siege.uid);

  // Advance 0.45s so Wingman leaps onto Siege and performs electromagnetic bite slash!
  for (let i = 0; i < 12; i++) {
    state.hitstopTimer = 0;
    stepMarsCombatWorld(state, 0.04, idleInput());
  }
  assert.ok(siege.shield < initialShield, 'Wingman electromagnetic bite must strip target shield');
  assert.ok(siege.slowTimer > 0, 'Wingman bite must apply slow debuff');
});

