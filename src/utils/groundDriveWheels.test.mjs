import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import * as THREE from 'three';
import { bindDriveWheels, updateDriveWheels } from './groundDriveWheels';
import { getSandboxActorSpec, isGroundDriveVehicle, createInitialKinematicState, stepSandboxKinematics } from './actionSandboxEngine';
import { createInitialMarsCombatState, stepMarsCombatWorld } from './marsCombatEngine';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule()
});
async function loadDriveScene(asset, offset) {
  const doc = await io.read('public' + asset);
  const frame = new THREE.Group();
  const model = new THREE.Group();
  frame.add(model);
  model.rotation.y = offset;
  function append(node, parent) {
    const group = new THREE.Group();
    group.name = node.getName();
    new THREE.Matrix4().fromArray(node.getMatrix()).decompose(group.position, group.quaternion, group.scale);
    parent.add(group);
    for (const primitive of node.getMesh()?.listPrimitives() || []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
      group.add(new THREE.Mesh(geometry));
    }
    for (const child of node.listChildren()) append(child, group);
  }
  for (const node of doc.getRoot().listScenes()[0].listChildren()) append(node, model);
  return { frame, model, doc };
}

test('shipping wheel meshes roll about their own axles with opposite side speeds in a turn', async () => {
  for (const [actor, count] of [['husky_ugv', 4], ['sar', 4], ['hello_stretch', 3], ['mars2020', 6]]) {
    const spec = getSandboxActorSpec(actor);
    const { frame, model } = await loadDriveScene(spec.glbUrls[0], spec.modelYawOffset);
    const rig = bindDriveWheels(frame, model, actor);
    assert.equal(rig.wheels.length, count, actor);
    for (const wheel of rig.wheels) {
      const worldAxle = wheel.axle.clone().applyQuaternion(wheel.node.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(worldAxle.z > 0.999, actor + ' transverse axle');
      if (wheel.node.name.includes('front') || wheel.node.name.includes('rear') || wheel.node.name.includes('back')) {
        const front = rig.wheels.filter(w => w.node.name.includes('front'));
        const back = rig.wheels.filter(w => /rear|back/.test(w.node.name));
        assert.ok(Math.min(...front.map(w => w.x)) > Math.max(...back.map(w => w.x)), actor + ' nose points +X');
      }
    }
    const centers = rig.wheels.map(w => w.node.getWorldPosition(new THREE.Vector3()));
    updateDriveWheels(rig, 0, 0);
    updateDriveWheels(rig, 0.5, 0);
    for (const wheel of rig.wheels) assert.ok(Math.abs(wheel.spin * wheel.radius + 0.5) < 1e-5);
    const before = rig.wheels.map(w => w.spin);
    updateDriveWheels(rig, 0.5, 0.2);
    rig.wheels.forEach((w, i) => {
      if (Math.abs(w.z) > 0.01) assert.equal(Math.sign(w.spin - before[i]), Math.sign(w.z), 'differential travel');
      assert.ok(w.node.getWorldPosition(new THREE.Vector3()).distanceTo(centers[i]) < 1e-5, 'fixed hub');
      if (w.steerable) assert.ok(Math.abs(w.steer) > 0.1, 'corner wheel steers');
    });
  }
});

test('all original Perseverance wheel triangles and materials are retained across six game hubs', async () => {
  const original = await io.read('public/twins/models/L1_mobility_rocker_bogie.glb');
  const game = await io.read('public' + getSandboxActorSpec('mars2020').glbUrls[0]);
  const source = original.getRoot().listNodes().find(node => node.getName() === 'Wheels_objs').getMesh();
  const hubs = game.getRoot().listNodes().filter(node => node.getName().startsWith('drive_wheel_'));
  function materialFaceCounts(meshes) {
    const counts = new Map();
    for (const mesh of meshes) for (const p of mesh.listPrimitives()) {
      const name = p.getMaterial().getName();
      counts.set(name, (counts.get(name) || 0) + p.getIndices().getCount() / 3);
    }
    return [...counts].sort();
  }
  assert.equal(hubs.length, 6);
  assert.deepEqual(materialFaceCounts(hubs.map(node => node.getMesh())), materialFaceCounts([source]));
});

const combatInput = {
  moveForward: 0, moveRight: 0, sprintHeld: false, fireHeld: false, missileJustPressed: false,
  jumpJustPressed: false, jumpHeld: false, dashJustPressed: false, empJustPressed: false,
  ultimateJustPressed: false, summonBossJustPressed: false, aimYaw: Math.PI / 2, aimPitch: 0, aimWorldPoint: null
};

test('vehicle heading drives acceleration, braking, reverse and boost independently of the combat camera', () => {
  for (const id of ['husky_ugv', 'sar', 'mars2020', 'hello_stretch', 'unitree_z1', 'baxter_dual_arm']) {
    assert.ok(isGroundDriveVehicle(id));
    const state = createInitialMarsCombatState(id, 0, true);
    state.enemies.length = 0;
    state.spawnTimer = 999;
    const step = (input, frames) => {
      for (let i = 0; i < frames; i++) stepMarsCombatWorld(state, 1 / 60, { ...combatInput, ...input });
    };
    step({ moveRight: 1 }, 12);
    assert.ok(state.yaw > 0.1 && Math.hypot(state.x, state.z) < 1e-5, id + ' pivot');
    step({ moveForward: 1, moveRight: 1 }, 12);
    const lateral = -Math.sin(state.yaw) * state.vx + Math.cos(state.yaw) * state.vz;
    assert.ok(Math.abs(lateral) < 1e-5 && state.vx > 1, id + ' drives an arc');
    step({ moveForward: -1 }, 1);
    assert.ok(state.vx > 0, 'reverse first brakes');
    step({ moveForward: -1 }, 25);
    assert.ok(state.vx * Math.cos(state.yaw) + state.vz * Math.sin(state.yaw) < -1);
    step({ moveForward: -1, dashJustPressed: true }, 1);
    assert.ok(Math.abs(-Math.sin(state.yaw) * state.vx + Math.cos(state.yaw) * state.vz) < 1e-5);
    assert.ok(state.vx * Math.cos(state.yaw) + state.vz * Math.sin(state.yaw) < -9);
  }
});

test('sandbox drive pivots at rest and coasts without changing direction when the throttle is released', () => {
  const spec = getSandboxActorSpec('husky_ugv');
  let state = createInitialKinematicState(spec);
  const input = { forward: false, backward: false, left: false, right: true, up: false, down: false, sprint: false };
  for (let i = 0; i < 12; i++) state = stepSandboxKinematics(state, input, spec, [], 1 / 60);
  assert.ok(state.yaw > 0.1 && Math.hypot(state.x, state.z) === 0);
  for (let i = 0; i < 16; i++) state = stepSandboxKinematics(state, { ...input, forward: true }, spec, [], 1 / 60);
  const speed = state.speed;
  const coast = stepSandboxKinematics(state, { ...input, right: false }, spec, [], 1 / 60);
  assert.ok(coast.speed > 0 && coast.speed < speed);
  assert.ok(Math.abs(-coast.vx * Math.sin(coast.yaw) + coast.vz * Math.cos(coast.yaw)) < 1e-6);
});
