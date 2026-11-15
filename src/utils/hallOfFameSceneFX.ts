import * as THREE from 'three';
import {
  StrobeSlotState,
  computeCatenaryUmbilicalPoints,
  computeSlamElevationColor
} from './hallOfFameEngine';
import { MoltenKerfNode, computeMoltenKerfColor } from './ccdIkSolver';
import {
  SandboxDomain,
  SandboxWaypoint,
  sampleLandTerrainHeight,
  sampleSeabedHeight
} from './actionSandboxEngine';

// ============================================================================
// 1. SANDEVISTAN 4D CHRONO-POSE STROBE CONTROLLER (ZERO GEOMETRY DUPLICATION!)
// ============================================================================

export interface SandevistanStrobeController {
  group: THREE.Group;
  bindRealMeshes: (realMeshes: THREE.Mesh[]) => void;
  capturePoseIntoSlot: (slotIndex: number, realMeshes: THREE.Mesh[], actorWorldPos?: THREE.Vector3) => void;
  updateSlots: (slots: StrobeSlotState[], visible: boolean, liveActorWorldPos?: THREE.Vector3) => void;
  dispose: () => void;
}

export function createSandevistanStrobeController(slotCount: number = 3): SandevistanStrobeController {
  const cappedSlots = Math.max(1, Math.min(3, slotCount));
  const group = new THREE.Group();
  group.name = 'sandevistan_strobe_pool';

  interface GhostSlot {
    container: THREE.Group;
    meshes: THREE.Mesh[];
    material: THREE.ShaderMaterial;
    capturedPos: THREE.Vector3;
    hasCapturedPos: boolean;
  }

  const ghostSlots: GhostSlot[] = [];

  for (let i = 0; i < cappedSlots; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.0 },
        uAgeNorm: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uAgeNorm;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          // Pure thin cyan Fresnel edge rim ONLY — strictly zero interior fill!
          float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormalW), viewDir)), 0.0, 1.0), 3.4);
          if (fresnel < 0.06) discard;
          vec3 cyanCol = vec3(0.0, 0.898, 1.0);
          vec3 iceBlueCol = vec3(0.22, 0.68, 0.98);
          vec3 tint = mix(cyanCol, iceBlueCol, uAgeNorm);
          float alpha = min(0.14, uOpacity) * fresnel;
          gl_FragColor = vec4(tint * (0.95 * fresnel), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    const container = new THREE.Group();
    container.visible = false;
    group.add(container);
    ghostSlots.push({
      container,
      meshes: [],
      material: mat,
      capturedPos: new THREE.Vector3(),
      hasCapturedPos: false
    });
  }

  const clearBoundMeshes = () => {
    for (const slot of ghostSlots) {
      slot.container.clear();
      slot.meshes = [];
      slot.container.visible = false;
      slot.hasCapturedPos = false;
    }
  };

  const _tmpWorldCenter = new THREE.Vector3();

  return {
    group,
    bindRealMeshes(realMeshes: THREE.Mesh[]) {
      clearBoundMeshes();
      for (const slot of ghostSlots) {
        for (let mIdx = 0; mIdx < realMeshes.length; mIdx++) {
          const src = realMeshes[mIdx];
          // IRON RULE: Share exact BufferGeometry reference — zero vertex memory duplication!
          const ghostMesh = new THREE.Mesh(src.geometry, slot.material);
          ghostMesh.matrixAutoUpdate = false;
          ghostMesh.frustumCulled = false;
          slot.container.add(ghostMesh);
          slot.meshes.push(ghostMesh);
        }
      }
    },
    capturePoseIntoSlot(slotIndex: number, realMeshes: THREE.Mesh[], actorWorldPos?: THREE.Vector3) {
      const slot = ghostSlots[slotIndex];
      if (!slot || slot.meshes.length !== realMeshes.length) return;
      for (let i = 0; i < realMeshes.length; i++) {
        const src = realMeshes[i];
        const dst = slot.meshes[i];
        dst.visible = src.visible;
        dst.matrix.copy(src.matrixWorld);
        dst.matrixWorld.copy(src.matrixWorld);
        dst.matrixWorldNeedsUpdate = false;
      }
      if (actorWorldPos) {
        slot.capturedPos.copy(actorWorldPos);
        slot.hasCapturedPos = true;
      } else if (realMeshes.length > 0) {
        _tmpWorldCenter.setFromMatrixPosition(realMeshes[0].matrixWorld);
        slot.capturedPos.copy(_tmpWorldCenter);
        slot.hasCapturedPos = true;
      }
      slot.container.visible = true;
    },
    updateSlots(slots: StrobeSlotState[], visible: boolean, liveActorWorldPos?: THREE.Vector3) {
      group.visible = visible;
      if (!visible) return;
      for (let i = 0; i < ghostSlots.length && i < slots.length; i++) {
        const st = slots[i];
        const gs = ghostSlots[i];
        let sepFactor = 1.0;
        if (liveActorWorldPos && gs.hasCapturedPos) {
          const d = gs.capturedPos.distanceTo(liveActorWorldPos);
          // Hide overlapping ghosts when stationary or within 0.58m of live body!
          sepFactor = Math.max(0, Math.min(1.0, (d - 0.22) / 0.42));
        }
        const finalOpacity = Math.min(0.14, st.opacity * sepFactor);
        if (!st.active || finalOpacity <= 0.004) {
          gs.container.visible = false;
        } else {
          gs.container.visible = true;
          gs.material.uniforms.uOpacity.value = finalOpacity;
          gs.material.uniforms.uAgeNorm.value = st.ageNorm;
        }
      }
    },
    dispose() {
      clearBoundMeshes();
      for (const slot of ghostSlots) {
        slot.material.dispose();
      }
    }
  };
}

// ============================================================================
// 2. MULTI-GLB SWARM LINK-16 MESH, KILL-CHAIN LASER & SUBSEA CATENARY TETHER
// ============================================================================

export interface SwarmSceneFXController {
  group: THREE.Group;
  updateLandLink16: (
    nodesTopWorld: THREE.Vector3[],
    lockedTargetWorld: THREE.Vector3,
    phase: 0 | 1 | 2 | 3,
    simTime: number,
    visible: boolean
  ) => void;
  updateSeaUmbilical: (
    motherWorld: [number, number, number],
    daughterWorld: [number, number, number],
    simTime: number,
    visible: boolean
  ) => void;
  dispose: () => void;
}

export function createSwarmSceneFXController(): SwarmSceneFXController {
  const group = new THREE.Group();
  group.name = 'swarm_datalink_and_tether_fx';

  // A. 3-Edge Link-16 Triangle Laser Mesh (6 vertices = 3 segments)
  const linkPos = new Float32Array(18);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  const linkMat = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const linkMesh = new THREE.LineSegments(linkGeo, linkMat);
  linkMesh.frustumCulled = false;
  group.add(linkMesh);

  // B. 6 High-Speed Shuttling Link-16 Data Packets (Faceted LatheGeometry Diamond — Zero Primitives!)
  const packetProfile = [
    new THREE.Vector2(0.005, 0.16),
    new THREE.Vector2(0.11, 0.0),
    new THREE.Vector2(0.005, -0.16)
  ];
  const packetGeo = new THREE.LatheGeometry(packetProfile, 6);
  const packetMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const packets: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(packetGeo, packetMat);
    m.visible = false;
    group.add(m);
    packets.push(m);
  }

  // C. Swarm Coordinated Kill-Chain Laser & Recon Target Lock Ring
  const swarmLaserArr = new Float32Array(6);
  const swarmLaserGeo = new THREE.BufferGeometry();
  swarmLaserGeo.setAttribute('position', new THREE.BufferAttribute(swarmLaserArr, 3));
  const swarmLaserMat = new THREE.LineBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending
  });
  const swarmLaser = new THREE.LineSegments(swarmLaserGeo, swarmLaserMat);
  swarmLaser.frustumCulled = false;
  swarmLaser.visible = false;
  group.add(swarmLaser);

  const lockPts: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    lockPts.push(new THREE.Vector3(Math.cos(a) * 1.45, 0.12, Math.sin(a) * 1.45));
  }
  const lockRingGeo = new THREE.BufferGeometry().setFromPoints(lockPts);
  const lockRingMat = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending
  });
  const targetLockRing = new THREE.LineLoop(lockRingGeo, lockRingMat);
  targetLockRing.visible = false;
  group.add(targetLockRing);

  // D. 24-Segment Flexible Subsea Catenary Umbilical Tether + Dual Glow Ribbon
  const tetherSegs = 24;
  const tetherPos = new Float32Array((tetherSegs + 1) * 3);
  const tetherUpperPos = new Float32Array((tetherSegs + 1) * 3);
  const tetherGeo = new THREE.BufferGeometry();
  tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
  const tetherUpperGeo = new THREE.BufferGeometry();
  tetherUpperGeo.setAttribute('position', new THREE.BufferAttribute(tetherUpperPos, 3));

  const tetherMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending
  });
  const tetherGlowMat = new THREE.LineBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending
  });

  const tetherLine = new THREE.Line(tetherGeo, tetherMat);
  const tetherGlowLine = new THREE.Line(tetherUpperGeo, tetherGlowMat);
  tetherLine.frustumCulled = false;
  tetherGlowLine.frustumCulled = false;
  tetherLine.visible = false;
  tetherGlowLine.visible = false;
  group.add(tetherLine, tetherGlowLine);

  return {
    group,
    updateLandLink16(nodesTopWorld, lockedTargetWorld, phase, simTime, visible) {
      if (!visible || nodesTopWorld.length < 2) {
        linkMesh.visible = false;
        swarmLaser.visible = false;
        targetLockRing.visible = false;
        for (const p of packets) p.visible = false;
        return;
      }

      linkMesh.visible = true;
      const n0 = nodesTopWorld[0];
      const n1 = nodesTopWorld[1];
      const n2 = nodesTopWorld[2] || nodesTopWorld[0];

      const writeSeg = (offset: number, a: THREE.Vector3, b: THREE.Vector3) => {
        linkPos[offset] = a.x;
        linkPos[offset + 1] = a.y;
        linkPos[offset + 2] = a.z;
        linkPos[offset + 3] = b.x;
        linkPos[offset + 4] = b.y;
        linkPos[offset + 5] = b.z;
      };
      writeSeg(0, n0, n1);
      writeSeg(6, n1, n2);
      writeSeg(12, n2, n0);
      linkGeo.attributes.position.needsUpdate = true;

      // Intensify Link-16 beam color during Phase 1 (Coordinate Handoff!)
      linkMat.color.setHex(phase === 1 ? 0xfbbf24 : 0x22d3ee);
      linkMat.opacity = phase === 1 ? 0.96 : 0.68;

      const pairs: [THREE.Vector3, THREE.Vector3][] = [
        [n0, n1],
        [n1, n2],
        [n2, n0],
        [n1, n0],
        [n2, n1],
        [n0, n2]
      ];
      const pktSpeed = phase === 1 ? 2.6 : 1.25;
      for (let i = 0; i < packets.length; i++) {
        const [pa, pb] = pairs[i];
        const u = (simTime * pktSpeed + i * 0.19) % 1.0;
        packets[i].visible = true;
        packets[i].position.lerpVectors(pa, pb, u);
        packets[i].rotation.y = simTime * 6.0;
        const sc = phase === 1 ? 1.45 : 0.95;
        packets[i].scale.setScalar(sc);
      }

      // Target Lock Ring & Coordinated Heavy Laser Fire in Phase 2
      targetLockRing.visible = true;
      targetLockRing.position.copy(lockedTargetWorld);
      targetLockRing.rotation.y = simTime * 2.4;
      const pulseScale = 1.0 + 0.12 * Math.sin(simTime * 10.0);
      targetLockRing.scale.setScalar(pulseScale);

      if (phase === 2) {
        // Heavy laser fires from SAR node (or node 0) straight into locked target!
        const shooter = nodesTopWorld[0];
        swarmLaserArr[0] = shooter.x;
        swarmLaserArr[1] = shooter.y - 0.15;
        swarmLaserArr[2] = shooter.z;
        swarmLaserArr[3] = lockedTargetWorld.x;
        swarmLaserArr[4] = lockedTargetWorld.y + 0.3;
        swarmLaserArr[5] = lockedTargetWorld.z;
        swarmLaserGeo.attributes.position.needsUpdate = true;
        swarmLaser.visible = true;
      } else {
        swarmLaser.visible = false;
      }
    },
    updateSeaUmbilical(motherWorld, daughterWorld, simTime, visible) {
      tetherLine.visible = visible;
      tetherGlowLine.visible = visible;
      if (!visible) {
        for (const p of packets) p.visible = false;
        return;
      }

      linkMesh.visible = false;
      swarmLaser.visible = false;
      targetLockRing.visible = false;

      const curvePts = computeCatenaryUmbilicalPoints(
        motherWorld,
        daughterWorld,
        simTime,
        tetherSegs
      );
      for (let i = 0; i < curvePts.length; i++) {
        const [cx, cy, cz] = curvePts[i];
        tetherPos[i * 3] = cx;
        tetherPos[i * 3 + 1] = cy;
        tetherPos[i * 3 + 2] = cz;

        tetherUpperPos[i * 3] = cx;
        tetherUpperPos[i * 3 + 1] = cy + 0.04;
        tetherUpperPos[i * 3 + 2] = cz;
      }
      tetherGeo.attributes.position.needsUpdate = true;
      tetherUpperGeo.attributes.position.needsUpdate = true;

      // Fiber-optic light pulses racing along the catenary umbilical cable!
      for (let i = 0; i < packets.length; i++) {
        if (i >= 4) {
          packets[i].visible = false;
          continue;
        }
        const u = (simTime * 0.95 + i * 0.25) % 1.0;
        const fIdx = u * tetherSegs;
        const i0 = Math.min(tetherSegs, Math.floor(fIdx));
        const i1 = Math.min(tetherSegs, i0 + 1);
        const frac = fIdx - i0;
        const p0 = curvePts[i0];
        const p1 = curvePts[i1];
        packets[i].visible = true;
        packets[i].position.set(
          p0[0] + (p1[0] - p0[0]) * frac,
          p0[1] + (p1[1] - p0[1]) * frac,
          p0[2] + (p1[2] - p0[2]) * frac
        );
        packets[i].scale.setScalar(0.85);
      }
    },
    dispose() {
      linkGeo.dispose();
      linkMat.dispose();
      packetGeo.dispose();
      packetMat.dispose();
      swarmLaserGeo.dispose();
      swarmLaserMat.dispose();
      lockRingGeo.dispose();
      lockRingMat.dispose();
      tetherGeo.dispose();
      tetherUpperGeo.dispose();
      tetherMat.dispose();
      tetherGlowMat.dispose();
    }
  };
}

// ============================================================================
// 3. MACHINE-EYE NATIVE VISIONS: PURE LIDAR SLAM POINT CLOUD & ACOUSTIC ECHO
// ============================================================================

export interface MachineVisionFXController {
  group: THREE.Group;
  updateVision: (
    mode: 'normal' | 'slam' | 'flir' | 'acoustic',
    actorPos: THREE.Vector3,
    simTime: number
  ) => void;
  dispose: () => void;
}

export function createMachineVisionFXController(
  domain: SandboxDomain,
  waypoints: SandboxWaypoint[],
  softParticleTex: THREE.Texture
): MachineVisionFXController {
  const group = new THREE.Group();
  group.name = 'machine_eye_slam_and_acoustic_fx';

  // A. High-Density 3D Pure LiDAR SLAM Point Cloud (Terrain + Obstacles + Waypoint Structures)
  const gridDim = 76; // 76 x 76 = 5,776 terrain SLAM lidar returns + 624 obstacle returns = 6,400 points!
  const obstaclePts = 624;
  const totalPts = gridDim * gridDim + obstaclePts;
  const slamPos = new Float32Array(totalPts * 3);
  const slamBaseColors = new Float32Array(totalPts * 3);
  const slamLiveColors = new Float32Array(totalPts * 3);

  let idx = 0;
  const span = 108;
  for (let iz = 0; iz < gridDim; iz++) {
    const z = (iz / (gridDim - 1) - 0.5) * span;
    for (let ix = 0; ix < gridDim; ix++) {
      const x = (ix / (gridDim - 1) - 0.5) * span;
      const y =
        domain === 'sea'
          ? sampleSeabedHeight(x, z)
          : domain === 'air'
            ? 3.5 + Math.sin(x * 0.14) * Math.cos(z * 0.14) * 2.2
            : sampleLandTerrainHeight(x, z);

      slamPos[idx * 3] = x;
      slamPos[idx * 3 + 1] = y + 0.05;
      slamPos[idx * 3 + 2] = z;

      const [cr, cg, cb] = computeSlamElevationColor(domain === 'air' ? y - 6.0 : y);
      slamBaseColors[idx * 3] = cr;
      slamBaseColors[idx * 3 + 1] = cg;
      slamBaseColors[idx * 3 + 2] = cb;
      idx++;
    }
  }

  // Dense vertical obstacle / rock / gate LiDAR cluster returns around waypoints & arena
  for (let k = 0; k < obstaclePts; k++) {
    const wp = waypoints[k % Math.max(1, waypoints.length)];
    const ang = (k * 0.47) % (Math.PI * 2);
    const r = 0.6 + ((k * 13) % 28) * 0.12;
    const hOff = ((k * 19) % 30) * 0.11;
    const ox = (wp ? wp.x + wp.targetRockOffset[0] : 12) + Math.cos(ang) * r;
    const oz = (wp ? wp.z + wp.targetRockOffset[2] : -8) + Math.sin(ang) * r;
    const baseH =
      domain === 'sea'
        ? sampleSeabedHeight(ox, oz)
        : domain === 'air'
          ? (wp?.y ?? 13.5) - 1.5
          : sampleLandTerrainHeight(ox, oz);
    const oy = baseH + hOff;

    slamPos[idx * 3] = ox;
    slamPos[idx * 3 + 1] = oy;
    slamPos[idx * 3 + 2] = oz;

    const [cr, cg, cb] = computeSlamElevationColor(oy + 1.8);
    slamBaseColors[idx * 3] = cr;
    slamBaseColors[idx * 3 + 1] = cg;
    slamBaseColors[idx * 3 + 2] = cb;
    idx++;
  }

  slamLiveColors.set(slamBaseColors);

  const slamGeo = new THREE.BufferGeometry();
  slamGeo.setAttribute('position', new THREE.BufferAttribute(slamPos, 3));
  slamGeo.setAttribute('color', new THREE.BufferAttribute(slamLiveColors, 3));
  const slamMat = new THREE.PointsMaterial({
    map: softParticleTex,
    size: 0.34,
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    alphaTest: 0.02,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const slamPoints = new THREE.Points(slamGeo, slamMat);
  slamPoints.frustumCulled = false;
  slamPoints.visible = false;
  group.add(slamPoints);

  // B.Acoustic Echo Bathymetric Contour Wireframe Lines (`蔚蓝色海沟等高线网格`) + 3 Expanding Sonar Rings
  const contourSegs: number[] = [];
  const cSteps = 38;
  const cSpan = 96;
  for (let i = 0; i <= cSteps; i += 2) {
    const coord = (i / cSteps - 0.5) * cSpan;
    for (let j = 0; j < cSteps; j++) {
      const t0 = (j / cSteps - 0.5) * cSpan;
      const t1 = ((j + 1) / cSteps - 0.5) * cSpan;
      const hX0 =
        domain === 'sea' ? sampleSeabedHeight(t0, coord) : sampleLandTerrainHeight(t0, coord);
      const hX1 =
        domain === 'sea' ? sampleSeabedHeight(t1, coord) : sampleLandTerrainHeight(t1, coord);
      contourSegs.push(t0, hX0 + 0.06, coord, t1, hX1 + 0.06, coord);

      const hZ0 =
        domain === 'sea' ? sampleSeabedHeight(coord, t0) : sampleLandTerrainHeight(coord, t0);
      const hZ1 =
        domain === 'sea' ? sampleSeabedHeight(coord, t1) : sampleLandTerrainHeight(coord, t1);
      contourSegs.push(coord, hZ0 + 0.06, t0, coord, hZ1 + 0.06, t1);
    }
  }
  const contourGeo = new THREE.BufferGeometry();
  contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(contourSegs, 3));
  const contourMat = new THREE.LineBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const contourMesh = new THREE.LineSegments(contourGeo, contourMat);
  contourMesh.visible = false;
  group.add(contourMesh);

  // 3 Concentric Expanding Sweep Rings shared by SLAM & Acoustic Echo Vision
  const ringGeoPts: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    ringGeoPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const sweepRingGeo = new THREE.BufferGeometry().setFromPoints(ringGeoPts);
  const sweepRings: { loop: THREE.LineLoop; mat: THREE.LineBasicMaterial }[] = [];
  for (let r = 0; r < 3; r++) {
    const rm = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const rl = new THREE.LineLoop(sweepRingGeo, rm);
    rl.visible = false;
    group.add(rl);
    sweepRings.push({ loop: rl, mat: rm });
  }

  return {
    group,
    updateVision(mode, actorPos, simTime) {
      const isSlam = mode === 'slam';
      const isAcoustic = mode === 'acoustic';
      slamPoints.visible = isSlam || isAcoustic;
      contourMesh.visible = isAcoustic;

      if (!isSlam && !isAcoustic) {
        for (const sr of sweepRings) sr.loop.visible = false;
        return;
      }

      // 3 staggered radar/sonar waves expanding 0 -> 48m radius
      const waveRadii: number[] = [];
      for (let r = 0; r < sweepRings.length; r++) {
        const phase = (simTime * 0.55 + r / 3) % 1.0;
        const rad = 1.2 + phase * 48.0;
        waveRadii.push(rad);
        sweepRings[r].loop.visible = true;
        sweepRings[r].loop.position.set(actorPos.x, actorPos.y + 0.15, actorPos.z);
        sweepRings[r].loop.scale.set(rad, 1, rad);
        sweepRings[r].mat.color.setHex(isAcoustic ? 0x38bdf8 : 0x10b981);
        sweepRings[r].mat.opacity = (1.0 - phase) * 0.85;
      }

      if (isAcoustic) {
        contourMat.opacity = 0.25 + 0.22 * Math.sin(simTime * 3.4);
      }

      // Modulate point brightness dynamically as SLAM / Acoustic wave crests sweep across the terrain!
      for (let i = 0; i < totalPts; i++) {
        const dx = slamPos[i * 3] - actorPos.x;
        const dz = slamPos[i * 3 + 2] - actorPos.z;
        const dist = Math.hypot(dx, dz);
        let boost = isSlam ? 0.42 : 0.08;
        for (let w = 0; w < waveRadii.length; w++) {
          const diff = Math.abs(dist - waveRadii[w]);
          if (diff < 3.6) {
            boost = Math.max(boost, 1.35 * (1.0 - diff / 3.6));
          }
        }
        if (isAcoustic) {
          // Pure azure-cyan sonar echo returns in abyssal darkness!
          slamLiveColors[i * 3] = 0.08 * boost;
          slamLiveColors[i * 3 + 1] = 0.72 * boost;
          slamLiveColors[i * 3 + 2] = 1.0 * boost;
        } else {
          slamLiveColors[i * 3] = Math.min(1.0, slamBaseColors[i * 3] * boost);
          slamLiveColors[i * 3 + 1] = Math.min(1.0, slamBaseColors[i * 3 + 1] * boost);
          slamLiveColors[i * 3 + 2] = Math.min(1.0, slamBaseColors[i * 3 + 2] * boost);
        }
      }
      slamGeo.attributes.color.needsUpdate = true;
    },
    dispose() {
      slamGeo.dispose();
      slamMat.dispose();
      contourGeo.dispose();
      contourMat.dispose();
      sweepRingGeo.dispose();
      for (const sr of sweepRings) sr.mat.dispose();
    }
  };
}

// ============================================================================
// 4. REAL 6-DOF CCD IK TARGET GIZMO, PLASMA TORCH ARC & MOLTEN KERF TRAIL
// ============================================================================

export interface IkAndPlasmaFXController {
  group: THREE.Group;
  targetGizmo: THREE.Group;
  /** Raycast proxy mesh (custom 6-vertex octahedron BufferGeometry) */
  hitProxyMesh: THREE.Mesh;
  updateIkAndPlasma: (
    ikActive: boolean,
    targetWorld: THREE.Vector3,
    endEffectorWorld: THREE.Vector3,
    plasmaActive: boolean,
    kerfNodes: MoltenKerfNode[],
    simTime: number
  ) => void;
  dispose: () => void;
}

export function createIkAndPlasmaFXController(
  softParticleTex: THREE.Texture
): IkAndPlasmaFXController {
  const group = new THREE.Group();
  group.name = 'ccd_ik_and_plasma_cutting_fx';

  // A. Composite 3-Ring Holographic Gyroscope IK Target Gizmo (ZERO Primitive Geometries!)
  const targetGizmo = new THREE.Group();
  targetGizmo.visible = false;
  group.add(targetGizmo);

  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMatCyan = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending
  });
  const ringMatAmber = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending
  });

  const gyroX = new THREE.LineLoop(ringGeo, ringMatCyan);
  const gyroY = new THREE.LineLoop(ringGeo, ringMatAmber);
  gyroY.rotation.x = Math.PI / 2;
  gyroY.scale.setScalar(0.82);
  const gyroZ = new THREE.LineLoop(ringGeo, ringMatCyan);
  gyroZ.rotation.y = Math.PI / 2;
  gyroZ.scale.setScalar(0.66);
  targetGizmo.add(gyroX, gyroY, gyroZ);

  // Core diamond reticle + invisible enlarged raycast hit proxy (LatheGeometry!)
  const coreProfile = [
    new THREE.Vector2(0.004, 0.11),
    new THREE.Vector2(0.09, 0.0),
    new THREE.Vector2(0.004, -0.11)
  ];
  const coreGeo = new THREE.LatheGeometry(coreProfile, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending
  });
  const coreDiamond = new THREE.Mesh(coreGeo, coreMat);
  targetGizmo.add(coreDiamond);

  const hitProfile = [
    new THREE.Vector2(0.01, 0.34),
    new THREE.Vector2(0.34, 0.0),
    new THREE.Vector2(0.01, -0.34)
  ];
  const hitGeo = new THREE.LatheGeometry(hitProfile, 10);
  const hitMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });
  const hitProxyMesh = new THREE.Mesh(hitGeo, hitMat);
  targetGizmo.add(hitProxyMesh);

  // Dashed guide line from end-effector tip to IK target
  const guideArr = new Float32Array(6);
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute('position', new THREE.BufferAttribute(guideArr, 3));
  const guideMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.06,
    gapSize: 0.04,
    transparent: true,
    opacity: 0.75
  });
  const guideLine = new THREE.Line(guideGeo, guideMat);
  guideLine.frustumCulled = false;
  guideLine.visible = false;
  group.add(guideLine);

  // B. Blinding Blue-White Plasma Cutting Torch Cone + Jagged Electric Arc Filaments
  const torchProfile = [
    new THREE.Vector2(0.018, 0.0),
    new THREE.Vector2(0.065, 0.18),
    new THREE.Vector2(0.025, 0.48),
    new THREE.Vector2(0.002, 0.62)
  ];
  const torchGeo = new THREE.LatheGeometry(torchProfile, 14);
  torchGeo.rotateX(Math.PI / 2); // Points along +Z so lookAt(cutPoint) aims jet cleanly!
  const torchMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const plasmaTorchMesh = new THREE.Mesh(torchGeo, torchMat);
  plasmaTorchMesh.visible = false;
  group.add(plasmaTorchMesh);

  const arcVerts = 8;
  const arcArr = new Float32Array(arcVerts * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcArr, 3));
  const arcMat = new THREE.LineBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending
  });
  const plasmaArcLine = new THREE.Line(arcGeo, arcMat);
  plasmaArcLine.frustumCulled = false;
  plasmaArcLine.visible = false;
  group.add(plasmaArcLine);

  // C. Persistent Glowing Molten Kerf Trail (`炽热发红渐冷的熔融切割轨迹`: Line + Glowing Slag Beads)
  const maxKerf = 96;
  const kerfPos = new Float32Array(maxKerf * 3);
  const kerfCol = new Float32Array(maxKerf * 3);
  for (let i = 0; i < maxKerf; i++) kerfPos[i * 3 + 1] = -999;

  const kerfGeo = new THREE.BufferGeometry();
  kerfGeo.setAttribute('position', new THREE.BufferAttribute(kerfPos, 3));
  kerfGeo.setAttribute('color', new THREE.BufferAttribute(kerfCol, 3));
  kerfGeo.setDrawRange(0, 0);

  const kerfLineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending
  });
  const kerfLine = new THREE.Line(kerfGeo, kerfLineMat);
  kerfLine.frustumCulled = false;

  const kerfBeadMat = new THREE.PointsMaterial({
    map: softParticleTex,
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    alphaTest: 0.02,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const kerfBeads = new THREE.Points(kerfGeo, kerfBeadMat);
  kerfBeads.frustumCulled = false;
  group.add(kerfLine, kerfBeads);

  return {
    group,
    targetGizmo,
    hitProxyMesh,
    updateIkAndPlasma(ikActive, targetWorld, endEffectorWorld, plasmaActive, kerfNodes, simTime) {
      targetGizmo.visible = ikActive;
      if (ikActive) {
        targetGizmo.position.copy(targetWorld);
        gyroX.rotation.z = simTime * 1.8;
        gyroY.rotation.y = -simTime * 2.2;
        gyroZ.rotation.x = simTime * 1.5;
        coreDiamond.rotation.y = simTime * 3.4;

        guideArr[0] = endEffectorWorld.x;
        guideArr[1] = endEffectorWorld.y;
        guideArr[2] = endEffectorWorld.z;
        guideArr[3] = targetWorld.x;
        guideArr[4] = targetWorld.y;
        guideArr[5] = targetWorld.z;
        guideGeo.attributes.position.needsUpdate = true;
        guideLine.computeLineDistances();
        guideLine.visible = true;
      } else {
        guideLine.visible = false;
      }

      if (plasmaActive) {
        plasmaTorchMesh.visible = true;
        plasmaTorchMesh.position.copy(endEffectorWorld);
        plasmaTorchMesh.lookAt(targetWorld);
        const dist = Math.max(0.18, Math.min(2.4, endEffectorWorld.distanceTo(targetWorld)));
        const flicker = 0.88 + 0.24 * Math.sin(simTime * 75.0);
        plasmaTorchMesh.scale.set(flicker, flicker, (dist / 0.62) * flicker);

        // Jagged electric plasma filament between end-effector and cut surface!
        plasmaArcLine.visible = true;
        for (let k = 0; k < arcVerts; k++) {
          const u = k / (arcVerts - 1);
          const env = Math.sin(u * Math.PI);
          const jx = Math.sin(simTime * 91 + k * 4.7) * 0.065 * env;
          const jy = Math.cos(simTime * 83 + k * 3.3) * 0.065 * env;
          const jz = Math.sin(simTime * 77 - k * 5.1) * 0.065 * env;
          arcArr[k * 3] = endEffectorWorld.x + (targetWorld.x - endEffectorWorld.x) * u + jx;
          arcArr[k * 3 + 1] = endEffectorWorld.y + (targetWorld.y - endEffectorWorld.y) * u + jy;
          arcArr[k * 3 + 2] = endEffectorWorld.z + (targetWorld.z - endEffectorWorld.z) * u + jz;
        }
        arcGeo.attributes.position.needsUpdate = true;
      } else {
        plasmaTorchMesh.visible = false;
        plasmaArcLine.visible = false;
      }

      // Sync Molten Kerf Trail nodes
      const count = Math.min(maxKerf, kerfNodes.length);
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const nd = kerfNodes[i];
          kerfPos[i * 3] = nd.x;
          kerfPos[i * 3 + 1] = nd.y;
          kerfPos[i * 3 + 2] = nd.z;
          const [r, g, b] = computeMoltenKerfColor(nd.heat);
          kerfCol[i * 3] = r;
          kerfCol[i * 3 + 1] = g;
          kerfCol[i * 3 + 2] = b;
        }
        kerfGeo.setDrawRange(0, count);
        kerfGeo.attributes.position.needsUpdate = true;
        kerfGeo.attributes.color.needsUpdate = true;
        kerfLine.visible = count >= 2;
        kerfBeads.visible = true;
      } else {
        kerfGeo.setDrawRange(0, 0);
        kerfLine.visible = false;
        kerfBeads.visible = false;
      }
    },
    dispose() {
      ringGeo.dispose();
      ringMatCyan.dispose();
      ringMatAmber.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      hitGeo.dispose();
      hitMat.dispose();
      guideGeo.dispose();
      guideMat.dispose();
      torchGeo.dispose();
      torchMat.dispose();
      arcGeo.dispose();
      arcMat.dispose();
      kerfGeo.dispose();
      kerfLineMat.dispose();
      kerfBeadMat.dispose();
    }
  };
}
