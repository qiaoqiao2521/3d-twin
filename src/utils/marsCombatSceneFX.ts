import * as THREE from 'three';
import { sampleLandTerrainHeight } from './actionSandboxEngine';
import {
  CombatProjectile,
  GroundTelegraphHazard,
  CombatPickup,
  CombatEnemyEntity,
  PlayerMechId,
  CombatWeaponId
} from './marsCombatEngine';

const _dummyObj = new THREE.Object3D();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();

/**
 * Generates seamless Martian Jezero Iron-Oxide Regolith Albedo + Micro-Relief Bump CanvasTextures.
 * 100% procedural zero-404 textures with SRGBColorSpace on color map and Linear on bumpMap.
 */
export function createSoftGlowSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const grad = ctx.createRadialGradient(32, 32, 0.5, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.26, 'rgba(255, 246, 228, 0.85)');
  grad.addColorStop(0.58, 'rgba(255, 220, 185, 0.24)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSoftShadowDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(8, 3, 3, 0.62)');
  grad.addColorStop(0.52, 'rgba(8, 3, 3, 0.30)');
  grad.addColorStop(1.0, 'rgba(8, 3, 3, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMartianBattlefieldTextures(maxAnisotropy: number): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = size;
  cBump.height = size;
  const bCtx = cBump.getContext('2d')!;

  ctx.fillStyle = '#5e2919';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Wind-rippled Martian dune strata
  for (let y = 0; y < size; y += 6) {
    const wave = Math.sin((y / size) * Math.PI * 8) * 14;
    ctx.strokeStyle = y % 12 === 0 ? 'rgba(194, 94, 52, 0.20)' : 'rgba(34, 14, 9, 0.22)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.33, y + wave, size * 0.66, y - wave, size, y);
    ctx.stroke();

    bCtx.strokeStyle = y % 12 === 0 ? 'rgba(215, 215, 215, 0.26)' : 'rgba(45, 45, 45, 0.26)';
    bCtx.lineWidth = 2.6;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.bezierCurveTo(size * 0.33, y + wave, size * 0.66, y - wave, size, y);
    bCtx.stroke();
  }

  // Basalt gravel & hematite mineral flecks
  for (let i = 0; i < 1800; i++) {
    const x = (i * 73) % size;
    const y = (i * 139) % size;
    const rad = 0.7 + (i % 3) * 0.55;
    ctx.fillStyle =
      i % 4 === 0
        ? 'rgba(218, 122, 76, 0.16)'
        : i % 2 === 0
          ? 'rgba(112, 54, 36, 0.18)'
          : 'rgba(42, 18, 12, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    const lum = i % 2 === 0 ? 156 : 98;
    bCtx.fillStyle = 'rgba(' + lum + ',' + lum + ',' + lum + ',0.16)';
    bCtx.beginPath();
    bCtx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const albedoMap = new THREE.CanvasTexture(cColor);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.repeat.set(56, 56);
  albedoMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(56, 56);
  bumpMap.anisotropy = maxAnisotropy;

  return { albedoMap, bumpMap };
}

/**
 * Builds the Martian Jezero Battlefield Environment:
 * - 190m x 190m continuous analytical terrain mesh extending well beyond the 68m combat perimeter
 * - Natural basalt canyon cliffs & multi-part sci-fi Mars relay pylons around perimeter (no indoor box walls!)
 * - Overhead Futuristic Orbital Carrier Silhouette Landmark visible in initial spawn vista!
 */
export function createMarsBattlefieldEnvironment(maxAnisotropy: number, isSoftwareGl: boolean) {
  const root = new THREE.Group();
  const { albedoMap, bumpMap } = createMartianBattlefieldTextures(maxAnisotropy);
  const dustGlowTex = createSoftGlowSpriteTexture();

  // 0. Martian Dusk Rayleigh Atmospheric Sky Dome
  const skyProfile: THREE.Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const theta = (k / 16) * Math.PI;
    skyProfile.push(
      new THREE.Vector2(Math.max(0.01, Math.sin(theta) * 245), -Math.cos(theta) * 245)
    );
  }
  const skyDomeGeo = new THREE.LatheGeometry(skyProfile, 32);
  const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vSkyDir;
      void main() {
        vSkyDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vSkyDir;
      void main() {
        float h = clamp(vSkyDir.y, -0.15, 1.0);
        vec3 horizon = vec3(0.80, 0.45, 0.30);
        vec3 midSky = vec3(0.42, 0.19, 0.17);
        vec3 zenith = vec3(0.09, 0.05, 0.08);
        vec3 sunDir = normalize(vec3(0.72, 0.24, -0.22));
        float sunHalo = pow(max(0.0, dot(normalize(vSkyDir), sunDir)), 10.0);
        vec3 col = h < 0.30
          ? mix(horizon, midSky, smoothstep(-0.08, 0.30, h))
          : mix(midSky, zenith, smoothstep(0.30, 0.92, h));
        col += vec3(0.98, 0.64, 0.36) * sunHalo * 0.46;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  skyDome.frustumCulled = false;
  root.add(skyDome);

  // 1. Continuous Martian Desert Terrain
  const segs = isSoftwareGl ? 96 : 136;
  const terrainGeo = new THREE.PlaneGeometry(210, 210, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const r = Math.hypot(vx, vz);
    // Natural outer crater rim uplift beyond 70m combat zone
    const rimRise = r > 70 ? Math.pow((r - 70) / 28, 1.85) * 6.5 : 0;
    pos.setY(i, sampleLandTerrainHeight(vx, vz) + rimRise);
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedoMap,
    bumpMap,
    bumpScale: 0.05,
    roughness: 0.88,
    metalness: 0.06
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  root.add(terrainMesh);

  // 2. Natural Perimeter Basalt Outcrops (InstancedMesh, varied scale & tint)
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
  const rPos = rockGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const rx = rPos.getX(i);
    const ry = rPos.getY(i);
    const rz = rPos.getZ(i);
    // Flatten underside and bevel angular basalt facets
    rPos.setXYZ(
      i,
      rx * (1 + 0.18 * Math.sin(ry * 3.1)),
      ry < 0 ? ry * 0.45 : ry * 1.25,
      rz * (1 + 0.18 * Math.cos(rx * 2.7))
    );
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x6b3222,
    roughness: 0.88,
    metalness: 0.12
  });
  const rockCount = 44;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2 + (i % 3) * 0.06;
    const rad = 72 + (i % 4) * 5.5;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const y = sampleLandTerrainHeight(x, z) + Math.pow((rad - 70) / 28, 1.85) * 6.5 - 0.3;
    _dummyObj.position.set(x, y, z);
    _dummyObj.rotation.set((i % 5) * 0.08, ang + i * 0.7, 0);
    const sx = 3.2 + (i % 4) * 1.3;
    const sy = 2.4 + (i % 5) * 1.6;
    const sz = 2.8 + (i % 3) * 1.2;
    _dummyObj.scale.set(sx, sy, sz);
    _dummyObj.updateMatrix();
    rockInst.setMatrixAt(i, _dummyObj.matrix);
    _col.setHSL(0.035 + (i % 4) * 0.006, 0.48, 0.22 + (i % 3) * 0.05);
    rockInst.setColorAt(i, _col);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  root.add(rockInst);

  // 3. Multi-Part Sci-Fi Colony Defense Beacons around Mid-Perimeter (6 composite towers, 5 parts each)
  const pylonGroup = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.68, metalness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.28, metalness: 0.88 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00b8d4,
    emissiveIntensity: 1.8,
    roughness: 0.2
  });
  const baseGeo = new THREE.CylinderGeometry(1.1, 1.55, 1.2, 6);
  const mastGeo = new THREE.BoxGeometry(0.62, 6.8, 0.62);
  const finGeo = new THREE.BoxGeometry(0.14, 3.8, 1.35);
  const emitterGeo = new THREE.OctahedronGeometry(0.52, 0);

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.38;
    const rad = 56;
    const px = Math.cos(ang) * rad;
    const pz = Math.sin(ang) * rad;
    const py = sampleLandTerrainHeight(px, pz);

    const tower = new THREE.Group();
    tower.position.set(px, py, pz);
    tower.rotation.y = -ang;

    const base = new THREE.Mesh(baseGeo, hullMat);
    base.position.y = 0.55;
    const mast = new THREE.Mesh(mastGeo, hullMat);
    mast.position.y = 4.2;
    const finA = new THREE.Mesh(finGeo, trimMat);
    finA.position.set(0, 4.8, 0);
    const finB = new THREE.Mesh(finGeo, trimMat);
    finB.position.set(0, 4.8, 0);
    finB.rotation.y = Math.PI / 2;
    const emitter = new THREE.Mesh(emitterGeo, beaconMat);
    emitter.position.y = 8.15;

    tower.add(base, mast, finA, finB, emitter);
    pylonGroup.add(tower);
  }
  root.add(pylonGroup);

  // 4. Spawn Vista Hero Landmark: Colossal Orbital Frigate Silhouette hovering in forward +X Martian sky!
  const cruiser = new THREE.Group();
  cruiser.position.set(58, 22, -12);
  cruiser.rotation.set(0.05, -0.32, -0.06);
  const shipHullMat = new THREE.MeshStandardMaterial({ color: 0x1e2533, roughness: 0.58, metalness: 0.76 });
  const shipEngineMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x00e5ff,
    emissiveIntensity: 2.6,
    roughness: 0.2
  });
  const spine = new THREE.Mesh(new THREE.BoxGeometry(28, 3.4, 5.8), shipHullMat);
  const prow = new THREE.Mesh(new THREE.ConeGeometry(3.6, 11.5, 4), shipHullMat);
  prow.rotation.z = Math.PI / 2;
  prow.position.x = -18.5;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.0, 3.4), shipHullMat);
  bridge.position.set(4, 3.0, 0);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(12, 0.75, 14), shipHullMat);
  wingL.position.set(3, -0.4, 0);
  const thrusterA = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 2.4, 12), shipEngineMat);
  thrusterA.rotation.z = Math.PI / 2;
  thrusterA.position.set(14.5, 0.2, -1.9);
  const thrusterB = thrusterA.clone();
  thrusterB.position.set(14.5, 0.2, 1.9);
  cruiser.add(spine, prow, bridge, wingL, thrusterA, thrusterB);
  root.add(cruiser);

  // 5. Drifting Atmospheric Martian Dust Motes (soft radial sprite — zero square points!)
  const dustCount = 180;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 110;
    dustPos[i * 3 + 1] = 0.6 + Math.random() * 12;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 110;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xfdba74,
    map: dustGlowTex,
    size: 0.28,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  root.add(dustPoints);

  const updateAtmosphere = (dt: number, playerX: number, playerZ: number, simTime: number) => {
    cruiser.position.y = 22 + Math.sin(simTime * 0.45) * 0.75;
    const arr = dustGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < dustCount; i++) {
      let x = arr[i * 3] + dt * 3.8;
      const z = arr[i * 3 + 2] + dt * 1.2;
      if (x - playerX > 55) x -= 110;
      if (x - playerX < -55) x += 110;
      arr[i * 3] = x;
      arr[i * 3 + 2] = z;
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  const dispose = () => {
    albedoMap.dispose();
    bumpMap.dispose();
    dustGlowTex.dispose();
    skyDomeGeo.dispose();
    skyDomeMat.dispose();
    terrainGeo.dispose();
    terrainMat.dispose();
    rockGeo.dispose();
    rockMat.dispose();
    baseGeo.dispose();
    mastGeo.dispose();
    finGeo.dispose();
    emitterGeo.dispose();
    hullMat.dispose();
    trimMat.dispose();
    beaconMat.dispose();
    shipHullMat.dispose();
    shipEngineMat.dispose();
    dustGeo.dispose();
    dustMat.dispose();
  };

  return { root, terrainMesh, updateAtmosphere, dispose };
}

/**
 * Zero-GC Pooled Combat VFX Controller:
 * - InstancedMesh Projectiles (Player Pulse / Railgun / Homing Missiles / Boss Salvo Missiles)
 * - Ground Holographic AoE Countdown Telegraph Rings + Orbital Lightning Pillars
 * - Boss Volumetric Coral Sweeping Laser Beam + Phase 2 Coral Overdrive Dome
 * - Player EMP Nova Sphere + Player Orbital Ion Cannon Sky-Beam
 * - Pooled Particle Burst Ring Buffer (320 sparks/embers)
 * - Composite Multi-Part Rotating 3D Pickups (Repair Cores & Overcharge Cells)
 */
export function createMarsCombatVFXController() {
  const root = new THREE.Group();
  const sparkGlowTex = createSoftGlowSpriteTexture();
  const pkShadowTex = createSoftShadowDiscTexture();

  // 1. Pooled Instanced Projectiles (max 96 — initialized off-screen at y=-999 so Title Screen has zero origin artifacts!)
  const projGeo = new THREE.CapsuleGeometry(0.11, 0.95, 4, 8);
  projGeo.rotateX(Math.PI / 2);
  const projMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const projInst = new THREE.InstancedMesh(projGeo, projMat, 96);
  projInst.frustumCulled = false;
  _dummyObj.position.set(0, -999, 0);
  _dummyObj.scale.setScalar(0.0001);
  _dummyObj.updateMatrix();
  for (let i = 0; i < 96; i++) {
    projInst.setMatrixAt(i, _dummyObj.matrix);
    projInst.setColorAt(i, _col.setHex(0x00e5ff));
  }
  projInst.instanceMatrix.needsUpdate = true;
  if (projInst.instanceColor) projInst.instanceColor.needsUpdate = true;
  root.add(projInst);

  // 2. Pooled Explosion Sparks & Exhaust Flares Ring Buffer (320 soft radial glow sprites — zero white squares!)
  const SPARK_MAX = 320;
  const sPos = new Float32Array(SPARK_MAX * 3);
  const sVel = new Float32Array(SPARK_MAX * 3);
  const sCol = new Float32Array(SPARK_MAX * 3);
  const sLife = new Float32Array(SPARK_MAX);
  for (let i = 0; i < SPARK_MAX; i++) sPos[i * 3 + 1] = -999;

  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    map: sparkGlowTex,
    size: 0.56,
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  root.add(sparkPoints);
  let sparkCursor = 0;

  const spawnExplosionBurst = (x: number, y: number, z: number, scale: number, hex: string) => {
    _col.set(hex);
    const count = Math.min(36, Math.round(14 * scale));
    for (let i = 0; i < count; i++) {
      const idx = sparkCursor % SPARK_MAX;
      sparkCursor++;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = (4 + Math.random() * 11) * Math.sqrt(scale);
      sPos[idx * 3] = x;
      sPos[idx * 3 + 1] = y;
      sPos[idx * 3 + 2] = z;
      sVel[idx * 3] = Math.sin(phi) * Math.cos(theta) * spd;
      sVel[idx * 3 + 1] = Math.abs(Math.cos(phi)) * spd + 2.5;
      sVel[idx * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
      sCol[idx * 3] = _col.r;
      sCol[idx * 3 + 1] = _col.g;
      sCol[idx * 3 + 2] = _col.b;
      sLife[idx] = 0.35 + Math.random() * 0.45;
    }
  };

  // 3. Ground AoE Telegraph Pool (8 slots, each with outer boundary ring + inner countdown fill disc + vertical strike pillar)
  const MAX_TELEGRAPHS = 8;
  const telegraphSlots: {
    group: THREE.Group;
    outerRing: THREE.Mesh;
    fillDisc: THREE.Mesh;
    pillar: THREE.Mesh;
  }[] = [];
  const ringGeo = new THREE.RingGeometry(0.88, 1.0, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1.0, 32);
  discGeo.rotateX(-Math.PI / 2);
  const pillarGeo = new THREE.CylinderGeometry(0.55, 0.85, 36, 16, 1, true);
  pillarGeo.translate(0, 18, 0);

  for (let i = 0; i < MAX_TELEGRAPHS; i++) {
    const g = new THREE.Group();
    g.visible = false;
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff2a55,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff2a55,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerRing = new THREE.Mesh(ringGeo, outerMat);
    const fillDisc = new THREE.Mesh(discGeo, fillMat);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.visible = false;
    g.add(outerRing, fillDisc, pillar);
    root.add(g);
    telegraphSlots.push({ group: g, outerRing, fillDisc, pillar });
  }

  // 4. Boss Volumetric Sweeping Coral Laser Beam (Inner White Core + Outer Crimson Sheath + Charge Sphere)
  const bossLaserGroup = new THREE.Group();
  bossLaserGroup.visible = false;
  const coreBeamGeo = new THREE.CylinderGeometry(0.18, 0.22, 40, 12);
  coreBeamGeo.rotateZ(-Math.PI / 2);
  coreBeamGeo.translate(20, 0, 0);
  const sheathBeamGeo = new THREE.CylinderGeometry(0.52, 0.68, 40, 16, 1, true);
  sheathBeamGeo.rotateZ(-Math.PI / 2);
  sheathBeamGeo.translate(20, 0, 0);
  const coreBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sheathBeamMat = new THREE.MeshBasicMaterial({
    color: 0xff1e4d,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const chargeSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff3b6b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const coreBeamMesh = new THREE.Mesh(coreBeamGeo, coreBeamMat);
  const sheathBeamMesh = new THREE.Mesh(sheathBeamGeo, sheathBeamMat);
  bossLaserGroup.add(chargeSphere, coreBeamMesh, sheathBeamMesh);
  root.add(bossLaserGroup);

  // 5. Player EMP Nova Sphere & Player Orbital Ion Cannon Sky-Beam
  const empSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  empSphere.visible = false;
  root.add(empSphere);

  const orbitalIonBeam = new THREE.Group();
  orbitalIonBeam.visible = false;
  const ionCore = new THREE.Mesh(
    pillarGeo,
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ionCore.scale.set(1.6, 2.2, 1.6);
  const ionOuter = new THREE.Mesh(
    pillarGeo,
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ionOuter.scale.set(4.2, 2.2, 4.2);
  orbitalIonBeam.add(ionCore, ionOuter);
  root.add(orbitalIonBeam);

  // 6. Orbital Drop-Pod Reentry Streaks Pool (6 slots for incoming enemies/Boss)
  const dropStreaks: THREE.Mesh[] = [];
  const streakGeo = new THREE.CylinderGeometry(0.08, 0.85, 24, 10, 1, true);
  streakGeo.translate(0, 12, 0);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(
      streakGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff4d4d,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    m.visible = false;
    root.add(m);
    dropStreaks.push(m);
  }

  // 7. Composite 4-Part 3D Combat Pickups Pool (8 slots: Outer Gyro Ring + Inner Crystal Octahedron + Top/Bottom Caps + Contact Shadow)
  const pickupSlots: {
    group: THREE.Group;
    core: THREE.Mesh;
    ring: THREE.Mesh;
    coreMat: THREE.MeshStandardMaterial;
    ringMat: THREE.MeshStandardMaterial;
  }[] = [];
  const pkCoreGeo = new THREE.OctahedronGeometry(0.36, 0);
  const pkRingGeo = new THREE.TorusGeometry(0.52, 0.055, 8, 24);
  const pkShadowGeo = new THREE.PlaneGeometry(1.4, 1.4);
  pkShadowGeo.rotateX(-Math.PI / 2);
  const pkShadowMat = new THREE.MeshBasicMaterial({
    map: pkShadowTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });

  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    g.visible = false;
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.6
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.25,
      metalness: 0.88
    });
    const core = new THREE.Mesh(pkCoreGeo, coreMat);
    const ring = new THREE.Mesh(pkRingGeo, ringMat);
    const shadow = new THREE.Mesh(pkShadowGeo, pkShadowMat);
    shadow.position.y = -0.52;
    g.add(core, ring, shadow);
    root.add(g);
    pickupSlots.push({ group: g, core, ring, coreMat, ringMat });
  }

  const update = (params: {
    dt: number;
    simTime: number;
    projectiles: CombatProjectile[];
    hazards: GroundTelegraphHazard[];
    pickups: CombatPickup[];
    enemies: CombatEnemyEntity[];
    empWaveTimer: number;
    empWaveOrigin: [number, number, number];
    ultimateBeamTimer: number;
    ultimateBeamTarget: [number, number, number];
    explosions: { x: number; y: number; z: number; scale: number; colorHex: string }[];
    wingmanSlash?: { x: number; y: number; z: number; yaw: number; flashTimer: number };
  }) => {
    const {
      dt,
      simTime,
      projectiles,
      hazards,
      pickups,
      enemies,
      empWaveTimer,
      empWaveOrigin,
      ultimateBeamTimer,
      ultimateBeamTarget,
      explosions
    } = params;

    for (const ex of explosions) {
      spawnExplosionBurst(ex.x, ex.y, ex.z, ex.scale, ex.colorHex);
    }

    // Update Instanced Projectiles + Missile exhaust sparks
    for (let i = 0; i < 96; i++) {
      const p = projectiles[i];
      if (!p || !p.active) {
        _dummyObj.position.set(0, -999, 0);
        _dummyObj.scale.setScalar(0.001);
        _dummyObj.updateMatrix();
        projInst.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }

      _dummyObj.position.set(p.x, p.y, p.z);
      _v1.set(p.vx, p.vy, p.vz);
      if (_v1.lengthSq() > 0.001) {
        _v1.normalize();
        _quat.setFromUnitVectors(_v2.set(0, 0, 1), _v1);
        _dummyObj.quaternion.copy(_quat);
      }
      const lenScale = p.kind === 'rail' ? 3.2 : p.kind === 'pulse' ? 1.35 : 1.15;
      const radScale = p.kind === 'rail' ? 1.45 : p.kind === 'boss_missile' ? 1.5 : 1.0;
      _dummyObj.scale.set(radScale, radScale, lenScale);
      _dummyObj.updateMatrix();
      projInst.setMatrixAt(i, _dummyObj.matrix);

      if (p.kind === 'pulse') _col.setHex(0x00e5ff);
      else if (p.kind === 'rail') _col.setHex(0xfbbf24);
      else if (p.kind === 'missile') _col.setHex(0xfb7185);
      else if (p.kind === 'boss_missile') _col.setHex(0xff5500);
      else _col.setHex(0xff2a55);
      projInst.setColorAt(i, _col);

      // Emit missile exhaust trail spark
      if ((p.kind === 'missile' || p.kind === 'boss_missile') && Math.random() < 0.65) {
        const idx = sparkCursor % SPARK_MAX;
        sparkCursor++;
        sPos[idx * 3] = p.x;
        sPos[idx * 3 + 1] = p.y;
        sPos[idx * 3 + 2] = p.z;
        sVel[idx * 3] = (Math.random() - 0.5) * 1.6;
        sVel[idx * 3 + 1] = (Math.random() - 0.5) * 1.6;
        sVel[idx * 3 + 2] = (Math.random() - 0.5) * 1.6;
        sCol[idx * 3] = 1.0;
        sCol[idx * 3 + 1] = p.fromPlayer ? 0.55 : 0.35;
        sCol[idx * 3 + 2] = p.fromPlayer ? 0.68 : 0.1;
        sLife[idx] = 0.22;
      }
    }
    projInst.instanceMatrix.needsUpdate = true;
    if (projInst.instanceColor) projInst.instanceColor.needsUpdate = true;

    // Update Sparks Ring Buffer
    for (let i = 0; i < SPARK_MAX; i++) {
      if (sLife[i] > 0) {
        sLife[i] -= dt;
        if (sLife[i] <= 0) {
          sPos[i * 3 + 1] = -999;
        } else {
          sPos[i * 3] += sVel[i * 3] * dt;
          sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
          sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
          sVel[i * 3 + 1] -= 14.0 * dt;
        }
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    // Update Ground AoE Telegraph Rings & Orbital Strike Pillars
    for (let i = 0; i < MAX_TELEGRAPHS; i++) {
      const slot = telegraphSlots[i];
      const h = hazards[i];
      if (!h) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      slot.group.position.set(h.x, h.y + 0.06, h.z);
      const isCyan = h.kind === 'orbital_pillar';
      const hex = isCyan ? 0x00e5ff : 0xff2a55;
      (slot.outerRing.material as THREE.MeshBasicMaterial).color.setHex(hex);
      (slot.fillDisc.material as THREE.MeshBasicMaterial).color.setHex(hex);
      slot.outerRing.scale.setScalar(h.radius);

      if (!h.detonated) {
        const prog = Math.min(1, h.elapsed / Math.max(0.1, h.windupDuration));
        slot.fillDisc.scale.setScalar(Math.max(0.05, h.radius * prog));
        (slot.fillDisc.material as THREE.MeshBasicMaterial).opacity = 0.16 + prog * 0.34;
        slot.pillar.visible = false;
      } else {
        slot.fillDisc.scale.setScalar(h.radius);
        (slot.fillDisc.material as THREE.MeshBasicMaterial).opacity = 0.5 * (h.lingerTimer / 0.4);
        slot.pillar.visible = h.kind === 'orbital_pillar' || h.kind === 'boss_phase_nova';
        (slot.pillar.material as THREE.MeshBasicMaterial).color.setHex(hex);
        slot.pillar.scale.set(h.radius * 0.65, 1, h.radius * 0.65);
        (slot.pillar.material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.9,
          h.lingerTimer * 2.2
        );
      }
    }

    // Update Boss Sweeping Searing Coral Laser Beam
    const boss = enemies.find((e) => e.isBoss && e.koTimer <= 0);
    if (
      boss &&
      boss.bossAttackKind === 'coral_laser_sweep' &&
      (boss.attackPhase === 'windup' || boss.attackPhase === 'active')
    ) {
      bossLaserGroup.visible = true;
      bossLaserGroup.position.set(boss.x, boss.y + 2.1, boss.z);
      bossLaserGroup.rotation.y = -boss.laserSweepCurrentYaw;
      if (boss.attackPhase === 'windup') {
        const pulse = 0.6 + Math.sin(simTime * 28) * 0.35;
        chargeSphere.scale.setScalar(pulse * 1.45);
        coreBeamMesh.visible = true;
        sheathBeamMesh.visible = false;
        coreBeamMesh.scale.set(1, 0.14, 0.14); // Thin aiming telegraph laser line!
      } else {
        chargeSphere.scale.setScalar(1.35);
        coreBeamMesh.visible = true;
        sheathBeamMesh.visible = true;
        coreBeamMesh.scale.set(1, 1, 1);
        const wobble = 1 + Math.sin(simTime * 42) * 0.16;
        sheathBeamMesh.scale.set(1, wobble, wobble);
      }
    } else {
      bossLaserGroup.visible = false;
    }

    // Update Orbital Drop-Pod Streaks for incoming enemies
    let streakIdx = 0;
    for (const e of enemies) {
      if (e.dropPodProgress < 1 && streakIdx < dropStreaks.length) {
        const st = dropStreaks[streakIdx++];
        st.visible = true;
        const dropAlt = (1 - e.dropPodProgress) * 42;
        st.position.set(e.x, e.y + dropAlt, e.z);
        st.scale.setScalar(e.isBoss ? 2.4 : 1.0);
      }
    }
    for (let k = streakIdx; k < dropStreaks.length; k++) {
      dropStreaks[k].visible = false;
    }

    // Update Player EMP Nova Sphere
    if (empWaveTimer > 0) {
      empSphere.visible = true;
      const t = 1 - empWaveTimer / 0.65;
      empSphere.position.set(empWaveOrigin[0], empWaveOrigin[1], empWaveOrigin[2]);
      empSphere.scale.setScalar(1 + t * 12.5);
      (empSphere.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.78;
    } else {
      empSphere.visible = false;
    }

    // Update Player Orbital Ion Cannon Sky-Beam
    if (ultimateBeamTimer > 0) {
      orbitalIonBeam.visible = true;
      orbitalIonBeam.position.set(
        ultimateBeamTarget[0],
        ultimateBeamTarget[1],
        ultimateBeamTarget[2]
      );
      const fade = Math.min(1, ultimateBeamTimer * 1.4);
      const pulse = 0.88 + Math.sin(simTime * 36) * 0.15;
      orbitalIonBeam.scale.set(fade * pulse, 1, fade * pulse);
    } else {
      orbitalIonBeam.visible = false;
    }

    // Update Rotating 3D Pickups
    for (let i = 0; i < pickupSlots.length; i++) {
      const slot = pickupSlots[i];
      const pk = pickups[i];
      if (!pk) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      slot.group.position.set(pk.x, pk.y + Math.sin(simTime * 3.5 + pk.id) * 0.14, pk.z);
      slot.core.rotation.y = simTime * 2.4;
      slot.core.rotation.x = simTime * 1.3;
      slot.ring.rotation.x = Math.PI / 3 + Math.sin(simTime * 2.0) * 0.4;
      slot.ring.rotation.z = simTime * 1.8;

      if (pk.kind === 'repair_core') {
        slot.coreMat.color.setHex(0x10b981);
        slot.coreMat.emissive.setHex(0x059669);
      } else {
        slot.coreMat.color.setHex(0xf59e0b);
        slot.coreMat.emissive.setHex(0xd97706);
      }
    }

    // 8. Pooled Ejected Brass/Energy Shell Casings (28 InstancedMesh slots arcing rightward with spin & gravity)
    for (let i = 0; i < SHELL_MAX; i++) {
      if (shellLife[i] <= 0) {
        _dummyObj.position.set(0, -999, 0);
        _dummyObj.scale.setScalar(0.0001);
        _dummyObj.updateMatrix();
        shellInst.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }
      shellLife[i] -= dt;
      shellPos[i * 3] += shellVel[i * 3] * dt;
      shellPos[i * 3 + 1] += shellVel[i * 3 + 1] * dt;
      shellPos[i * 3 + 2] += shellVel[i * 3 + 2] * dt;
      shellVel[i * 3 + 1] -= 18.5 * dt;
      const gFloor = sampleLandTerrainHeight(shellPos[i * 3], shellPos[i * 3 + 2]) + 0.04;
      if (shellPos[i * 3 + 1] < gFloor) {
        shellPos[i * 3 + 1] = gFloor;
        shellVel[i * 3 + 1] = Math.abs(shellVel[i * 3 + 1]) * 0.35;
        shellVel[i * 3] *= 0.6;
        shellVel[i * 3 + 2] *= 0.6;
      }
      _dummyObj.position.set(shellPos[i * 3], shellPos[i * 3 + 1], shellPos[i * 3 + 2]);
      _dummyObj.rotation.set(
        simTime * 22 + i * 1.7,
        simTime * 16 + i * 0.9,
        simTime * 28 + i * 2.1
      );
      const sScale = shellHeavy[i] ? 1.55 : 1.0;
      _dummyObj.scale.set(sScale, sScale, sScale);
      _dummyObj.updateMatrix();
      shellInst.setMatrixAt(i, _dummyObj.matrix);
    }
    shellInst.instanceMatrix.needsUpdate = true;

    // 9. Update Wingman Electromagnetic Bite Slash Arcs
    if (params.wingmanSlash && params.wingmanSlash.flashTimer > 0) {
      wingmanSlashGroup.visible = true;
      wingmanSlashGroup.position.set(
        params.wingmanSlash.x,
        params.wingmanSlash.y + 0.65,
        params.wingmanSlash.z
      );
      wingmanSlashGroup.rotation.y = -params.wingmanSlash.yaw + simTime * 12;
      wingmanSlashGroup.rotation.z = Math.sin(simTime * 38) * 0.65;
      const sc = 0.9 + (params.wingmanSlash.flashTimer / 0.14) * 0.65;
      wingmanSlashGroup.scale.setScalar(sc);
    } else {
      wingmanSlashGroup.visible = false;
    }
  };

  // Setup Pooled Shell Casings InstancedMesh (initialized at y=-999!)
  const SHELL_MAX = 28;
  const shellPos = new Float32Array(SHELL_MAX * 3);
  const shellVel = new Float32Array(SHELL_MAX * 3);
  const shellLife = new Float32Array(SHELL_MAX);
  const shellHeavy = new Uint8Array(SHELL_MAX);
  let shellCursor = 0;

  const shellGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.13, 6);
  shellGeo.rotateZ(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.75,
    roughness: 0.22,
    metalness: 0.92
  });
  const shellInst = new THREE.InstancedMesh(shellGeo, shellMat, SHELL_MAX);
  shellInst.frustumCulled = false;
  _dummyObj.position.set(0, -999, 0);
  _dummyObj.scale.setScalar(0.0001);
  _dummyObj.updateMatrix();
  for (let i = 0; i < SHELL_MAX; i++) {
    shellInst.setMatrixAt(i, _dummyObj.matrix);
    shellInst.setColorAt(i, _col.setHex(0xfbbf24));
  }
  shellInst.instanceMatrix.needsUpdate = true;
  if (shellInst.instanceColor) shellInst.instanceColor.needsUpdate = true;
  root.add(shellInst);

  // Setup Wingman Electromagnetic Cross-Slash Arc Mesh
  const wingmanSlashGroup = new THREE.Group();
  wingmanSlashGroup.visible = false;
  const slashGeo = new THREE.TorusGeometry(0.95, 0.055, 6, 20, Math.PI * 0.85);
  const slashMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const slashA = new THREE.Mesh(slashGeo, slashMat);
  slashA.rotation.x = Math.PI * 0.32;
  const slashB = new THREE.Mesh(slashGeo, slashMat);
  slashB.rotation.x = -Math.PI * 0.32;
  slashB.rotation.y = 0.6;
  wingmanSlashGroup.add(slashA, slashB);
  root.add(wingmanSlashGroup);

  const spawnEjectedShell = (ev: {
    x: number;
    y: number;
    z: number;
    rightX: number;
    rightZ: number;
    isHeavy: boolean;
  }) => {
    const idx = shellCursor % SHELL_MAX;
    shellCursor++;
    shellPos[idx * 3] = ev.x + ev.rightX * 0.14;
    shellPos[idx * 3 + 1] = ev.y + 0.04;
    shellPos[idx * 3 + 2] = ev.z + ev.rightZ * 0.14;
    const latSpd = 3.2 + Math.random() * 1.9;
    shellVel[idx * 3] = ev.rightX * latSpd + (Math.random() - 0.5) * 0.9;
    shellVel[idx * 3 + 1] = 3.6 + Math.random() * 1.6;
    shellVel[idx * 3 + 2] = ev.rightZ * latSpd + (Math.random() - 0.5) * 0.9;
    shellLife[idx] = 0.85;
    shellHeavy[idx] = ev.isHeavy ? 1 : 0;
    shellInst.setColorAt(idx, _col.setHex(ev.isHeavy ? 0x38bdf8 : 0xfbbf24));
    if (shellInst.instanceColor) shellInst.instanceColor.needsUpdate = true;
  };

  const spawnDirectionalHitSparks = (imp: {
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
    isShield: boolean;
    isCrit: boolean;
    isShatter: boolean;
  }) => {
    const count = imp.isShatter ? 34 : imp.isCrit ? 20 : 12;
    for (let i = 0; i < count; i++) {
      const idx = sparkCursor % SPARK_MAX;
      sparkCursor++;
      const spread = imp.isShatter ? 1.35 : 0.75;
      const dx = imp.nx + (Math.random() - 0.5) * spread;
      const dy = Math.max(0.15, imp.ny + (Math.random() - 0.35) * spread);
      const dz = imp.nz + (Math.random() - 0.5) * spread;
      const spd = (imp.isShatter ? 7.5 : 5.2) + Math.random() * 8.5;
      sPos[idx * 3] = imp.x;
      sPos[idx * 3 + 1] = imp.y;
      sPos[idx * 3 + 2] = imp.z;
      sVel[idx * 3] = dx * spd;
      sVel[idx * 3 + 1] = dy * spd + 1.8;
      sVel[idx * 3 + 2] = dz * spd;

      if (imp.isShatter || imp.isShield) {
        // Electric cyan-blue plasma shield shards!
        _col.setHex(i % 3 === 0 ? 0xe0f2fe : 0x00e5ff);
      } else if (imp.isCrit) {
        _col.setHex(i % 2 === 0 ? 0xfef08a : 0xf97316);
      } else {
        // Hot metallic armor sparks + dark titanium flecks (zero full-body white washout!)
        _col.setHex(i % 3 === 0 ? 0xfdba74 : 0xfbbf24);
      }
      sCol[idx * 3] = _col.r;
      sCol[idx * 3 + 1] = _col.g;
      sCol[idx * 3 + 2] = _col.b;
      sLife[idx] = imp.isShatter ? 0.52 + Math.random() * 0.25 : 0.24 + Math.random() * 0.22;
    }
  };

  const dispose = () => {
    sparkGlowTex.dispose();
    pkShadowTex.dispose();
    projGeo.dispose();
    projMat.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
    ringGeo.dispose();
    discGeo.dispose();
    pillarGeo.dispose();
    coreBeamGeo.dispose();
    sheathBeamGeo.dispose();
    coreBeamMat.dispose();
    sheathBeamMat.dispose();
    streakGeo.dispose();
    pkCoreGeo.dispose();
    pkRingGeo.dispose();
    pkShadowGeo.dispose();
    pkShadowMat.dispose();
    shellGeo.dispose();
    shellMat.dispose();
    slashGeo.dispose();
    slashMat.dispose();
  };

  return {
    root,
    update: (
      params: Parameters<typeof update>[0] & {
        wingmanSlash?: { x: number; y: number; z: number; yaw: number; flashTimer: number };
      }
    ) => update(params),
    spawnExplosionBurst,
    spawnEjectedShell,
    spawnDirectionalHitSparks,
    dispose
  };
}

/**
 * Creates a Multi-Part Procedural Sci-Fi Pulse Rifle / Electromagnetic Arm Cannon (`THREE.Group`)
 * mounted directly onto the player mech's right forearm/hand or weapon turret node.
 * Exposes `muzzleSocket` at the exact barrel tip so 100% of projectiles spawn from True Muzzle World Pos,
 * plus a 3-plane Cruciform Muzzle Flash!
 */
export function createMountedSciFiPulseRifle(
  mechId: PlayerMechId,
  isUrdfZUpLink: boolean = false,
  parentScaleCompensation: number = 1.0
) {
  const group = new THREE.Group();
  group.name = 'mounted_scifi_pulse_rifle';
  group.scale.setScalar(parentScaleCompensation);
  if (isUrdfZUpLink) {
    // URDF link local space has +X forward, +Z up -> rotate +90° around X so rifle +Y (optic sight) points +Z up!
    group.rotation.x = Math.PI / 2;
  }

  // Calibrate local weapon scale & grip offset per mech chassis
  const weaponScale =
    mechId === 'unitree_g1'
      ? 1.12
      : mechId === 'unitree_go2'
        ? 0.96
        : mechId === 'unitree_z1'
          ? 0.92
          : 1.28;
  const barrelCluster = new THREE.Group();
  barrelCluster.scale.setScalar(weaponScale);
  group.add(barrelCluster);

  const receiverMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.84
  });
  const alloyBarrelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.22,
    metalness: 0.94
  });
  const plasmaRailMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 2.2,
    roughness: 0.15
  });

  // 1. Main Receiver Housing (+X is forward along barrel)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.095), receiverMat);
  receiver.position.set(0.16, 0.02, 0);

  // 2. Twin Magnetic Accelerator Barrel Rails (Upper & Lower)
  const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.036, 0.056), alloyBarrelMat);
  upperRail.position.set(0.36, 0.062, 0);
  const lowerRail = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.032, 0.052), alloyBarrelMat);
  lowerRail.position.set(0.34, -0.018, 0);

  // 3. Glowing Plasma Accelerator Core Strip between rails
  const plasmaCore = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.026, 0.036), plasmaRailMat);
  plasmaCore.position.set(0.35, 0.022, 0);

  // 4. Holographic Reflex Sight + Angled Magazine + Foregrip
  const opticHousing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.064), receiverMat);
  opticHousing.position.set(0.14, 0.11, 0);
  const opticLens = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.038, 0.048), plasmaRailMat);
  opticLens.position.set(0.19, 0.112, 0);

  const magCell = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.058), receiverMat);
  magCell.position.set(0.18, -0.09, 0);
  magCell.rotation.z = -0.24;

  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.044, 0.09, 8),
    alloyBarrelMat
  );
  muzzleBrake.rotation.z = Math.PI / 2;
  muzzleBrake.position.set(0.65, 0.022, 0);

  barrelCluster.add(
    receiver,
    upperRail,
    lowerRail,
    plasmaCore,
    opticHousing,
    opticLens,
    magCell,
    muzzleBrake
  );

  // 5. Exact True Muzzle Socket (`+0.71m` forward at barrel tip)
  const muzzleSocket = new THREE.Object3D();
  muzzleSocket.name = 'true_muzzle_socket';
  muzzleSocket.position.set(0.71, 0.022, 0);
  barrelCluster.add(muzzleSocket);

  // 6. 3-Plane Additive Cruciform Muzzle Flash right at `muzzleSocket`!
  const flashGroup = new THREE.Group();
  flashGroup.visible = false;
  muzzleSocket.add(flashGroup);

  const flashTex = createSoftGlowSpriteTexture();
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex,
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const spikeGeo = new THREE.PlaneGeometry(0.62, 0.24);
  spikeGeo.translate(0.24, 0, 0);
  const spikeH = new THREE.Mesh(spikeGeo, flashMat);
  const spikeV = new THREE.Mesh(spikeGeo, flashMat);
  spikeV.rotation.x = Math.PI / 2;
  const haloGeo = new THREE.PlaneGeometry(0.38, 0.38);
  haloGeo.rotateY(Math.PI / 2);
  const haloDisc = new THREE.Mesh(haloGeo, flashMat);
  flashGroup.add(spikeH, spikeV, haloDisc);

  const updateWeaponVisuals = (
    activeWeapon: CombatWeaponId,
    muzzleFlashTimer: number,
    recoilPos: number
  ) => {
    // Physical bolt/barrel recoil slide kickback along -X!
    barrelCluster.position.x = -recoilPos * 0.065;

    const hex =
      activeWeapon === 'railgun'
        ? 0xfbbf24
        : activeWeapon === 'missile_pod'
          ? 0xfb7185
          : 0x00e5ff;
    plasmaRailMat.color.setHex(hex);
    plasmaRailMat.emissive.setHex(hex);

    if (muzzleFlashTimer > 0) {
      flashGroup.visible = true;
      flashMat.color.setHex(activeWeapon === 'railgun' ? 0xfef08a : hex);
      const t = Math.min(1, muzzleFlashTimer / 0.055);
      const weaponScaleMult = activeWeapon === 'railgun' ? 1.85 : 1.15;
      flashGroup.scale.set(
        weaponScaleMult * (0.7 + t * 0.65),
        weaponScaleMult * (0.65 + t * 0.55),
        weaponScaleMult * (0.65 + t * 0.55)
      );
      flashGroup.rotation.x += 1.35;
      flashMat.opacity = 0.95 * t;
    } else {
      flashGroup.visible = false;
    }
  };

  const dispose = () => {
    receiverMat.dispose();
    alloyBarrelMat.dispose();
    plasmaRailMat.dispose();
    flashTex.dispose();
    flashMat.dispose();
    spikeGeo.dispose();
    haloGeo.dispose();
  };

  return { group, muzzleSocket, updateWeaponVisuals, dispose };
}

/**
 * Creates Dorsal Tactical Jet-Dodge Thruster Plumes for Player Mech (`Shift` Quick-Boost & Jump Jets).
 */
export function createPlayerDodgeThrusterRig() {
  const group = new THREE.Group();
  group.visible = false;

  const coneGeo = new THREE.ConeGeometry(0.14, 0.95, 10, 1, true);
  coneGeo.rotateX(-Math.PI / 2);
  coneGeo.translate(0, 0, -0.48);

  const outerMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const makePlume = (offsetZ: number) => {
    const p = new THREE.Group();
    p.position.set(-0.22, 1.05, offsetZ);
    p.rotation.y = Math.PI / 2; // Point backward along -X in player local frame
    const outer = new THREE.Mesh(coneGeo, outerMat);
    const core = new THREE.Mesh(coneGeo, coreMat);
    core.scale.set(0.52, 0.52, 0.65);
    p.add(outer, core);
    return p;
  };

  const leftPlume = makePlume(-0.18);
  const rightPlume = makePlume(0.18);
  group.add(leftPlume, rightPlume);

  const update = (dashTimer: number, isAirborneJet: boolean, simTime: number) => {
    if (dashTimer > 0 || isAirborneJet) {
      group.visible = true;
      const flicker = 0.85 + Math.sin(simTime * 64) * 0.22;
      const boostScale = dashTimer > 0 ? 1.45 : 0.72;
      leftPlume.scale.set(1, 1, boostScale * flicker);
      rightPlume.scale.set(1, 1, boostScale * (1.7 - flicker * 0.7));
      outerMat.opacity = dashTimer > 0 ? 0.85 : 0.48;
    } else {
      group.visible = false;
    }
  };

  const dispose = () => {
    coneGeo.dispose();
    outerMat.dispose();
    coreMat.dispose();
  };

  return { group, update, dispose };
}

/**
 * Creates a Translucent Fresnel + Localized Hexagonal Honeycomb Water-Ripple Energy Shield Material!
 * - Zero ugly wireframe lines!
 * - Idle state: ultra-clean grazing-angle Fresnel rim glow (`0.14` alpha) so the real `.glb` robot stays 100% crisp.
 * - On hit (`uRippleTimer > 0`): blooms a bright procedural hexagonal lattice & concentric shockwave ripple ONLY around `uHitLocalDir`!
 * - On shield break (`uShatterTimer > 0`): fractures into electric cyan hexagonal flash shards before vanishing!
 */
export function createLocalizedHexShieldMaterial(
  accentHex: string = '#00e5ff',
  isBoss: boolean = false
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(accentHex) },
      uTime: { value: 0 },
      uHitLocalDir: { value: new THREE.Vector3(1, 0, 0) },
      uRippleTimer: { value: 0 },
      uShatterTimer: { value: 0 },
      uShieldRatio: { value: 1.0 },
      uHexScale: { value: isBoss ? 14.0 : 10.5 }
    },
    vertexShader: `
      varying vec3 vLocalDir;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;
      void main() {
        vLocalDir = normalize(position);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform vec3 uHitLocalDir;
      uniform float uRippleTimer;
      uniform float uShatterTimer;
      uniform float uShieldRatio;
      uniform float uHexScale;

      varying vec3 vLocalDir;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      // Procedural 2D hexagonal grid distance (0 at cell edge, 0.5 at cell center)
      float hexEdgeDist(vec2 p) {
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
        vec2 nearest = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
        nearest = abs(nearest);
        return 0.5 - max(dot(nearest, s * 0.5), nearest.x);
      }

      void main() {
        if (uShieldRatio <= 0.001 && uShatterTimer <= 0.001) {
          discard;
        }

        vec3 nLocal = normalize(vLocalDir);
        vec3 hitDir = normalize(uHitLocalDir);

        // Subtle Fresnel grazing rim glow when shield is intact
        float ndotv = clamp(abs(dot(normalize(vViewDir), normalize(vViewNormal))), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 3.6);
        float baseRim = fresnel * 0.16 * step(0.001, uShieldRatio);

        // Triplanar hexagonal lattice coordinates on unit sphere
        vec3 blendW = abs(nLocal);
        blendW = pow(blendW, vec3(4.0));
        blendW /= max(0.0001, blendW.x + blendW.y + blendW.z);
        float hexX = hexEdgeDist(nLocal.yz * uHexScale);
        float hexY = hexEdgeDist(nLocal.xz * uHexScale);
        float hexZ = hexEdgeDist(nLocal.xy * uHexScale);
        float hexDist = hexX * blendW.x + hexY * blendW.y + hexZ * blendW.z;
        float hexLine = 1.0 - smoothstep(0.02, 0.085, hexDist);

        // Localized Impact Water-Ripple around uHitLocalDir!
        float rippleAlpha = 0.0;
        vec3 col = uColor;
        if (uRippleTimer > 0.001) {
          float prog = 1.0 - clamp(uRippleTimer / 0.48, 0.0, 1.0);
          float angDist = acos(clamp(dot(nLocal, hitDir), -1.0, 1.0));
          float waveFront = prog * 1.25;
          float primaryRing = exp(-pow((angDist - waveFront) * 9.5, 2.0)) * (1.0 - prog);
          float secondaryRing = exp(-pow((angDist - waveFront * 0.62) * 12.0, 2.0)) * (1.0 - prog) * 0.65;
          float impactCore = exp(-angDist * 6.2) * pow(1.0 - prog, 1.7);

          float localMask = clamp(primaryRing * 1.45 + secondaryRing + impactCore * 1.35, 0.0, 1.6);
          rippleAlpha = localMask * (0.35 + hexLine * 0.85);
          col = mix(uColor, vec3(0.92, 0.99, 1.0), clamp(impactCore + primaryRing * 0.65, 0.0, 1.0));
        }

        // Shield Shatter Overload Burst when broken!
        float shatterAlpha = 0.0;
        if (uShatterTimer > 0.001) {
          float sProg = 1.0 - clamp(uShatterTimer / 0.58, 0.0, 1.0);
          float cellHash = fract(sin(dot(floor(nLocal * uHexScale), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float alive = step(sProg * 1.15, cellHash);
          shatterAlpha = alive * (hexLine * 0.95 + 0.25) * (1.0 - sProg);
          col = mix(vec3(0.0, 0.92, 1.0), vec3(1.0), 0.55 * (1.0 - sProg));
        }

        float finalAlpha = clamp(baseRim + rippleAlpha + shatterAlpha, 0.0, 0.96);
        if (finalAlpha < 0.008) discard;
        gl_FragColor = vec4(col * (1.0 + rippleAlpha * 0.6), finalAlpha);
      }
    `
  });
}

/**
 * Helper to keep _up referenced cleanly when needed for future orientation helpers.
 */
export const UP_AXIS = _up;

