import { createMarsPolarScene } from './marsPolarScene';
import type { PolarMissionState } from './marsPolarMission';
import * as THREE from 'three';
import {
  CombatProjectile,
  GroundTelegraphHazard,
  CombatPickup,
  CombatEnemyEntity,
  PlayerMechId,
  CombatWeaponId,
  BattlefieldMapId,
  getMarsBattlefieldObstacles,
  sampleMarsArenaSurfaceHeight
} from './marsCombatEngine';

const _dummyObj = new THREE.Object3D();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();

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

function hashPeriodicGrid(ix: number, iy: number, mask: number, seed: number): number {
  const x = ix & mask;
  const y = iy & mask;
  let h = Math.imul((x * 374761393 + y * 668265263 + seed) | 0, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h & 0xffff) / 65535;
}

function periodicValueNoise(u: number, v: number, freqPow2: number, seed: number): number {
  const mask = freqPow2 - 1;
  const gx = u * freqPow2;
  const gy = v * freqPow2;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hashPeriodicGrid(ix, iy, mask, seed);
  const n10 = hashPeriodicGrid(ix + 1, iy, mask, seed);
  const n01 = hashPeriodicGrid(ix, iy + 1, mask, seed);
  const n11 = hashPeriodicGrid(ix + 1, iy + 1, mask, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function periodicWorleyBasalt(
  u: number,
  v: number,
  cellsPow2: number,
  seed: number
): { f1: number; edge: number } {
  const mask = cellsPow2 - 1;
  const gx = u * cellsPow2;
  const gy = v * cellsPow2;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let d1 = 99;
  let d2 = 99;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + 0.15 + hashPeriodicGrid(cx, cy, mask, seed) * 0.7;
      const py = cy + 0.15 + hashPeriodicGrid(cx, cy, mask, seed + 911) * 0.7;
      const distSq = (gx - px) * (gx - px) + (gy - py) * (gy - py);
      if (distSq < d1) {
        d2 = d1;
        d1 = distSq;
      } else if (distSq < d2) {
        d2 = distSq;
      }
    }
  }
  const s1 = Math.sqrt(d1);
  const s2 = Math.sqrt(d2);
  return { f1: s1, edge: Math.min(1, Math.max(0, s2 - s1)) };
}

/**
 * Generates seamless 1024x1024 Martian Jezero Iron-Oxide Regolith Albedo + Micro-Relief Bump CanvasTextures
 * using strictly 1.0-periodic multi-scale Value-Noise + Worley basalt fracture + aeolian ripples (zero modulo polka-dots).
 */
export function createMartianBattlefieldTextures(
  maxAnisotropy: number,
  isSoftwareGl: boolean = false
): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = isSoftwareGl ? 512 : 1024;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = size;
  cBump.height = size;
  const bCtx = cBump.getContext('2d')!;

  const colorImg = ctx.createImageData(size, size);
  const bumpImg = bCtx.createImageData(size, size);
  const cData = colorImg.data;
  const bData = bumpImg.data;
  const invSize = 1 / size;

  for (let py = 0; py < size; py++) {
    const v = py * invSize;
    for (let px = 0; px < size; px++) {
      const u = px * invSize;
      const idx = (py * size + px) * 4;

      const nMacro = periodicValueNoise(u, v, 8, 101);
      const nMid = periodicValueNoise(u, v, 16, 233);
      const nFine = periodicValueNoise(u, v, 64, 577);
      const nMicro = periodicValueNoise(u, v, 128, 941);
      const fbm = nMacro * 0.45 + nMid * 0.30 + nFine * 0.17 + nMicro * 0.08;

      const basaltMacro = periodicWorleyBasalt(u, v, 16, 1301);
      const gravel = periodicWorleyBasalt(u, v, 64, 2707);

      const ripplePhase =
        v * 14.0 + (nMacro - 0.5) * 1.65 + (nMid - 0.5) * 0.55 + Math.sin(u * Math.PI * 4.0) * 0.28;
      const ripple = 0.5 + 0.5 * Math.sin(ripplePhase * Math.PI * 2.0);
      const sandMask = Math.min(1, Math.max(0, (fbm - 0.34) * 2.2));
      const rockExpose = (1 - sandMask) * Math.min(1, basaltMacro.edge * 2.4);
      const pebbleBump = Math.max(0, 1 - gravel.f1 * 2.6) * (0.35 + nFine * 0.65);

      const baseR = 96 + fbm * 66 + ripple * sandMask * 28 - rockExpose * 38 + pebbleBump * 18;
      const baseG = 42 + fbm * 31 + ripple * sandMask * 14 - rockExpose * 19 + pebbleBump * 8;
      const baseB = 26 + fbm * 18 + ripple * sandMask * 7 - rockExpose * 9 + pebbleBump * 6;

      cData[idx] = Math.max(18, Math.min(242, baseR | 0));
      cData[idx + 1] = Math.max(10, Math.min(185, baseG | 0));
      cData[idx + 2] = Math.max(8, Math.min(145, baseB | 0));
      cData[idx + 3] = 255;

      const hVal =
        0.46 +
        (fbm - 0.5) * 0.28 +
        (ripple - 0.5) * sandMask * 0.22 +
        rockExpose * 0.24 +
        pebbleBump * 0.22 -
        (1 - Math.min(1, basaltMacro.edge * 5.0)) * (1 - sandMask) * 0.18;
      const lum = Math.max(0, Math.min(255, Math.round(hVal * 255)));
      bData[idx] = lum;
      bData[idx + 1] = lum;
      bData[idx + 2] = lum;
      bData[idx + 3] = 255;
    }
  }

  ctx.putImageData(colorImg, 0, 0);
  bCtx.putImageData(bumpImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(cColor);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.repeat.set(18, 18);
  albedoMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(18, 18);
  bumpMap.anisotropy = maxAnisotropy;

  return { albedoMap, bumpMap };
}

/**
 * Generates seamless 1024x1024 Martian Polar Ice Canyon Albedo + Micro-Relief Bump CanvasTextures
 * combining glacial sapphire-cyan ice fractures, wind-packed polar snowdrifts, and dark basalt crevasses.
 */
export function createPolarIceCanyonTextures(
  maxAnisotropy: number,
  isSoftwareGl: boolean = false
): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = isSoftwareGl ? 512 : 1024;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = size;
  cBump.height = size;
  const bCtx = cBump.getContext('2d')!;

  const colorImg = ctx.createImageData(size, size);
  const bumpImg = bCtx.createImageData(size, size);
  const cData = colorImg.data;
  const bData = bumpImg.data;
  const invSize = 1 / size;

  for (let py = 0; py < size; py++) {
    const v = py * invSize;
    for (let px = 0; px < size; px++) {
      const u = px * invSize;
      const idx = (py * size + px) * 4;

      const nMacro = periodicValueNoise(u, v, 8, 311);
      const nMid = periodicValueNoise(u, v, 16, 619);
      const nFine = periodicValueNoise(u, v, 64, 887);
      const nMicro = periodicValueNoise(u, v, 128, 1213);
      const fbm = nMacro * 0.46 + nMid * 0.29 + nFine * 0.17 + nMicro * 0.08;

      const icePlates = periodicWorleyBasalt(u, v, 16, 1907);
      const frostCrystals = periodicWorleyBasalt(u, v, 64, 3301);

      const driftPhase =
        v * 11.0 + (nMacro - 0.5) * 1.9 + (nMid - 0.5) * 0.65 + Math.cos(u * Math.PI * 4.0) * 0.32;
      const sastrugi = 0.5 + 0.5 * Math.sin(driftPhase * Math.PI * 2.0);
      const snowBlanket = Math.min(1, Math.max(0, (fbm - 0.36) * 2.35));
      const crevasseLine = Math.max(0, 1 - icePlates.edge * 5.8) * (1 - snowBlanket * 0.75);
      const crystalSpark = Math.max(0, 1 - frostCrystals.f1 * 2.5) * (0.4 + nFine * 0.6);

      // Blend deep glacial cyan-blue ice + bright polar snow + dark frozen basalt crevasse seams
      const iceR = 112 + fbm * 58 + snowBlanket * 66 + sastrugi * snowBlanket * 18 - crevasseLine * 68 + crystalSpark * 16;
      const iceG = 152 + fbm * 54 + snowBlanket * 52 + sastrugi * snowBlanket * 16 - crevasseLine * 74 + crystalSpark * 18;
      const iceB = 186 + fbm * 46 + snowBlanket * 38 + sastrugi * snowBlanket * 12 - crevasseLine * 64 + crystalSpark * 20;

      cData[idx] = Math.max(22, Math.min(248, iceR | 0));
      cData[idx + 1] = Math.max(34, Math.min(252, iceG | 0));
      cData[idx + 2] = Math.max(48, Math.min(255, iceB | 0));
      cData[idx + 3] = 255;

      const hVal =
        0.5 +
        (fbm - 0.5) * 0.26 +
        (sastrugi - 0.5) * snowBlanket * 0.2 +
        crystalSpark * 0.18 -
        crevasseLine * 0.34;
      const lum = Math.max(0, Math.min(255, Math.round(hVal * 255)));
      bData[idx] = lum;
      bData[idx + 1] = lum;
      bData[idx + 2] = lum;
      bData[idx + 3] = 255;
    }
  }

  ctx.putImageData(colorImg, 0, 0);
  bCtx.putImageData(bumpImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(cColor);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.repeat.set(16, 16);
  albedoMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(16, 16);
  bumpMap.anisotropy = maxAnisotropy;

  return { albedoMap, bumpMap };
}

/**
 * Builds the Martian Battlefield Environment (`'jezero_crater'` OR `'polar_ice_canyon'`):
 * - 210m x 210m continuous analytical terrain mesh extending well beyond the 68m combat perimeter
 * - Natural basalt cliffs OR Infinigen glacial ice spires, 10 physical midfield cover outcrops, & 6 relay pylons
 * - Overhead Futuristic Orbital Carrier Silhouette Landmark visible in initial spawn vista!
 */
export function createMarsBattlefieldEnvironment(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  mapId: BattlefieldMapId = 'jezero_crater'
) {
  const isPolar = mapId === 'polar_ice_canyon';
  const root = new THREE.Group();
  const obstacles = getMarsBattlefieldObstacles(mapId, true);
  const groundAt = (x:number,z:number) => sampleMarsArenaSurfaceHeight(x,z,mapId);
  const polar = isPolar ? createMarsPolarScene(groundAt) : null;
  if (polar) root.add(polar.root);
  const { albedoMap, bumpMap } = isPolar
    ? createPolarIceCanyonTextures(maxAnisotropy, isSoftwareGl)
    : createMartianBattlefieldTextures(maxAnisotropy, isSoftwareGl);
  const dustGlowTex = createSoftGlowSpriteTexture();

  // 0. Atmospheric Sky Dome (Warm Martian Dusk vs Sub-Zero Polar Borealis Twilight)
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
    fragmentShader: isPolar
      ? `
      varying vec3 vSkyDir;
      void main() {
        vec3 d = normalize(vSkyDir);
        float h = clamp(d.y, -0.15, 1.0);
        vec3 horizon = vec3(0.32, 0.56, 0.72);
        vec3 midSky = vec3(0.09, 0.21, 0.36);
        vec3 zenith = vec3(0.02, 0.05, 0.12);
        vec3 sunDir = normalize(vec3(0.72, 0.28, -0.22));
        float sunHalo = pow(max(0.0, dot(d, sunDir)), 12.0);
        vec3 col = h < 0.32
          ? mix(horizon, midSky, smoothstep(-0.08, 0.32, h))
          : mix(midSky, zenith, smoothstep(0.32, 0.92, h));
        float auroraRibbon = sin(d.x * 7.5 + d.z * 4.2) * 0.5 + 0.5;
        float auroraBand = exp(-pow((h - 0.44 - auroraRibbon * 0.12) * 6.5, 2.0));
        col += mix(vec3(0.06, 0.85, 0.62), vec3(0.22, 0.72, 0.98), auroraRibbon) * auroraBand * 0.28;
        col += vec3(0.78, 0.94, 1.0) * sunHalo * 0.52;
        gl_FragColor = vec4(col, 1.0);
      }
    `
      : `
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

  // 1. Continuous Martian Terrain with Macro Dune / Glacial Crevasse Vertex Color Stratification
  const segs = isSoftwareGl ? 96 : 144;
  const terrainGeo = new THREE.PlaneGeometry(210, 210, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const vColors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const r = Math.hypot(vx, vz);
    const h = groundAt(vx, vz);
    pos.setY(i, h);

    const macroWave =
      0.5 +
      0.5 * Math.sin(vx * 0.055 + Math.cos(vz * 0.048) * 1.7) * Math.cos(vz * 0.041 - vx * 0.022);
    const rimShade = r > 66 ? Math.max(0.72, 1 - (r - 66) * 0.008) : 1.0;
    if (isPolar) {
      const snowCrest = Math.min(1.12, Math.max(0.68, 0.84 + h * 0.065 + macroWave * 0.16)) * rimShade;
      vColors[i * 3] = snowCrest * (0.84 + macroWave * 0.14);
      vColors[i * 3 + 1] = snowCrest * (0.94 + macroWave * 0.06);
      vColors[i * 3 + 2] = Math.min(1.15, snowCrest * 1.06);
    } else {
      const crestWarm =
        Math.min(1.14, Math.max(0.78, 0.88 + h * 0.055 + macroWave * 0.14)) * rimShade;
      vColors[i * 3] = crestWarm;
      vColors[i * 3 + 1] = crestWarm * (0.94 + macroWave * 0.08);
      vColors[i * 3 + 2] = crestWarm * (0.90 + (1 - macroWave) * 0.10);
    }
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: albedoMap,
    bumpMap,
    bumpScale: isPolar ? 0.095 : 0.085,
    roughness: isPolar ? 0.56 : 0.89,
    metalness: isPolar ? 0.14 : 0.05
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  root.add(terrainMesh);

  // 2A. Natural Perimeter Outcrops (Basalt Cliffs or Glacial Ice Spires)
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
  const rPos = rockGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const rx = rPos.getX(i);
    const ry = rPos.getY(i);
    const rz = rPos.getZ(i);
    rPos.setXYZ(
      i,
      rx * (1 + 0.16 * Math.sin(ry * 3.1)) * (isPolar ? 0.78 : 1.0),
      ry < 0 ? ry * 0.45 : ry * (isPolar ? 1.85 : 1.25),
      rz * (1 + 0.16 * Math.cos(rx * 2.7)) * (isPolar ? 0.78 : 1.0)
    );
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({
    color: isPolar ? 0x7dd3fc : 0x6b3222,
    bumpMap,
    bumpScale: 0.05,
    roughness: isPolar ? 0.36 : 0.88,
    metalness: isPolar ? 0.24 : 0.12
  });
  const rockCount = 44;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInst.castShadow = !isSoftwareGl;
  rockInst.receiveShadow = !isSoftwareGl;
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2 + (i % 3) * 0.06;
    const rad = 72 + (i % 4) * 5.5;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const y = groundAt(x, z) - 0.3;
    _dummyObj.position.set(x, y, z);
    _dummyObj.rotation.set((i % 5) * 0.08, ang + i * 0.7, 0);
    const sx = 3.2 + (i % 4) * 1.3;
    const sy = (isPolar ? 3.8 : 2.4) + (i % 5) * (isPolar ? 2.2 : 1.6);
    const sz = 2.8 + (i % 3) * 1.2;
    _dummyObj.scale.set(sx, sy, sz);
    _dummyObj.updateMatrix();
    rockInst.setMatrixAt(i, _dummyObj.matrix);
    if (isPolar) {
      _col.setHSL(0.55 + (i % 4) * 0.015, 0.52, 0.58 + (i % 3) * 0.09);
    } else {
      _col.setHSL(0.035 + (i % 4) * 0.006, 0.48, 0.22 + (i % 3) * 0.05);
    }
    rockInst.setColorAt(i, _col);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  root.add(rockInst);

  // 2B. Tactical Midfield Cover Outcrops (1:1 synced with MARS_BATTLEFIELD_OBSTACLES!)
  const midfieldBoulders = obstacles.filter((o) => o.kind === 'boulder');
  const coverBoulderInst = new THREE.InstancedMesh(rockGeo, rockMat, midfieldBoulders.length);
  coverBoulderInst.castShadow = !isSoftwareGl;
  coverBoulderInst.receiveShadow = !isSoftwareGl;
  for (let i = 0; i < midfieldBoulders.length; i++) {
    const obs = midfieldBoulders[i];
    const groundY = groundAt(obs.x, obs.z);
    _dummyObj.position.set(obs.x, groundY + 0.12, obs.z);
    _dummyObj.rotation.set((i % 3) * 0.06, i * 1.15 + 0.4, ((i + 1) % 3) * 0.05);
    const sy = obs.height / (isPolar ? 1.75 : 1.25);
    _dummyObj.scale.set(obs.radius * 1.02, sy, obs.radius * 0.96);
    _dummyObj.updateMatrix();
    coverBoulderInst.setMatrixAt(i, _dummyObj.matrix);
    if (isPolar) {
      _col.setHSL(0.54 + (i % 3) * 0.018, 0.56, 0.54 + (i % 4) * 0.08);
    } else {
      _col.setHSL(0.032 + (i % 3) * 0.007, 0.44, 0.20 + (i % 4) * 0.04);
    }
    coverBoulderInst.setColorAt(i, _col);
  }
  coverBoulderInst.instanceMatrix.needsUpdate = true;
  if (coverBoulderInst.instanceColor) coverBoulderInst.instanceColor.needsUpdate = true;
  coverBoulderInst.computeBoundingSphere();
  root.add(coverBoulderInst);

  // Optional Real Princeton Infinigen Glacial Spire Group (populated asynchronously on Polar Ice Canyon!)
  const infinigenSpireGroup = new THREE.Group();
  root.add(infinigenSpireGroup);
  const clonedSpireMaterials: THREE.Material[] = [];

  const applyLoadedGlacialSpires = (spireTemplate: THREE.Group) => {
    if (!isPolar || infinigenSpireGroup.children.length > 0) return;
    spireTemplate.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(spireTemplate);
    const sz = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);

    // Place 12 monumental Infinigen snow-canyon ridge formations ringing the polar canyon horizon!
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + 0.22;
      const rad = 76 + (i % 3) * 7.5;
      const gx = Math.cos(ang) * rad;
      const gz = Math.sin(ang) * rad;
      const gy = groundAt(gx, gz) - 0.8;

      const inst = spireTemplate.clone(true);
      const targetSpan = 22 + (i % 4) * 5.5;
      const sc = targetSpan / maxDim;
      inst.scale.set(sc, sc * (1.15 + (i % 3) * 0.22), sc);
      inst.position.set(gx - ctr.x * sc, gy - box.min.y * sc, gz - ctr.z * sc);
      inst.rotation.y = -ang + Math.PI * 0.5 + (i % 2) * 0.4;
      inst.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.castShadow = false;
          m.receiveShadow = !isSoftwareGl;
          const iceChunkMat = new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? 0xcffafe : 0xbae6fd,
            map: albedoMap,
            bumpMap,
            bumpScale: 0.06,
            roughness: 0.42,
            metalness: 0.18
          });
          clonedSpireMaterials.push(iceChunkMat);
          m.material = iceChunkMat;
        }
      });
      infinigenSpireGroup.add(inst);
    }
  };

  // 3. Multi-Part Sci-Fi Colony Defense Beacons around Mid-Perimeter
  const pylonGroup = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: isPolar ? 0x162231 : 0x1e2530,
    roughness: 0.62,
    metalness: 0.62
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.28, metalness: 0.88 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: isPolar ? 0x34d399 : 0x00e5ff,
    emissive: isPolar ? 0x10b981 : 0x00b8d4,
    emissiveIntensity: 1.9,
    roughness: 0.2
  });
  const baseGeo = new THREE.CylinderGeometry(1.1, 1.55, 1.2, 6);
  const mastGeo = new THREE.BoxGeometry(0.62, 6.8, 0.62);
  const finGeo = new THREE.BoxGeometry(0.14, 3.8, 1.35);
  const emitterGeo = new THREE.OctahedronGeometry(0.52, 0);

  for (let i = 0; i < (isPolar ? 0 : 6); i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.38;
    const rad = 56;
    const px = Math.cos(ang) * rad;
    const pz = Math.sin(ang) * rad;
    const py = sampleMarsArenaSurfaceHeight(px, pz);

    const tower = new THREE.Group();
    tower.position.set(px, py, pz);
    tower.rotation.y = -ang;

    const base = new THREE.Mesh(baseGeo, hullMat);
    base.position.y = 0.55;
    base.castShadow = !isSoftwareGl;
    base.receiveShadow = !isSoftwareGl;
    const mast = new THREE.Mesh(mastGeo, hullMat);
    mast.position.y = 4.2;
    mast.castShadow = !isSoftwareGl;
    mast.receiveShadow = !isSoftwareGl;
    const finA = new THREE.Mesh(finGeo, trimMat);
    finA.position.set(0, 4.8, 0);
    finA.castShadow = !isSoftwareGl;
    const finB = new THREE.Mesh(finGeo, trimMat);
    finB.position.set(0, 4.8, 0);
    finB.rotation.y = Math.PI / 2;
    finB.castShadow = !isSoftwareGl;
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
  const cruiserSpineGeo = new THREE.BoxGeometry(28, 3.4, 5.8);
  const cruiserProwGeo = new THREE.ConeGeometry(3.6, 11.5, 4);
  const cruiserBridgeGeo = new THREE.BoxGeometry(6.8, 3.0, 3.4);
  const cruiserWingGeo = new THREE.BoxGeometry(12, 0.75, 14);
  const cruiserThrusterGeo = new THREE.CylinderGeometry(1.15, 1.35, 2.4, 12);

  const spine = new THREE.Mesh(cruiserSpineGeo, shipHullMat);
  const prow = new THREE.Mesh(cruiserProwGeo, shipHullMat);
  prow.rotation.z = Math.PI / 2;
  prow.position.x = -18.5;
  const bridge = new THREE.Mesh(cruiserBridgeGeo, shipHullMat);
  bridge.position.set(4, 3.0, 0);
  const wingL = new THREE.Mesh(cruiserWingGeo, shipHullMat);
  wingL.position.set(3, -0.4, 0);
  const thrusterA = new THREE.Mesh(cruiserThrusterGeo, shipEngineMat);
  thrusterA.rotation.z = Math.PI / 2;
  thrusterA.position.set(14.5, 0.2, -1.9);
  const thrusterB = thrusterA.clone();
  thrusterB.position.set(14.5, 0.2, 1.9);
  cruiser.add(spine, prow, bridge, wingL, thrusterA, thrusterB);
  root.add(cruiser);

  // 5. Drifting Atmospheric Motes (Martian Dust vs Polar Blizzard Snowflakes)
  const dustCount = isPolar ? 260 : 180;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 110;
    dustPos[i * 3 + 1] = 0.6 + Math.random() * 14;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 110;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: isPolar ? 0xe0f2fe : 0xfdba74,
    map: dustGlowTex,
    size: isPolar ? 0.34 : 0.28,
    transparent: true,
    opacity: isPolar ? 0.68 : 0.42,
    depthWrite: false
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  root.add(dustPoints);

  const updateAtmosphere = (dt: number, playerX: number, playerZ: number, simTime: number) => {
    cruiser.position.y = 22 + Math.sin(simTime * 0.45) * 0.75;
    const arr = dustGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < dustCount; i++) {
      let x = arr[i * 3] + dt * (isPolar ? 6.4 : 3.8);
      let y = arr[i * 3 + 1] - (isPolar ? dt * 2.3 : 0);
      let z = arr[i * 3 + 2] + dt * (isPolar ? 2.6 : 1.2);
      if (x - playerX > 55) x -= 110;
      if (x - playerX < -55) x += 110;
      if (z - playerZ > 55) z -= 110;
      if (z - playerZ < -55) z += 110;
      if (isPolar && y < 0.3) y += 14.0;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  const dispose = () => {
    polar?.dispose();
    for (const m of clonedSpireMaterials) m.dispose();
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
    cruiserSpineGeo.dispose();
    cruiserProwGeo.dispose();
    cruiserBridgeGeo.dispose();
    cruiserWingGeo.dispose();
    cruiserThrusterGeo.dispose();
    shipHullMat.dispose();
    shipEngineMat.dispose();
    dustGeo.dispose();
    dustMat.dispose();
  };

  return {
    root,
    terrainMesh,
    coverBoulderInst,
    pylonGroup,
    updatePolarEncounter: (mission: PolarMissionState | null, elapsed: number) => polar?.update(mission, elapsed),
    polarPickables: () => polar?.pickables() ?? [],
    applyLoadedGlacialSpires,
    updateAtmosphere,
    dispose
  };
}

/**
 * Zero-GC Pooled Combat VFX Controller:
 * - InstancedMesh Projectiles (Player Pulse / Railgun / Homing Missiles / Boss Salvo Missiles)
 * - Ground Holographic AoE Countdown Telegraph Rings (24 slots) + Orbital Lightning Pillars
 * - Enemy Windup Crimson Aiming Laser Sightlines (12 slots for Go2 Hound / G1 Vanguard / Aero Hunter)
 * - Boss Volumetric Coral Sweeping Laser Beam
 * - Player EMP Nova Sphere + Player Orbital Ion Cannon Sky-Beam
 * - Pooled Particle Burst Ring Buffer (320 sparks/embers)
 * - Composite Multi-Part Rotating 3D Pickups (Repair Cores & Overcharge Cells)
 */
export function createMarsCombatVFXController() {
  const root = new THREE.Group();
  const sparkGlowTex = createSoftGlowSpriteTexture();
  const pkShadowTex = createSoftShadowDiscTexture();

  // 1. Pooled Instanced Projectiles (max 96 — initialized off-screen at y=-999)
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

  // 2. Pooled Explosion Sparks & Exhaust Flares Ring Buffer (320 soft radial glow sprites)
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

  // 3A. Ground AoE Telegraph Pool (24 slots so overlapping Siege Mortars + Boss Orbital Pillars never clip!)
  const MAX_TELEGRAPHS = 24;
  const telegraphSlots: {
    group: THREE.Group;
    outerRing: THREE.Mesh;
    fillDisc: THREE.Mesh;
    pillar: THREE.Mesh;
    outerMat: THREE.MeshBasicMaterial;
    fillMat: THREE.MeshBasicMaterial;
    pillarMat: THREE.MeshBasicMaterial;
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
    telegraphSlots.push({ group: g, outerRing, fillDisc, pillar, outerMat, fillMat, pillarMat });
  }

  // 3B. Enemy Windup Crimson Laser Sightlines Pool (12 slots for Go2 Hound / G1 Vanguard / Aero Hunter)
  const MAX_WINDUP_SIGHTS = 12;
  const windupSightGeo = new THREE.CylinderGeometry(0.022, 0.032, 1.0, 6);
  windupSightGeo.rotateX(Math.PI / 2);
  windupSightGeo.translate(0, 0, 0.5);
  const windupSightSlots: {
    group: THREE.Group;
    beam: THREE.Mesh;
    targetRing: THREE.Mesh;
    beamMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
  }[] = [];
  for (let i = 0; i < MAX_WINDUP_SIGHTS; i++) {
    const g = new THREE.Group();
    g.visible = false;
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff2a55,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2a55,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const beam = new THREE.Mesh(windupSightGeo, beamMat);
    const targetRing = new THREE.Mesh(ringGeo, ringMat);
    targetRing.scale.setScalar(0.58);
    g.add(beam);
    root.add(g, targetRing);
    targetRing.visible = false;
    windupSightSlots.push({ group: g, beam, targetRing, beamMat, ringMat });
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
  const chargeSphereGeo = new THREE.SphereGeometry(0.75, 16, 16);
  const chargeSphereMat = new THREE.MeshBasicMaterial({
    color: 0xff3b6b,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const chargeSphere = new THREE.Mesh(chargeSphereGeo, chargeSphereMat);
  const coreBeamMesh = new THREE.Mesh(coreBeamGeo, coreBeamMat);
  const sheathBeamMesh = new THREE.Mesh(sheathBeamGeo, sheathBeamMat);
  bossLaserGroup.add(chargeSphere, coreBeamMesh, sheathBeamMesh);
  root.add(bossLaserGroup);

  // 5. Player EMP Nova Sphere & Player Orbital Ion Cannon Sky-Beam
  const empSphereGeo = new THREE.SphereGeometry(1, 24, 18);
  const empSphereMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const empSphere = new THREE.Mesh(empSphereGeo, empSphereMat);
  empSphere.visible = false;
  root.add(empSphere);

  const orbitalIonBeam = new THREE.Group();
  orbitalIonBeam.visible = false;
  const ionCoreMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ionOuterMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ionCore = new THREE.Mesh(pillarGeo, ionCoreMat);
  ionCore.scale.set(1.6, 2.2, 1.6);
  const ionOuter = new THREE.Mesh(pillarGeo, ionOuterMat);
  ionOuter.scale.set(4.2, 2.2, 4.2);
  orbitalIonBeam.add(ionCore, ionOuter);
  root.add(orbitalIonBeam);

  // 6. Orbital Drop-Pod Reentry Streaks Pool (6 slots for incoming enemies/Boss)
  const dropStreaks: THREE.Mesh[] = [];
  const streakGeo = new THREE.CylinderGeometry(0.08, 0.85, 24, 10, 1, true);
  streakGeo.translate(0, 12, 0);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xff4d4d,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(streakGeo, streakMat);
    m.visible = false;
    root.add(m);
    dropStreaks.push(m);
  }

  // 7. Composite 4-Part 3D Combat Pickups Pool (8 slots)
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

  // 8. Setup Pooled Shell Casings InstancedMesh (initialized at y=-999!)
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

  // 9. Setup Wingman Electromagnetic Cross-Slash Arc Mesh
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

  // 10. Setup Player High-Frequency Plasma War-Axe Cleave Crescent Arc [X]
  const playerMeleeSlashGroup = new THREE.Group();
  playerMeleeSlashGroup.visible = false;
  const meleeOuterArcGeo = new THREE.TorusGeometry(3.05, 0.14, 6, 28, Math.PI * 0.86);
  meleeOuterArcGeo.rotateX(Math.PI / 2);
  const meleeInnerArcGeo = new THREE.TorusGeometry(2.88, 0.06, 6, 28, Math.PI * 0.86);
  meleeInnerArcGeo.rotateX(Math.PI / 2);
  const meleeOuterMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const meleeInnerMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const meleeOuterMesh = new THREE.Mesh(meleeOuterArcGeo, meleeOuterMat);
  const meleeInnerMesh = new THREE.Mesh(meleeInnerArcGeo, meleeInnerMat);
  playerMeleeSlashGroup.add(meleeOuterMesh, meleeInnerMesh);
  root.add(playerMeleeSlashGroup);

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
    playerMeleeSlash?: { x: number; y: number; z: number; yaw: number; swingTimer: number };
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

    // Frame-rate independent missile exhaust spark emission probability (normalized to 0.65 at 60Hz)
    const missileSparkProb = 1 - Math.pow(1 - 0.65, Math.max(0.1, dt * 60));

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
      const lenScale =
        p.kind === 'rail'
          ? 3.2
          : p.kind === 'bow_arrow'
            ? 2.85
            : p.kind === 'pulse'
              ? 1.35
              : p.kind === 'xeno_acid'
                ? 1.05
                : 1.15;
      const radScale =
        p.kind === 'rail'
          ? 1.45
          : p.kind === 'bow_arrow'
            ? 0.85
            : p.kind === 'xeno_acid'
              ? 1.65
              : p.kind === 'boss_missile'
                ? 1.5
                : 1.0;
      _dummyObj.scale.set(radScale, radScale, lenScale);
      _dummyObj.updateMatrix();
      projInst.setMatrixAt(i, _dummyObj.matrix);

      if (p.kind === 'pulse') _col.setHex(0x00e5ff);
      else if (p.kind === 'rail') _col.setHex(0xfbbf24);
      else if (p.kind === 'bow_arrow') _col.setHex(0x10b981);
      else if (p.kind === 'missile') _col.setHex(0xfb7185);
      else if (p.kind === 'xeno_acid') _col.setHex(0x84cc16);
      else if (p.kind === 'boss_missile') _col.setHex(0xff5500);
      else _col.setHex(0xff2a55);
      projInst.setColorAt(i, _col);

      if (
        (p.kind === 'missile' || p.kind === 'boss_missile' || p.kind === 'xeno_acid' || p.kind === 'bow_arrow') &&
        Math.random() < missileSparkProb
      ) {
        const idx = sparkCursor % SPARK_MAX;
        sparkCursor++;
        sPos[idx * 3] = p.x;
        sPos[idx * 3 + 1] = p.y;
        sPos[idx * 3 + 2] = p.z;
        sVel[idx * 3] = (Math.random() - 0.5) * 1.6;
        sVel[idx * 3 + 1] = (Math.random() - 0.5) * 1.6;
        sVel[idx * 3 + 2] = (Math.random() - 0.5) * 1.6;
        if (p.kind === 'xeno_acid') {
          sCol[idx * 3] = 0.52;
          sCol[idx * 3 + 1] = 0.95;
          sCol[idx * 3 + 2] = 0.14;
        } else if (p.kind === 'bow_arrow') {
          sCol[idx * 3] = 0.08;
          sCol[idx * 3 + 1] = 0.92;
          sCol[idx * 3 + 2] = 0.62;
        } else {
          sCol[idx * 3] = 1.0;
          sCol[idx * 3 + 1] = p.fromPlayer ? 0.55 : 0.35;
          sCol[idx * 3 + 2] = p.fromPlayer ? 0.68 : 0.1;
        }
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

    // Update Ground AoE Telegraph Rings & Orbital Strike Pillars (24 slots)
    for (let i = 0; i < MAX_TELEGRAPHS; i++) {
      const slot = telegraphSlots[i];
      const h = hazards[i];
      if (!h) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      slot.group.position.set(h.x, h.y + 0.06, h.z);
      const isAcid = h.kind === 'acid_pool';
      const isCyan = h.kind === 'orbital_pillar';
      const hex = isAcid ? 0x84cc16 : isCyan ? 0x00e5ff : 0xff2a55;
      slot.outerMat.color.setHex(hex);
      slot.fillMat.color.setHex(isAcid ? 0x4ade80 : hex);
      slot.outerRing.scale.setScalar(h.radius);

      if (!h.detonated) {
        const prog = Math.min(1, h.elapsed / Math.max(0.05, h.windupDuration));
        slot.fillDisc.scale.setScalar(Math.max(0.05, h.radius * prog));
        slot.fillMat.opacity = 0.16 + prog * 0.34;
        slot.pillar.visible = false;
      } else if (isAcid) {
        const fade = Math.min(1, h.lingerTimer / 1.1);
        const bubble = 0.88 + Math.sin(simTime * 12 + h.id) * 0.12;
        slot.fillDisc.scale.setScalar(h.radius * bubble);
        slot.fillMat.opacity = 0.44 * fade;
        slot.outerMat.opacity = 0.78 * fade;
        slot.pillar.visible = false;
      } else {
        slot.fillDisc.scale.setScalar(h.radius);
        slot.fillMat.opacity = 0.5 * (h.lingerTimer / 0.4);
        slot.outerMat.opacity = 0.88;
        slot.pillar.visible = h.kind === 'orbital_pillar' || h.kind === 'boss_phase_nova';
        slot.pillarMat.color.setHex(hex);
        slot.pillar.scale.set(h.radius * 0.65, 1, h.radius * 0.65);
        slot.pillarMat.opacity = Math.min(0.9, h.lingerTimer * 2.2);
      }
    }

    // Update Enemy Windup Aiming Laser Sightlines (Robots + Xenomorph Lunges + Deathless Slam)
    let sightIdx = 0;
    for (const e of enemies) {
      if (sightIdx >= MAX_WINDUP_SIGHTS) break;
      if (
        !e.isBoss &&
        e.koTimer <= 0 &&
        e.dropPodProgress >= 0.95 &&
        e.attackPhase === 'windup' &&
        (e.archetype === 'go2_hound' ||
          e.archetype === 'g1_vanguard' ||
          e.archetype === 'aero_hunter' ||
          e.archetype === 'xeno_runner' ||
          e.archetype === 'xeno_spitter' ||
          e.archetype === 'deathless_vanguard')
      ) {
        const slot = windupSightSlots[sightIdx++];
        const originY =
          e.y +
          (e.archetype === 'aero_hunter'
            ? 0.55
            : e.archetype === 'g1_vanguard' || e.archetype === 'deathless_vanguard'
              ? 1.45
              : 0.95);
        const targetGroundY = sampleMarsArenaSurfaceHeight(e.telegraphTargetX, e.telegraphTargetZ);
        const targetY =
          targetGroundY +
          (e.archetype === 'go2_hound' || e.archetype === 'xeno_spitter' ? 0.12 : 0.95);

        _v1.set(e.x, originY, e.z);
        _v2.set(e.telegraphTargetX, targetY, e.telegraphTargetZ);
        _v3.subVectors(_v2, _v1);
        const len = _v3.length();
        if (len > 0.35) {
          slot.group.visible = true;
          slot.group.position.copy(_v1);
          slot.group.lookAt(_v2);
          const pulse = 0.75 + Math.sin(simTime * 34 + e.uid) * 0.25;
          slot.beam.scale.set(pulse * 1.15, pulse * 1.15, len);
          const sightHex =
            e.archetype === 'aero_hunter'
              ? 0x38bdf8
              : e.archetype === 'xeno_runner' || e.archetype === 'xeno_spitter'
                ? 0x84cc16
                : e.archetype === 'deathless_vanguard'
                  ? 0xf59e0b
                  : 0xff2a55;
          slot.beamMat.color.setHex(sightHex);
          slot.beamMat.opacity = 0.55 + pulse * 0.35;

          slot.targetRing.visible = true;
          slot.targetRing.position.set(e.telegraphTargetX, targetGroundY + 0.08, e.telegraphTargetZ);
          slot.targetRing.scale.setScalar(
            e.archetype === 'go2_hound' || e.archetype === 'xeno_spitter' ? 0.95 : 0.65
          );
          slot.ringMat.color.setHex(sightHex);
          slot.ringMat.opacity = 0.48 + pulse * 0.34;
        } else {
          slot.group.visible = false;
          slot.targetRing.visible = false;
        }
      }
    }
    for (let k = sightIdx; k < MAX_WINDUP_SIGHTS; k++) {
      windupSightSlots[k].group.visible = false;
      windupSightSlots[k].targetRing.visible = false;
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
        coreBeamMesh.scale.set(1, 0.14, 0.14);
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
      empSphereMat.opacity = (1 - t) * 0.78;
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

    // Update Pooled Ejected Brass/Energy Shell Casings
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
      const gFloor = sampleMarsArenaSurfaceHeight(shellPos[i * 3], shellPos[i * 3 + 2]) + 0.04;
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

    // Update Wingman Electromagnetic Bite Slash Arcs
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

    // Update Player High-Frequency Plasma War-Axe Cleave Crescent [X]
    if (params.playerMeleeSlash && params.playerMeleeSlash.swingTimer > 0) {
      playerMeleeSlashGroup.visible = true;
      const prog = 1 - Math.max(0, Math.min(1, params.playerMeleeSlash.swingTimer / 0.32));
      playerMeleeSlashGroup.position.set(
        params.playerMeleeSlash.x,
        params.playerMeleeSlash.y + 1.15,
        params.playerMeleeSlash.z
      );
      // Sweep crescent from right-front across to left-front around -yaw!
      playerMeleeSlashGroup.rotation.set(
        0.16,
        -params.playerMeleeSlash.yaw - Math.PI * 0.43 + (prog - 0.5) * 0.95,
        -0.18 + prog * 0.36
      );
      const fade = Math.sin(prog * Math.PI);
      meleeOuterMat.opacity = 0.35 + fade * 0.62;
      meleeInnerMat.opacity = 0.45 + fade * 0.55;
      playerMeleeSlashGroup.scale.setScalar(0.88 + prog * 0.34);
    } else {
      playerMeleeSlashGroup.visible = false;
    }
  };

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
    isAcidBlood?: boolean;
    isPhysicalBlock?: boolean;
  }) => {
    const count = imp.isShatter ? 34 : imp.isPhysicalBlock ? 22 : imp.isCrit ? 20 : 14;
    for (let i = 0; i < count; i++) {
      const idx = sparkCursor % SPARK_MAX;
      sparkCursor++;
      const spread = imp.isShatter ? 1.35 : imp.isPhysicalBlock ? 1.05 : 0.75;
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

      if (imp.isAcidBlood) {
        _col.setHex(i % 2 === 0 ? 0xa3e635 : 0x22c55e);
      } else if (imp.isPhysicalBlock) {
        _col.setHex(i % 2 === 0 ? 0xfef08a : 0x7dd3fc);
      } else if (imp.isShatter || imp.isShield) {
        _col.setHex(i % 3 === 0 ? 0xe0f2fe : 0x00e5ff);
      } else if (imp.isCrit) {
        _col.setHex(i % 2 === 0 ? 0xfef08a : 0xf97316);
      } else {
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
    for (const slot of telegraphSlots) {
      slot.outerMat.dispose();
      slot.fillMat.dispose();
      slot.pillarMat.dispose();
    }
    windupSightGeo.dispose();
    for (const slot of windupSightSlots) {
      slot.beamMat.dispose();
      slot.ringMat.dispose();
    }
    coreBeamGeo.dispose();
    sheathBeamGeo.dispose();
    coreBeamMat.dispose();
    sheathBeamMat.dispose();
    chargeSphereGeo.dispose();
    chargeSphereMat.dispose();
    empSphereGeo.dispose();
    empSphereMat.dispose();
    ionCoreMat.dispose();
    ionOuterMat.dispose();
    streakGeo.dispose();
    streakMat.dispose();
    pkCoreGeo.dispose();
    pkRingGeo.dispose();
    pkShadowGeo.dispose();
    pkShadowMat.dispose();
    for (const slot of pickupSlots) {
      slot.coreMat.dispose();
      slot.ringMat.dispose();
    }
    shellGeo.dispose();
    shellMat.dispose();
    slashGeo.dispose();
    slashMat.dispose();
    meleeOuterArcGeo.dispose();
    meleeInnerArcGeo.dispose();
    meleeOuterMat.dispose();
    meleeInnerMat.dispose();
  };

  return {
    root,
    update: (
      params: Parameters<typeof update>[0] & {
        wingmanSlash?: { x: number; y: number; z: number; yaw: number; flashTimer: number };
        playerMeleeSlash?: { x: number; y: number; z: number; yaw: number; swingTimer: number };
      }
    ) => update(params),
    spawnExplosionBurst,
    spawnEjectedShell,
    spawnDirectionalHitSparks,
    dispose
  };
}

/**
 * Wraps the `aero_hunter` turbofan nacelle core in a sleek swept-wing Martian VTOL Gunship airframe
 * so aerial hunter drones read as genuine combat aircraft rather than flying passenger-jet engine pods.
 */
export function createAeroHunterGunshipFrame(isSoftwareGl: boolean) {
  const group = new THREE.Group();
  group.name = 'aero_hunter_vtol_airframe';

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.44,
    metalness: 0.84
  });
  const wingTrimMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.30,
    metalness: 0.88
  });
  const sensorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 2.1,
    roughness: 0.18
  });

  const noseGeo = new THREE.ConeGeometry(0.32, 1.05, 6);
  noseGeo.rotateZ(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, hullMat);
  nose.position.set(1.12, 0.95, 0);
  nose.castShadow = !isSoftwareGl;

  const canopyGeo = new THREE.OctahedronGeometry(0.24, 1);
  canopyGeo.scale(1.8, 0.65, 0.85);
  const canopy = new THREE.Mesh(canopyGeo, sensorMat);
  canopy.position.set(0.76, 1.16, 0);

  const wingGeo = new THREE.BoxGeometry(0.78, 0.065, 2.85);
  const sweptWing = new THREE.Mesh(wingGeo, hullMat);
  sweptWing.position.set(-0.08, 1.02, 0);
  sweptWing.castShadow = !isSoftwareGl;

  const podGeo = new THREE.CylinderGeometry(0.085, 0.105, 0.86, 8);
  podGeo.rotateZ(Math.PI / 2);
  const podL = new THREE.Mesh(podGeo, wingTrimMat);
  podL.position.set(0.18, 0.90, -1.12);
  const podR = new THREE.Mesh(podGeo, wingTrimMat);
  podR.position.set(0.18, 0.90, 1.12);

  const tailFinGeo = new THREE.BoxGeometry(0.54, 0.56, 0.055);
  const finL = new THREE.Mesh(tailFinGeo, wingTrimMat);
  finL.position.set(-0.92, 1.32, -0.52);
  finL.rotation.x = -0.28;
  const finR = new THREE.Mesh(tailFinGeo, wingTrimMat);
  finR.position.set(-0.92, 1.32, 0.52);
  finR.rotation.x = 0.28;

  group.add(nose, canopy, sweptWing, podL, podR, finL, finR);

  const dispose = () => {
    noseGeo.dispose();
    canopyGeo.dispose();
    wingGeo.dispose();
    podGeo.dispose();
    tailFinGeo.dispose();
    hullMat.dispose();
    wingTrimMat.dispose();
    sensorMat.dispose();
  };

  return { group, dispose };
}

/**
 * Builds an Armored 4-Wheel Combat UGV Rover Carrier Base for stationary robotic arms
 * (`unitree_z1`, `baxter_dual_arm`) so manipulator loadouts roll across Martian regolith on real wheels.
 */
export function createArmoredManipulatorCarrierBase(
  mechId: 'unitree_z1' | 'baxter_dual_arm',
  isSoftwareGl: boolean
) {
  const group = new THREE.Group();
  group.name = 'armored_ugv_carrier_base';

  const isWide = mechId === 'baxter_dual_arm';
  const chassisLen = isWide ? 1.56 : 1.32;
  const chassisWid = isWide ? 1.16 : 0.96;
  const wheelRadius = isWide ? 0.25 : 0.22;

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e2532,
    roughness: 0.52,
    metalness: 0.78
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x151821,
    roughness: 0.78,
    metalness: 0.32
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.85
  });

  const deckGeo = new THREE.BoxGeometry(chassisLen, 0.24, chassisWid);
  const deck = new THREE.Mesh(deckGeo, hullMat);
  deck.position.y = wheelRadius + 0.06;
  deck.castShadow = !isSoftwareGl;
  deck.receiveShadow = !isSoftwareGl;

  const collarGeo = new THREE.CylinderGeometry(0.32, 0.42, 0.14, 12);
  const collar = new THREE.Mesh(collarGeo, hullMat);
  collar.position.y = wheelRadius + 0.22;
  collar.castShadow = !isSoftwareGl;

  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.18, 16);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.42, wheelRadius * 0.42, 0.195, 8);
  hubGeo.rotateX(Math.PI / 2);

  const wheels: THREE.Group[] = [];
  const wxOff = chassisLen * 0.36;
  const wzOff = chassisWid * 0.54;
  const offsets: [number, number][] = [
    [wxOff, -wzOff],
    [wxOff, wzOff],
    [-wxOff, -wzOff],
    [-wxOff, wzOff]
  ];
  for (const [ox, oz] of offsets) {
    const wPivot = new THREE.Group();
    wPivot.name = `${ox > 0 ? 'front' : 'rear'}_${oz < 0 ? 'left' : 'right'}_wheel`;
    wPivot.position.set(ox, wheelRadius, oz);
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = !isSoftwareGl;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wPivot.add(tire, hub);
    group.add(wPivot);
    wheels.push(wPivot);
  }

  group.add(deck, collar);

  const dispose = () => {
    deckGeo.dispose();
    collarGeo.dispose();
    wheelGeo.dispose();
    hubGeo.dispose();
    hullMat.dispose();
    tireMat.dispose();
    hubMat.dispose();
  };

  return { group, wheels, wheelRadius, mountHeight: wheelRadius + 0.24, dispose };
}

/**
 * Creates a Multi-Part Procedural Sci-Fi Pulse Rifle / Electromagnetic Arm Cannon (`THREE.Group`)
 * mounted directly onto the player mech's right forearm/hand or weapon turret node.
 */
export function createMountedSciFiPulseRifle(
  mechId: PlayerMechId,
  isUrdfZUpLink: boolean = false,
  parentScaleCompensation: number = 1.0,
  createFlashTexture: () => THREE.Texture = createSoftGlowSpriteTexture
) {
  const group = new THREE.Group();
  group.name = 'mounted_scifi_pulse_rifle';
  group.scale.setScalar(parentScaleCompensation);
  if (isUrdfZUpLink) {
    group.rotation.x = Math.PI / 2;
  }

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

  const receiverGeo = new THREE.BoxGeometry(0.46, 0.13, 0.095);
  const receiver = new THREE.Mesh(receiverGeo, receiverMat);
  receiver.position.set(0.16, 0.02, 0);

  const upperRailGeo = new THREE.BoxGeometry(0.56, 0.036, 0.056);
  const upperRail = new THREE.Mesh(upperRailGeo, alloyBarrelMat);
  upperRail.position.set(0.36, 0.062, 0);

  const lowerRailGeo = new THREE.BoxGeometry(0.52, 0.032, 0.052);
  const lowerRail = new THREE.Mesh(lowerRailGeo, alloyBarrelMat);
  lowerRail.position.set(0.34, -0.018, 0);

  const plasmaCoreGeo = new THREE.BoxGeometry(0.54, 0.026, 0.036);
  const plasmaCore = new THREE.Mesh(plasmaCoreGeo, plasmaRailMat);
  plasmaCore.position.set(0.35, 0.022, 0);

  const opticHousingGeo = new THREE.BoxGeometry(0.12, 0.055, 0.064);
  const opticHousing = new THREE.Mesh(opticHousingGeo, receiverMat);
  opticHousing.position.set(0.14, 0.11, 0);

  const opticLensGeo = new THREE.BoxGeometry(0.015, 0.038, 0.048);
  const opticLens = new THREE.Mesh(opticLensGeo, plasmaRailMat);
  opticLens.position.set(0.19, 0.112, 0);

  const magCellGeo = new THREE.BoxGeometry(0.075, 0.16, 0.058);
  const magCell = new THREE.Mesh(magCellGeo, receiverMat);
  magCell.position.set(0.18, -0.09, 0);
  magCell.rotation.z = -0.24;

  const muzzleBrakeGeo = new THREE.CylinderGeometry(0.038, 0.044, 0.09, 8);
  const muzzleBrake = new THREE.Mesh(muzzleBrakeGeo, alloyBarrelMat);
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

  const muzzleSocket = new THREE.Object3D();
  muzzleSocket.name = 'true_muzzle_socket';
  muzzleSocket.position.set(0.71, 0.022, 0);
  barrelCluster.add(muzzleSocket);

  const flashGroup = new THREE.Group();
  flashGroup.visible = false;
  muzzleSocket.add(flashGroup);

  const flashTex = createFlashTexture();
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
    recoilPos: number,
    dt: number = 0.016
  ) => {
    barrelCluster.position.x = -recoilPos * 0.065;

    const hex =
      activeWeapon === 'railgun'
        ? 0xfbbf24
        : activeWeapon === 'missile_pod'
          ? 0xfb7185
          : activeWeapon === 'compound_bow'
            ? 0x10b981
            : 0x00e5ff;
    plasmaRailMat.color.setHex(hex);
    plasmaRailMat.emissive.setHex(hex);

    if (muzzleFlashTimer > 0) {
      flashGroup.visible = true;
      flashMat.color.setHex(activeWeapon === 'railgun' ? 0xfef08a : hex);
      const t = Math.min(1, muzzleFlashTimer / 0.055);
      const weaponScaleMult =
        activeWeapon === 'railgun' ? 1.85 : activeWeapon === 'compound_bow' ? 1.05 : 1.15;
      flashGroup.scale.set(
        weaponScaleMult * (0.7 + t * 0.65),
        weaponScaleMult * (0.65 + t * 0.55),
        weaponScaleMult * (0.65 + t * 0.55)
      );
      flashGroup.rotation.x += 81.0 * dt;
      flashMat.opacity = 0.95 * t;
    } else {
      flashGroup.visible = false;
    }
  };

  const dispose = () => {
    receiverGeo.dispose();
    upperRailGeo.dispose();
    lowerRailGeo.dispose();
    plasmaCoreGeo.dispose();
    opticHousingGeo.dispose();
    opticLensGeo.dispose();
    magCellGeo.dispose();
    muzzleBrakeGeo.dispose();
    receiverMat.dispose();
    alloyBarrelMat.dispose();
    plasmaRailMat.dispose();
    flashTex.dispose();
    flashMat.dispose();
    spikeGeo.dispose();
    haloGeo.dispose();
  };

  return { group, restQuaternion: group.quaternion.clone(), barrelCluster, muzzleSocket, updateWeaponVisuals, dispose };
}

/**
 * Creates Dorsal Tactical Jet-Dodge Thruster Plumes for Player Mech (`C / Alt` Quick-Boost & Jump Jets).
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
    p.rotation.y = Math.PI / 2;
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
 * Creates a Translucent Fresnel + Localized Hexagonal Honeycomb Water-Ripple Energy Shield Material.
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

        float ndotv = clamp(abs(dot(normalize(vViewDir), normalize(vViewNormal))), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 3.6);
        float baseRim = fresnel * 0.16 * step(0.001, uShieldRatio);

        vec3 blendW = abs(nLocal);
        blendW = pow(blendW, vec3(4.0));
        blendW /= max(0.0001, blendW.x + blendW.y + blendW.z);
        float hexX = hexEdgeDist(nLocal.yz * uHexScale);
        float hexY = hexEdgeDist(nLocal.xz * uHexScale);
        float hexZ = hexEdgeDist(nLocal.xy * uHexScale);
        float hexDist = hexX * blendW.x + hexY * blendW.y + hexZ * blendW.z;
        float hexLine = 1.0 - smoothstep(0.02, 0.085, hexDist);

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

export const UP_AXIS = _up;
