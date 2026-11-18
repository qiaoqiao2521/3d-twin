import assert from 'node:assert/strict';
import { it } from 'node:test';
import { NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { alignCombatWeapon, attachBowArrowSocket, COMBAT_RETICLE_NDC_Y, sampleCombatReticle, updateCombatShoulderCamera } from './marsCombatAim';
import { createInitialMarsCombatState, getCombatWeaponSpec, getPlayableMechSpec, stepMarsCombatWorld, type CombatStepInput, type CombatWeaponId } from './marsCombatEngine';
import { createMountedSciFiPulseRifle } from './marsCombatSceneFX';
import { createArenaInteractiveTargets, findBestInteractiveTarget } from './signatureShowcaseEngine';
import { placePracticeProjectile } from './signatureShowcaseSceneFX';

const xAxis = new THREE.Vector3(1, 0, 0);

// Read the shipped geometry and hand hierarchy without a browser texture context.
async function readModel(io: NodeIO, path: string, size: number) {
  const doc = await io.read('public' + path);
  function build(node: Node): THREE.Object3D {
    const position = node.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION')?.getArray();
    const object = position
      ? new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(position, 3)))
      : new THREE.Group();
    object.name = node.getName();
    object.position.fromArray(node.getTranslation());
    object.quaternion.fromArray(node.getRotation());
    object.scale.fromArray(node.getScale());
    for (const child of node.listChildren()) object.add(build(child));
    return object;
  }
  const model = new THREE.Group();
  for (const root of doc.getRoot().listScenes()[0].listChildren()) model.add(build(root));
  const bounds = new THREE.Box3().setFromObject(model);
  const dims = bounds.getSize(new THREE.Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z);
  const center = bounds.getCenter(new THREE.Vector3());
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  return { pivot: new THREE.Group().add(model), scale };
}

const advance: CombatStepInput = {
  moveForward: 1, moveRight: 0.65, sprintHeld: true, fireHeld: true,
  dashJustPressed: false, empJustPressed: false, jumpJustPressed: false, jumpHeld: false,
  missileJustPressed: false, ultimateJustPressed: false, summonBossJustPressed: false,
  aimYaw: 0, aimPitch: 0, aimWorldPoint: null
};

it('a moving G1 hand and Husky turret fire from their visible sockets through the current shoulder view', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule()
  });
  const weapons: CombatWeaponId[] = ['pulse_rifle', 'railgun', 'compound_bow', 'missile_pod'];
  for (const mechId of ['unitree_g1', 'husky_ugv'] as const) {
    const spec = getPlayableMechSpec(mechId);
    const model = await readModel(io, spec.glbUrls[0], spec.targetMaxDim);
    const actor = new THREE.Group().add(model.pivot);
    const hand = mechId === 'unitree_g1';
    const mount = hand ? model.pivot.getObjectByName('right_hand_palm_link')! : new THREE.Group();
    assert.ok(mount);
    if (!hand) {
      mount.position.set(0.18, 1.06, 0.22);
      model.pivot.add(mount);
    }
    const rifle = createMountedSciFiPulseRifle(mechId, hand, hand ? 1 / model.scale : 1, () => new THREE.Texture());
    mount.add(rifle.group);
    if (hand) rifle.group.position.set(0.03, 0, 0.01);
    const bow = (await readModel(io, '/robotics_glb/tactical_compound_bow.glb', 0.98)).pivot;
    bow.position.set(0.28, -0.44, 0);
    rifle.group.add(bow);
    const arrow = attachBowArrowSocket(bow)!;
    assert.equal(arrow.parent?.name, 'bow_plasma_arrowhead');
    const camera = new THREE.PerspectiveCamera(52, 1280 / 633, 0.1, 280);
    const state = createInitialMarsCombatState(mechId, 0, true);
    state.enemies.length = 0;
    state.spawnTimer = 999;
    let lastYaw: number | null = null;
    for (const [index, weapon] of weapons.entries()) {
      const yaw = [0.18, 1.8, -2.15, 0.75][index];
      const pitch = [-0.16, 0.29, -0.32, 0.18][index];
      state.hitstopTimer = state.weaponCooldown = state.spreadBloom = 0;
      state.activeWeapon = weapon;
      state.projectiles.forEach((p) => { p.active = false; });
      const before = new THREE.Vector3(state.x, state.y, state.z);
      const target = new THREE.Vector3();
      const socket = weapon === 'compound_bow' ? arrow : rifle.muzzleSocket;
      const input = { ...advance, aimYaw: yaw, aimPitch: pitch };
      stepMarsCombatWorld(state, 0.016, input, () => {
        actor.position.set(state.x, state.y, state.z);
        assert.ok(actor.position.distanceTo(before) > 1e-4, 'sample after this tick moved the chassis');
        actor.rotation.set(0.17, -state.yaw, -0.12, 'YXZ');
        const wrist = model.pivot.getObjectByName('right_wrist_yaw_link');
        if (wrist) wrist.rotation.z = index * 0.36;
        updateCombatShoulderCamera(camera, state, yaw, pitch, 0.016, index / 60, lastYaw);
        camera.position.add(new THREE.Vector3(0.017, -0.009, 0.006));
        lastYaw = yaw;
        rifle.updateWeaponVisuals(weapon, 0, state.recoilPos);
        const grip = rifle.group.getWorldPosition(new THREE.Vector3());
        const reach = socket.getWorldPosition(new THREE.Vector3()).distanceTo(grip);
        const uid = sampleCombatReticle(camera, grip, reach, [], target);
        alignCombatWeapon(rifle.group, socket, target);
        return { aimWorldPoint: target.toArray(), muzzleWorldPoint: socket.getWorldPosition(new THREE.Vector3()).toArray(), reticleEnemyUid: uid };
      });

      const tip = socket.getWorldPosition(new THREE.Vector3());
      const direction = target.clone().sub(tip).normalize();
      const barrel = xAxis.clone().transformDirection(socket.matrixWorld);
      assert.ok(barrel.angleTo(direction) < 1e-6, mechId + ' ' + weapon + ' mesh axis');
      const projected = target.clone().project(camera);
      assert.ok(Math.hypot(projected.x * 640, (projected.y - COMBAT_RETICLE_NDC_Y) * 316.5) < 1e-6);
      const shots = state.projectiles.filter((p) => p.active && p.fromPlayer);
      assert.equal(shots.length, weapon === 'missile_pod' ? 4 : 1);
      const center = new THREE.Vector3();
      for (const shot of shots) {
        assert.ok(tip.distanceTo(new THREE.Vector3(shot.prevX, shot.prevY, shot.prevZ)) < 1e-6, 'launch origin on rendered socket');
        center.add(new THREE.Vector3(shot.vx, shot.vy, shot.vz));
      }
      const spread = weapon === 'missile_pod' ? 0 : getCombatWeaponSpec(weapon).spreadRad;
      assert.ok(center.angleTo(direction) < spread + 1e-6, 'centreline differs only by weapon spread');
    }
    rifle.dispose();
  }
});

it('near cover occludes a distant enemy and only the visible reticle hit supplies a lock', () => {
  const camera = new THREE.PerspectiveCamera(52, 1.5, 0.1, 100);
  camera.position.set(-5, 2, 1);
  camera.lookAt(20, 1.5, 0);
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, COMBAT_RETICLE_NDC_Y), camera);
  const cover = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
  const enemy = cover.clone();
  const rig = new THREE.Group().add(enemy);
  rig.userData.combatEnemyUid = 17;
  ray.ray.at(22, rig.position);
  ray.ray.at(11, cover.position);
  rig.updateMatrixWorld(true);
  cover.updateMatrixWorld();
  const grip = ray.ray.at(6, new THREE.Vector3());
  const hit = new THREE.Vector3();
  assert.equal(sampleCombatReticle(camera, grip, 0.8, [rig, cover], hit), null);
  assert.ok(hit.distanceTo(camera.position) < 12);
  assert.equal(sampleCombatReticle(camera, grip, 0.8, [rig], hit), 17);
});

it('a salvo tracks the pointed enemy and flies free when the reticle sees empty space', () => {
  const state = createInitialMarsCombatState('husky_ugv', 0, true);
  state.activeWeapon = 'missile_pod';
  assert.ok(state.enemies.length > 1);
  for (const lock of [null, state.enemies[1].uid]) {
    state.weaponCooldown = 0;
    state.projectiles.forEach((p) => { p.active = false; });
    stepMarsCombatWorld(state, 0.016, advance, () => ({
      aimWorldPoint: [25, 3, 0], muzzleWorldPoint: [1, 2, 0], reticleEnemyUid: lock
    }));
    const salvo = state.projectiles.filter((p) => p.active && p.fromPlayer);
    assert.equal(salvo.length, 4);
    assert.ok(salvo.every((p) => p.homingTargetUid === lock));
  }
});

it('practice shots respect a clicked target and keep their nose on the displayed trajectory', () => {
  const target = { ...createArenaInteractiveTargets('land', () => 0)[0], x: -5, y: 0, z: 0 };
  const frontCone = Math.cos(Math.PI / 18);
  assert.equal(findBestInteractiveTarget([target], 0, 0, 0, 0, null, frontCone), null);
  assert.equal(findBestInteractiveTarget([target], 0, 0, 0, 0, target.id, frontCone), target);
  const start = new THREE.Vector3(2, 1.25, -3);
  const end = new THREE.Vector3(-4, 1.8, 13);
  const mesh = new THREE.Object3D();
  const endSample = new THREE.Object3D();
  for (const arc of [0, 0.35, 3.4]) {
    for (const t of [0.1, 0.5, 0.9]) {
      placePracticeProjectile(mesh, start, end, t, arc, 2.1);
      placePracticeProjectile(endSample, start, end, t + 0.00001, arc, 2.1);
      const tangent = endSample.position.clone().sub(mesh.position).normalize();
      assert.ok(xAxis.clone().applyQuaternion(mesh.quaternion).angleTo(tangent) < 0.00002);
    }
  }
});
