import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as THREE from 'three';
import { createMarsCombatAssets } from './marsCombatAssets';
import { ENEMY_ARCHETYPE_SPECS } from './marsCombatEngine';
import { getSharedBeadBlastBumpMap } from './hybridRayTracing';
import { getOrBuildDecimatedLodGeometries } from './resilientGlbLoader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it('shares one decoded scene between the two hunter archetypes and displays it while its rig streams', async () => {
  const scene = deferred<THREE.Group>();
  const xml = deferred<string>();
  let decodes = 0;
  let jointReads = 0;
  const assets = createMarsCombatAssets(
    () => { decodes++; return scene.promise; },
    () => { jointReads++; return xml.promise; }
  );
  const runner = ENEMY_ARCHETYPE_SPECS.xeno_runner.glbUrls;
  const spitter = ENEMY_ARCHETYPE_SPECS.xeno_spitter.glbUrls;
  const first = assets.request(runner);
  const rigged = assets.request(runner, '/rig.urdf');
  for (let frame = 0; frame < 60; frame++) {
    assert.equal(assets.request(spitter), first);
    assert.equal(assets.request(spitter, '/rig.urdf'), rigged);
  }
  assert.equal(first.value, undefined);
  scene.resolve(new THREE.Group());
  const [plain, animated] = await Promise.all([first.promise, rigged.promise]);
  assert.equal(animated.template, plain.template);
  assert.equal(assets.request(spitter).value, plain);
  xml.resolve('<joint name="knee" type="revolute"><parent link="base"/><child link="leg"/></joint>');
  assert.equal((await animated.joints)?.[0].name, 'knee');
  assert.equal(decodes, 1);
  assert.equal(jointReads, 1);
  assets.dispose();
});

it('releases partial bundles and retries a failed decode without another request on every frame', async () => {
  let clockMs = 0;
  let partsReclaimed = 0;
  let goodLoads = 0;
  let badLoads = 0;
  const assets = createMarsCombatAssets(async (url) => {
    const part = new THREE.Group();
    if (url === 'bad' && ++badLoads === 1) throw new Error('decode interrupted');
    if (url === 'good') {
      goodLoads++;
      const geo = new THREE.BoxGeometry();
      geo.addEventListener('dispose', () => { partsReclaimed++; });
      part.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    }
    return part;
  }, undefined, () => clockMs);
  const first = assets.request(['good', 'bad']);
  await assert.rejects(first.promise, /decode interrupted/);
  assert.equal(partsReclaimed, 1);
  for (let frame = 0; frame < 60; frame++) assert.equal(assets.request(['good', 'bad']), first);
  clockMs = first.retryAt!;
  await assets.request(['good', 'bad']).promise;
  assert.equal(goodLoads, 2);
  assert.equal(badLoads, 2);
  assets.dispose();
  assert.equal(partsReclaimed, 2);
});

it('reclaims decoded and in-flight GPU assets while preserving shared surface textures', async () => {
  const started = deferred<void>();
  const late = deferred<THREE.Group>();
  const ownedMap = new THREE.Texture();
  const sharedBump = getSharedBeadBlastBumpMap();
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const material = new THREE.MeshStandardMaterial({ map: ownedMap, bumpMap: sharedBump });
  const resident = new THREE.Group().add(new THREE.Mesh(geo, material));
  const freed: string[] = [];
  const onSharedDispose = () => { freed.push('shared'); };
  sharedBump.addEventListener('dispose', onSharedDispose);
  ownedMap.addEventListener('dispose', () => { freed.push('texture'); });
  geo.addEventListener('dispose', () => { freed.push('geometry'); });
  material.addEventListener('dispose', () => { freed.push('material'); });
  const assets = createMarsCombatAssets(async (url) => {
    if (url === 'resident') return resident;
    started.resolve();
    return late.promise;
  });
  await assets.request(['resident']).promise;
  const lods = getOrBuildDecimatedLodGeometries(geo)!;
  lods.lod1.addEventListener('dispose', () => { freed.push('lod1'); });
  lods.lod2.addEventListener('dispose', () => { freed.push('lod2'); });
  const pending = assets.request(['late']);
  await started.promise;
  assets.dispose();
  const lateGeo = new THREE.BoxGeometry();
  lateGeo.addEventListener('dispose', () => { freed.push('late'); });
  late.resolve(new THREE.Group().add(new THREE.Mesh(lateGeo, new THREE.MeshStandardMaterial())));
  await assert.rejects(pending.promise, /unloaded/);
  assets.dispose();
  sharedBump.removeEventListener('dispose', onSharedDispose);
  assert.deepEqual(freed.sort(), ['geometry', 'late', 'lod1', 'lod2', 'material', 'texture']);
});
