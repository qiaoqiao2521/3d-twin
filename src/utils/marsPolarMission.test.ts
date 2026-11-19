import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMarsCombatState, getMarsBattlefieldObstacles, sampleMarsArenaSurfaceHeight,
  sampleMarsCombatFloor, stepMarsCombatWorld, summonAresBoss, summonXenoQueenBoss, type CombatStepInput
} from './marsCombatEngine';
import {
  POLAR_BRIDGE, POLAR_GATE, POLAR_HIGH_PASS, POLAR_HOLD, POLAR_HOLD_SECONDS, POLAR_JAMMER, POLAR_RELAY,
  readPolarMissionPrompt
} from './marsPolarMission';

const mapId = 'polar_ice_canyon';
const quiet = (): ReturnType<typeof createInitialMarsCombatState> => {
  const state = createInitialMarsCombatState('husky_ugv', 0, false, mapId);
  state.shellState = 'playing';
  state.spawnTimer = 999;
  return state;
};
function pin(state: ReturnType<typeof quiet>, x: number, z: number) {
  state.x = x;
  state.z = z;
  state.y = sampleMarsCombatFloor(x, z, mapId, state.polarMission?.gateOpen);
  state.isGrounded = true;
  state.vx = state.vy = state.vz = 0;
}
function step(state: ReturnType<typeof quiet>, input: Partial<CombatStepInput> = {}, times = 1) {
  for (let i = 0; i < times; i++) stepMarsCombatWorld(state, .025, {
    moveForward: 0, moveRight: 0, sprintHeld: false, fireHeld: false, missileJustPressed: false,
    jumpJustPressed: false, jumpHeld: false, dashJustPressed: false, empJustPressed: false,
    ultimateJustPressed: false, summonBossJustPressed: false,
    aimYaw: 0, aimPitch: 0, aimWorldPoint: null, ...input
  });
}

function driveTo(state: ReturnType<typeof quiet>, x: number, z: number) {
  for (let i = 0; i < 600; i++) {
    const distance = Math.hypot(x - state.x, z - state.z);
    if (distance < 1.1 && state.isGrounded) return;
    const offset = Math.atan2(z - state.z, x - state.x) - state.yaw;
    const angle = Math.atan2(Math.sin(offset), Math.cos(offset));
    step(state, {
      moveForward: Math.abs(angle) > .65 ? 0 : Math.min(.85, distance / 3.4),
      moveRight: Math.max(-1, Math.min(1, angle * 2.1))
    });
  }
  assert.fail(`failed to drive to ${x},${z} from ${state.x.toFixed(2)},${state.z.toFixed(2)}`);
}

test('polar low deck requires relay input and opens traversable same-position bridge; high flank is always physically open', () => {
  const closed = quiet();
  const open = quiet();
  const high = quiet();
  const g = POLAR_GATE, b = POLAR_BRIDGE, h = POLAR_HIGH_PASS;

  assert.ok(sampleMarsArenaSurfaceHeight(h.x,h.z,mapId) > sampleMarsArenaSurfaceHeight(b.x,b.z,mapId) + 4);
  assert.ok(sampleMarsCombatFloor(b.x,b.z,mapId,false) < b.floorY - 2);
  assert.equal(sampleMarsCombatFloor(b.x,b.z,mapId,true), b.floorY);
  assert.equal(sampleMarsCombatFloor(b.x,b.z,'jezero_crater',false),sampleMarsCombatFloor(b.x,b.z,'jezero_crater',true));
  assert.ok(getMarsBattlefieldObstacles(mapId).some(o => o.kind === 'gate'));

  step(open, {interactPressed:true});
  assert.equal(open.polarMission?.gateOpen,false);
  pin(open, POLAR_RELAY.x, POLAR_RELAY.z);
  open.hitstopTimer = .06;
  step(open, {interactPressed:true});
  step(open, {}, 4);
  assert.equal(open.polarMission?.gateOpen,true);
  assert.ok(!getMarsBattlefieldObstacles(mapId,true).some(o => o.kind === 'gate'));

  pin(closed, g.x - 8, g.z);
  pin(open, b.x - 8, b.z);
  pin(high, h.x - 8, h.z);
  step(closed, {moveForward:1,sprintHeld:true}, 140);
  step(open, {moveForward:1,sprintHeld:true}, 140);
  step(high, {moveForward:1,sprintHeld:true}, 140);
  assert.ok(closed.x <= g.x - g.radius - .95, `closed stopped at ${closed.x}`);
  assert.ok(open.x > b.x + b.length/2, `open passed to ${open.x}`);
  assert.ok(high.x > h.x + h.radius, `bypass passed to ${high.x}`);
});

test('Queen requires one grounded continuous hold after the relay; cheats and kills cannot skip it; fresh run resets all', () => {
  const state = quiet();
  const {x,z} = POLAR_HOLD;
  state.kills = 100;
  pin(state,x,z);
  step(state,{summonBossJustPressed:true,summonQueenJustPressed:true}, 20);
  assert.equal(state.bossSpawned,false);
  assert.equal(summonAresBoss(state),null);
  assert.equal(summonXenoQueenBoss(state),null);
  assert.equal(state.polarMission?.phase,'relay');

  pin(state,POLAR_RELAY.x,POLAR_RELAY.z);
  step(state,{interactPressed:true});
  pin(state,x,z);
  step(state,{},80);
  assert.ok((state.polarMission?.holdElapsed ?? 0) > 1.9);
  const runner = state.enemies.find(e=>e.polarBridgeEntry);
  // The crossing assertion uses the live attacker. Isolate the timer check below from melee knockback.
  assert.ok(runner && runner.x > POLAR_BRIDGE.x - 1, 'the defender wave uses the newly deployed bridge');
  state.enemies.length = 0;
  state.hitstopTimer = 0;
  pin(state,x+POLAR_HOLD.radius+1,z);
  step(state);
  assert.equal(state.polarMission?.holdElapsed,0);
  pin(state,x,z);
  step(state,{},POLAR_HOLD_SECONDS*40-1);
  assert.equal(state.bossSpawned,false);
  step(state);
  assert.equal(state.polarMission?.phase,'boss');
  assert.equal(state.wave,2);
  const boss=state.enemies.find(e=>e.isBoss);
  assert.equal(boss?.archetype,'xeno_queen_boss');
  assert.ok(boss && Math.abs(boss.x-53)<.05);
  assert.ok(boss && Math.abs(boss.z-7)<.05);
  step(state,{},5);
  assert.equal(state.enemies.filter(e=>e.isBoss).length,1);

  const reset = quiet();
  assert.deepEqual(reset.polarMission,{phase:'relay',gateOpen:false,holdElapsed:0,interactBuffered:false,jammerActive:false,bridgeWaveSent:false});
  assert.equal(createInitialMarsCombatState().polarMission,null);
});

test('ridge jammer cuts the first bridge reinforcement, but the relay and eight-second hold remain mandatory', () => {
  const state = quiet();
  const mission = state.polarMission!;
  const prompt = () => readPolarMissionPrompt(mission, state.x, state.z);
  step(state, { interactPressed: true });
  assert.equal(mission.jammerActive, false, 'interaction from afar does not jam');

  pin(state, POLAR_JAMMER.x, POLAR_JAMMER.z);
  assert.equal(prompt()?.interaction, 'jammer');
  state.y += 5;
  state.isGrounded = false;
  step(state, { interactPressed: true });
  assert.equal(mission.jammerActive, false, 'airborne interaction does not jam');

  pin(state, POLAR_JAMMER.x, POLAR_JAMMER.z);
  step(state, { interactPressed: true });
  assert.equal(mission.jammerActive, true);
  assert.equal(prompt()?.jammerAvailable, false);
  step(state, { interactPressed: true });
  assert.equal(mission.jammerActive, true, 'repeat presses cannot turn jamming off');
  assert.equal(mission.gateOpen, false, 'side objective cannot open the bridge');
  pin(state, POLAR_HOLD.x, POLAR_HOLD.z);
  step(state, {}, 50);
  assert.equal(mission.holdElapsed, 0, 'side objective cannot start defense');

  pin(state, POLAR_RELAY.x, POLAR_RELAY.z);
  assert.equal(prompt()?.interaction, 'relay');
  step(state, { interactPressed: true });
  assert.equal(mission.gateOpen, true);
  pin(state, POLAR_HOLD.x, POLAR_HOLD.z);
  step(state, {}, POLAR_HOLD_SECONDS * 40 - 1);
  assert.equal(mission.bridgeWaveSent, true);
  assert.equal(state.enemies.some(e => e.polarBridgeEntry), false);
  assert.equal(state.bossSpawned, false, 'jamming cannot shorten defense');
  step(state);
  assert.equal(state.bossSpawned, true);
  assert.equal(state.enemies.some(e => e.polarBridgeEntry), false);
});

test('jammer remains usable after the relay, but cannot cancel a reinforcement that has already deployed', () => {
  const beforeHold = quiet();
  const late = quiet();
  for (const state of [beforeHold, late]) {
    pin(state, POLAR_RELAY.x, POLAR_RELAY.z);
    step(state, { interactPressed: true });
  }
  pin(late, POLAR_HOLD.x, POLAR_HOLD.z);
  step(late);
  assert.ok(late.enemies.some(e => e.polarBridgeEntry));
  for (const state of [beforeHold, late]) {
    pin(state, POLAR_JAMMER.x, POLAR_JAMMER.z);
    step(state, { interactPressed: true });
  }
  assert.equal(beforeHold.polarMission?.jammerActive, true);
  assert.equal(late.polarMission?.jammerActive, false);
  assert.equal(readPolarMissionPrompt(late.polarMission, late.x, late.z)?.interaction, null);
  assert.ok(late.enemies.some(e => e.polarBridgeEntry));
});

test('Husky can drive from spawn through either intended route without moving or teleporting the fixture', () => {
  const direct = quiet();
  const flank = quiet();
  for (const state of [direct, flank]) {
    driveTo(state, POLAR_RELAY.x, POLAR_RELAY.z);
    step(state, { interactPressed: true });
    assert.equal(state.polarMission?.gateOpen, true);
  }
  driveTo(direct, 13, POLAR_BRIDGE.z);
  driveTo(direct, POLAR_HOLD.x, POLAR_HOLD.z);
  step(direct);
  assert.ok(direct.enemies.some(e => e.polarBridgeEntry));

  driveTo(flank, 7, POLAR_JAMMER.z);
  driveTo(flank, POLAR_JAMMER.x, POLAR_JAMMER.z);
  step(flank, { interactPressed: true });
  assert.equal(flank.polarMission?.jammerActive, true);
  driveTo(flank, 32, -8);
  driveTo(flank, POLAR_HOLD.x, POLAR_HOLD.z);
  step(flank);
  assert.equal(flank.polarMission?.bridgeWaveSent, true);
  assert.equal(flank.enemies.some(e => e.polarBridgeEntry), false);
});
