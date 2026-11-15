import * as THREE from 'three';
import {
  MpcRolloutResult,
  SlsMaterializationState,
  WindTunnelDisasterConfig,
  computeMpcCostColor,
  computeUrdfPowerFlowMetrics,
  generateSurfaceLightningArcPoints
} from './sciTechEngine';

// ============================================================================
// CUSTOM BUFFERGEOMETRY HELPERS (ZERO PRIMITIVE GEOMETRIES!)
// ============================================================================

function createCustomRingLoopGeometry(
  radius: number,
  segments: number,
  plane: 'XY' | 'XZ' | 'YZ'
): THREE.BufferGeometry {
  const pos = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    const b = i * 3;
    if (plane === 'XZ') {
      pos[b] = c;
      pos[b + 1] = 0;
      pos[b + 2] = s;
    } else if (plane === 'XY') {
      pos[b] = c;
      pos[b + 1] = s;
      pos[b + 2] = 0;
    } else {
      pos[b] = 0;
      pos[b + 1] = c;
      pos[b + 2] = s;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

function createCustomHorizontalDiscGeometry(radius: number, segs: number = 48): THREE.BufferGeometry {
  const pos = new Float32Array(segs * 9);
  const norm = new Float32Array(segs * 9);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const b = i * 9;
    pos[b] = 0;
    pos[b + 1] = 0;
    pos[b + 2] = 0;
    pos[b + 3] = Math.cos(a0) * radius;
    pos[b + 4] = 0;
    pos[b + 5] = Math.sin(a0) * radius;
    pos[b + 6] = Math.cos(a1) * radius;
    pos[b + 7] = 0;
    pos[b + 8] = Math.sin(a1) * radius;
    for (let k = 0; k < 9; k += 3) {
      norm[b + k] = 0;
      norm[b + k + 1] = 1;
      norm[b + k + 2] = 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return g;
}

/**
 * Builds an aerodynamic Mach-8 Paraboloid Bow-Shock Plasma Sheath shell
 * directly from parametric mathematical rings (zero Cone/Sphere/Cylinder primitives).
 */
function createParaboloidBowShockGeometry(
  length: number = 2.6,
  noseRadius: number = 0.85,
  rings: number = 20,
  radialSegs: number = 32
): THREE.BufferGeometry {
  const vertCount = (rings + 1) * (radialSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const norm = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  let vIdx = 0;
  for (let r = 0; r <= rings; r++) {
    const u = r / rings; // 0 = windward nose apex, 1 = downstream plasma tail skirt
    const axialX = -length * 0.42 + u * length;
    const rad = noseRadius * Math.sqrt(Math.max(0.002, u * 1.45));

    for (let s = 0; s <= radialSegs; s++) {
      const theta = (s / radialSegs) * Math.PI * 2;
      const cy = Math.sin(theta) * rad;
      const cz = Math.cos(theta) * rad;

      pos[vIdx * 3] = axialX;
      pos[vIdx * 3 + 1] = cy;
      pos[vIdx * 3 + 2] = cz;

      const nx = -0.55;
      const ny = Math.sin(theta);
      const nz = Math.cos(theta);
      const nLen = Math.hypot(nx, ny, nz) || 1;
      norm[vIdx * 3] = nx / nLen;
      norm[vIdx * 3 + 1] = ny / nLen;
      norm[vIdx * 3 + 2] = nz / nLen;

      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = s / radialSegs;
      vIdx++;
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

function createSoftGlowSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.8)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 1. MODULE 1 SCENE FX: 3D MAG-LENS PLASMA RETICLE & DUAL-LASER SLS PRINTER RIG
// ============================================================================

export interface MagLensAndSlsRigController {
  group: THREE.Group;
  update: (params: {
    magLensEnabled: boolean;
    magLensHoverValid: boolean;
    magLensCenter: THREE.Vector3;
    magLensRadius: number;
    slsState: SlsMaterializationState;
    modelCenter: THREE.Vector3;
    yMax: number;
    simTime: number;
  }) => void;
  dispose: () => void;
}

export function createMagLensAndSlsRigController(): MagLensAndSlsRigController {
  const group = new THREE.Group();
  group.name = 'maglens_and_sls_materialization_rig';

  const glowTex = createSoftGlowSpriteTexture();

  // --- A. 3D Mag-Lens X-Ray Sphere Plasma Reticle ---
  const magGroup = new THREE.Group();
  magGroup.visible = false;
  group.add(magGroup);

  const ringGeoXZ = createCustomRingLoopGeometry(1.0, 64, 'XZ');
  const ringGeoXY = createCustomRingLoopGeometry(1.0, 64, 'XY');
  const ringGeoYZ = createCustomRingLoopGeometry(1.0, 64, 'YZ');

  const magMatOuter = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const magMatSub = new THREE.LineBasicMaterial({
    color: 0xa855f7,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const loopXZ = new THREE.LineLoop(ringGeoXZ, magMatOuter);
  const loopXY = new THREE.LineLoop(ringGeoXY, magMatSub);
  const loopYZ = new THREE.LineLoop(ringGeoYZ, magMatSub);
  magGroup.add(loopXZ, loopXY, loopYZ);

  // --- B. Dual-Laser SLS Metal 3D Printing Gantry Beams, Laser Sheet & Sparks ---
  const slsGroup = new THREE.Group();
  slsGroup.visible = false;
  group.add(slsGroup);

  const slsDiscGeo = createCustomHorizontalDiscGeometry(1.45, 56);
  const slsDiscMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const slsDiscMesh = new THREE.Mesh(slsDiscGeo, slsDiscMat);
  slsGroup.add(slsDiscMesh);

  const slsPerimeterGeo = createCustomRingLoopGeometry(1.45, 72, 'XZ');
  const slsPerimeterMat = new THREE.LineBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const slsPerimeterRing = new THREE.LineLoop(slsPerimeterGeo, slsPerimeterMat);
  slsGroup.add(slsPerimeterRing);

  // Twin overhead galvanometer sintering laser beams (2 segments = 4 vertices = 12 floats)
  const laserBeamPos = new Float32Array(12);
  const laserBeamGeo = new THREE.BufferGeometry();
  laserBeamGeo.setAttribute('position', new THREE.BufferAttribute(laserBeamPos, 3));
  const laserBeamMat = new THREE.LineBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const twinLaserBeams = new THREE.LineSegments(laserBeamGeo, laserBeamMat);
  twinLaserBeams.frustumCulled = false;
  slsGroup.add(twinLaserBeams);

  // Molten sintering spark particles along the laser plane (72 points)
  const sparkCount = 72;
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkCol = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const warm = i % 3 === 0 ? [1.0, 0.98, 0.82] : [1.0, 0.68, 0.18];
    sparkCol[i * 3] = warm[0];
    sparkCol[i * 3 + 1] = warm[1];
    sparkCol[i * 3 + 2] = warm[2];
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.065,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const slsSparks = new THREE.Points(sparkGeo, sparkMat);
  slsSparks.frustumCulled = false;
  slsGroup.add(slsSparks);

  return {
    group,
    update({
      magLensEnabled,
      magLensHoverValid,
      magLensCenter,
      magLensRadius,
      slsState,
      modelCenter,
      yMax,
      simTime
    }) {
      // 1. Update 3D Mag-Lens Plasma Reticle
      const showMag = magLensEnabled && magLensHoverValid;
      magGroup.visible = showMag;
      if (showMag) {
        magGroup.position.copy(magLensCenter);
        magGroup.scale.setScalar(magLensRadius);
        loopXZ.rotation.y = simTime * 1.4;
        loopXY.rotation.z = -simTime * 1.1;
        loopYZ.rotation.x = simTime * 0.9;
      }

      // 2. Update Dual-Laser SLS 3D Printing Rig
      slsGroup.visible = slsState.active;
      if (slsState.active) {
        const ly = slsState.laserY;
        slsDiscMesh.position.set(modelCenter.x, ly, modelCenter.z);
        slsPerimeterRing.position.set(modelCenter.x, ly, modelCenter.z);
        slsDiscMat.opacity = (0.09 + 0.05 * Math.sin(simTime * 28.0)) * slsState.meltIntensity;

        // High-speed dual galvanometer laser heads sweeping across melt pool!
        const headY = yMax + 1.15;
        const spot1X = modelCenter.x + Math.sin(simTime * 37.0) * 0.62;
        const spot1Z = modelCenter.z + Math.cos(simTime * 29.0) * 0.58;
        const spot2X = modelCenter.x + Math.cos(simTime * 43.0) * 0.62;
        const spot2Z = modelCenter.z + Math.sin(simTime * 31.0) * 0.58;

        laserBeamPos[0] = modelCenter.x - 0.55;
        laserBeamPos[1] = headY;
        laserBeamPos[2] = modelCenter.z - 0.35;
        laserBeamPos[3] = spot1X;
        laserBeamPos[4] = ly;
        laserBeamPos[5] = spot1Z;

        laserBeamPos[6] = modelCenter.x + 0.55;
        laserBeamPos[7] = headY;
        laserBeamPos[8] = modelCenter.z + 0.35;
        laserBeamPos[9] = spot2X;
        laserBeamPos[10] = ly;
        laserBeamPos[11] = spot2Z;
        laserBeamGeo.attributes.position.needsUpdate = true;

        // Sputtering molten titanium sparks erupting from both laser focal spots & sinter ring
        for (let i = 0; i < sparkCount; i++) {
          const phase = (simTime * 3.8 + i * 0.17) % 1.0;
          const useSpot2 = i % 2 === 1;
          const ox = i < 36 ? (useSpot2 ? spot2X : spot1X) : modelCenter.x + Math.cos(i * 1.9 + simTime * 6) * 0.68;
          const oz = i < 36 ? (useSpot2 ? spot2Z : spot1Z) : modelCenter.z + Math.sin(i * 1.9 + simTime * 6) * 0.68;
          sparkPos[i * 3] = ox + Math.sin(i * 7.3) * phase * 0.28;
          sparkPos[i * 3 + 1] = ly + phase * 0.24 - phase * phase * 0.32;
          sparkPos[i * 3 + 2] = oz + Math.cos(i * 5.1) * phase * 0.28;
        }
        sparkGeo.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      glowTex.dispose();
      ringGeoXZ.dispose();
      ringGeoXY.dispose();
      ringGeoYZ.dispose();
      magMatOuter.dispose();
      magMatSub.dispose();
      slsDiscGeo.dispose();
      slsDiscMat.dispose();
      slsPerimeterGeo.dispose();
      slsPerimeterMat.dispose();
      laserBeamGeo.dispose();
      laserBeamMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
    }
  };
}

// ============================================================================
// 2. MODULE 2 SCENE FX: 11-ARC MPC PREDICTIVE ROLLOUT & URDF POWER-FLOW ARTERIES
// ============================================================================

export interface MpcAndPowerArteriesController {
  group: THREE.Group;
  /** Binds exact real .glb BufferGeometry references (zero geometry duplication!) for the 0.8s & 1.6s future wireframe ghosts */
  bindFutureGhostModel: (sourceModelRoot: THREE.Object3D) => void;
  updateMpcAndPower: (params: {
    enabled: boolean;
    mpcResult: MpcRolloutResult | null;
    powerCoreWorld: THREE.Vector3;
    jointNodes: { def: { name: string; type: string }; node: THREE.Object3D; omegaRadS: number; torqueNm?: number }[];
    simTime: number;
  }) => { totalPowerWatts: number };
  dispose: () => void;
}

export function createMpcAndPowerArteriesController(): MpcAndPowerArteriesController {
  const group = new THREE.Group();
  group.name = 'mpc_predictive_rollout_and_urdf_power_arteries';
  group.visible = false;

  const glowTex = createSoftGlowSpriteTexture();

  // --- A. 11 Curved MPC Rollout Trajectory Lines (11 arcs * 16 segments = 176 segments = 352 vertices) ---
  const maxArcs = 11;
  const stepsPerArc = 16;
  const totalVerts = maxArcs * stepsPerArc * 2;
  const arcPos = new Float32Array(totalVerts * 3);
  const arcCol = new Float32Array(totalVerts * 3);

  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  arcGeo.setAttribute('color', new THREE.BufferAttribute(arcCol, 3));
  const arcMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const arcSegments = new THREE.LineSegments(arcGeo, arcMat);
  arcSegments.frustumCulled = false;
  group.add(arcSegments);

  // --- B. Two Ultra-Faint Future Predicted Pose Wireframe Ghosts (t = +0.8s and t = +1.6s) ---
  const ghostMat08 = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    wireframe: true,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ghostMat16 = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const ghostGroup08 = new THREE.Group();
  const ghostGroup16 = new THREE.Group();
  group.add(ghostGroup08, ghostGroup16);

  // --- C. URDF Kinematic Power-Flow Arteries & Energy Pulse Particles ---
  const maxJoints = 48;
  const arteryPos = new Float32Array(maxJoints * 6);
  const arteryCol = new Float32Array(maxJoints * 6);
  const arteryGeo = new THREE.BufferGeometry();
  arteryGeo.setAttribute('position', new THREE.BufferAttribute(arteryPos, 3));
  arteryGeo.setAttribute('color', new THREE.BufferAttribute(arteryCol, 3));
  arteryGeo.setDrawRange(0, 0);

  const arteryMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const arteryLines = new THREE.LineSegments(arteryGeo, arteryMat);
  arteryLines.frustumCulled = false;
  group.add(arteryLines);

  // 4 flowing energy pulses per joint artery (up to 192 luminous energy sprites!)
  const pulsesPerJoint = 4;
  const maxPulses = maxJoints * pulsesPerJoint;
  const pulsePos = new Float32Array(maxPulses * 3);
  const pulseCol = new Float32Array(maxPulses * 3);
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseCol, 3));
  pulseGeo.setDrawRange(0, 0);

  const pulseMat = new THREE.PointsMaterial({
    size: 0.085,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
  pulsePoints.frustumCulled = false;
  group.add(pulsePoints);

  const _invRoot = new THREE.Matrix4();
  const _relMat = new THREE.Matrix4();
  const _pParent = new THREE.Vector3();
  const _pChild = new THREE.Vector3();

  return {
    group,
    bindFutureGhostModel(sourceModelRoot: THREE.Object3D) {
      ghostGroup08.clear();
      ghostGroup16.clear();
      sourceModelRoot.updateMatrixWorld(true);
      _invRoot.copy(sourceModelRoot.matrixWorld).invert();

      let count = 0;
      sourceModelRoot.traverse((obj) => {
        if (count >= 42) return; // Lightweight skeletal silhouette cap for 60fps
        const m = obj as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        count++;

        _relMat.multiplyMatrices(_invRoot, m.matrixWorld);

        // Zero geometry duplication: shares exact BufferGeometry reference!
        const g08 = new THREE.Mesh(m.geometry, ghostMat08);
        g08.matrixAutoUpdate = false;
        g08.matrix.copy(_relMat);
        ghostGroup08.add(g08);

        const g16 = new THREE.Mesh(m.geometry, ghostMat16);
        g16.matrixAutoUpdate = false;
        g16.matrix.copy(_relMat);
        ghostGroup16.add(g16);
      });
    },
    updateMpcAndPower({ enabled, mpcResult, powerCoreWorld, jointNodes, simTime }) {
      group.visible = enabled;
      if (!enabled) {
        return { totalPowerWatts: 0 };
      }

      // 1. Update 11 Curved MPC Rollout Horizon Arcs + 0.8s & 1.6s Future Wireframe Ghosts
      if (mpcResult) {
        arcSegments.visible = true;
        let vCursor = 0;
        for (let a = 0; a < mpcResult.arcs.length && a < maxArcs; a++) {
          const arc = mpcResult.arcs[a];
          const [cr, cg, cb] = computeMpcCostColor(arc.costNorm, arc.isOptimal);
          const pts = arc.points;
          for (let s = 0; s < pts.length - 1 && s < stepsPerArc; s++) {
            const fade0 = 1.0 - (s / stepsPerArc) * 0.55;
            const fade1 = 1.0 - ((s + 1) / stepsPerArc) * 0.55;
            const boost = arc.isOptimal ? 1.25 : 0.72;

            const b = vCursor * 3;
            arcPos[b] = pts[s][0];
            arcPos[b + 1] = pts[s][1];
            arcPos[b + 2] = pts[s][2];
            arcCol[b] = Math.min(1, cr * fade0 * boost);
            arcCol[b + 1] = Math.min(1, cg * fade0 * boost);
            arcCol[b + 2] = Math.min(1, cb * fade0 * boost);

            arcPos[b + 3] = pts[s + 1][0];
            arcPos[b + 4] = pts[s + 1][1];
            arcPos[b + 5] = pts[s + 1][2];
            arcCol[b + 3] = Math.min(1, cr * fade1 * boost);
            arcCol[b + 4] = Math.min(1, cg * fade1 * boost);
            arcCol[b + 5] = Math.min(1, cb * fade1 * boost);

            vCursor += 2;
          }
        }
        arcGeo.setDrawRange(0, vCursor);
        arcGeo.attributes.position.needsUpdate = true;
        arcGeo.attributes.color.needsUpdate = true;

        const [pose08, pose16] = mpcResult.futurePoses;
        ghostGroup08.visible = true;
        ghostGroup16.visible = true;
        ghostGroup08.position.set(pose08.x, pose08.y, pose08.z);
        ghostGroup08.rotation.set(0, -pose08.yaw, pose08.pitch);
        ghostGroup16.position.set(pose16.x, pose16.y, pose16.z);
        ghostGroup16.rotation.set(0, -pose16.yaw, pose16.pitch);
      } else {
        arcSegments.visible = false;
        ghostGroup08.visible = false;
        ghostGroup16.visible = false;
      }

      // 2. Update URDF Kinematic Power-Flow Arteries (Power Core -> Parent -> Child Joint Chain)
      const count = Math.min(maxJoints, jointNodes.length);
      const metrics = computeUrdfPowerFlowMetrics(
        jointNodes.slice(0, count).map((j) => j.def),
        jointNodes.slice(0, count).map((j) => j.omegaRadS),
        jointNodes.slice(0, count).map((j) => j.torqueNm ?? 16.0)
      );

      let activeArteries = 0;
      let activePulses = 0;

      for (let i = 0; i < count; i++) {
        const jItem = jointNodes[i];
        const m = metrics.joints[i];
        jItem.node.getWorldPosition(_pChild);

        // Trace from parent joint/link if within model, otherwise from main battery/MMRTG power core!
        if (jItem.node.parent && jItem.node.parent.type !== 'Scene') {
          jItem.node.parent.getWorldPosition(_pParent);
          if (_pParent.distanceToSquared(_pChild) < 0.0004) {
            _pParent.copy(powerCoreWorld);
          }
        } else {
          _pParent.copy(powerCoreWorld);
        }

        const pwr = m.intensityNorm;
        // Idle artery = cool teal; High |tau * omega| surge = blazing cyan -> incandescent gold!
        const rCol = 0.08 + pwr * 0.92;
        const gCol = 0.72 + pwr * 0.26;
        const bCol = 0.98 - pwr * 0.58;

        const a6 = activeArteries * 6;
        arteryPos[a6] = _pParent.x;
        arteryPos[a6 + 1] = _pParent.y;
        arteryPos[a6 + 2] = _pParent.z;
        arteryPos[a6 + 3] = _pChild.x;
        arteryPos[a6 + 4] = _pChild.y;
        arteryPos[a6 + 5] = _pChild.z;

        arteryCol[a6] = rCol * 0.55;
        arteryCol[a6 + 1] = gCol * 0.55;
        arteryCol[a6 + 2] = bCol * 0.55;
        arteryCol[a6 + 3] = rCol;
        arteryCol[a6 + 4] = gCol;
        arteryCol[a6 + 5] = bCol;
        activeArteries++;

        // Dense streaming energy pulses proportional to |tau * omega|!
        const pulseQuota = pwr > 0.55 ? 4 : pwr > 0.2 ? 3 : 2;
        for (let p = 0; p < pulseQuota; p++) {
          const u = (simTime * m.pulseRateHz + p / pulseQuota + i * 0.13) % 1.0;
          const p3 = activePulses * 3;
          pulsePos[p3] = _pParent.x + (_pChild.x - _pParent.x) * u;
          pulsePos[p3 + 1] = _pParent.y + (_pChild.y - _pParent.y) * u;
          pulsePos[p3 + 2] = _pParent.z + (_pChild.z - _pParent.z) * u;

          const glow = 0.45 + pwr * 0.55;
          pulseCol[p3] = rCol * glow;
          pulseCol[p3 + 1] = gCol * glow;
          pulseCol[p3 + 2] = bCol * glow;
          activePulses++;
        }
      }

      arteryGeo.setDrawRange(0, activeArteries * 2);
      arteryGeo.attributes.position.needsUpdate = true;
      arteryGeo.attributes.color.needsUpdate = true;

      pulseGeo.setDrawRange(0, activePulses);
      pulseGeo.attributes.position.needsUpdate = true;
      pulseGeo.attributes.color.needsUpdate = true;

      return { totalPowerWatts: metrics.totalPowerWatts };
    },
    dispose() {
      glowTex.dispose();
      arcGeo.dispose();
      arcMat.dispose();
      ghostMat08.dispose();
      ghostMat16.dispose();
      arteryGeo.dispose();
      arteryMat.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
    }
  };
}

// ============================================================================
// 3. MODULE 3 SCENE FX: MACH-8 RE-ENTRY PLASMA SHEATH & FARADAY SURFACE LIGHTNING
// ============================================================================

export interface WindTunnelDisasterFXController {
  group: THREE.Group;
  /** Samples real surface vertices directly from the loaded .glb meshes so Faraday arcs dance on actual metal skin */
  bindRealGlbSurfaceVertices: (modelRoot: THREE.Object3D) => void;
  updateDisasterFX: (params: {
    config: WindTunnelDisasterConfig;
    anchorWorld: THREE.Vector3;
    headingYaw: number;
    modelScaleRadius: number;
    simTime: number;
  }) => void;
  dispose: () => void;
}

export function createWindTunnelDisasterFXController(): WindTunnelDisasterFXController {
  const group = new THREE.Group();
  group.name = 'wind_tunnel_mach8_plasma_and_faraday_lightning';

  const glowTex = createSoftGlowSpriteTexture();

  // --- A. Mach-8 Atmospheric Re-entry Ionized Plasma Bow-Shock Sheath ---
  const plasmaGroup = new THREE.Group();
  plasmaGroup.visible = false;
  group.add(plasmaGroup);

  const bowGeo = createParaboloidBowShockGeometry(2.85, 0.92, 22, 36);
  const bowMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 displaced = position;
        float flutter = sin(uv.x * 18.0 - uTime * 22.0 + uv.y * 12.566) * 0.032 * uv.x;
        displaced.y += flutter;
        displaced.z += cos(uv.x * 16.0 - uTime * 19.0 + uv.y * 12.566) * 0.032 * uv.x;
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float u = vUv.x; // 0 = stagnation nose cap, 1 = ionized plasma wake tail
        float rim = 0.35 + 0.65 * pow(1.0 - abs(dot(vNormal, vViewDir)), 1.6);
        float streak = 0.68 + 0.32 * sin(vUv.y * 37.699 + u * 14.0 - uTime * 26.0);

        // Stagnation Nose: Blazing White-Orange -> Mid Sheath: Hot Amber-Crimson -> Tail: Ionized Violet-Magenta!
        vec3 stagCol = vec3(1.0, 0.82, 0.42);
        vec3 midCol  = vec3(1.0, 0.34, 0.08);
        vec3 tailCol = vec3(0.72, 0.16, 0.98);
        vec3 col = u < 0.38
          ? mix(stagCol, midCol, u / 0.38)
          : mix(midCol, tailCol, (u - 0.38) / 0.62);

        float alpha = (1.0 - smoothstep(0.58, 1.0, u)) * rim * streak * 0.68;
        gl_FragColor = vec4(col * 1.45, alpha);
      }
    `
  });
  const bowMesh = new THREE.Mesh(bowGeo, bowMat);
  plasmaGroup.add(bowMesh);

  // Stripping Ablative Plasma Wake Embers (96 particles)
  const wakeCount = 96;
  const wakePos = new Float32Array(wakeCount * 3);
  const wakeCol = new Float32Array(wakeCount * 3);
  for (let i = 0; i < wakeCount; i++) {
    const isViolet = i % 3 === 0;
    wakeCol[i * 3] = isViolet ? 0.82 : 1.0;
    wakeCol[i * 3 + 1] = isViolet ? 0.28 : 0.48;
    wakeCol[i * 3 + 2] = isViolet ? 1.0 : 0.14;
  }
  const wakeGeo = new THREE.BufferGeometry();
  wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePos, 3));
  wakeGeo.setAttribute('color', new THREE.BufferAttribute(wakeCol, 3));
  const wakeMat = new THREE.PointsMaterial({
    size: 0.095,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const wakePoints = new THREE.Points(wakeGeo, wakeMat);
  wakePoints.frustumCulled = false;
  plasmaGroup.add(wakePoints);

  // --- B. Thunderstorm Faraday-Cage Surface Mesh Lightning Arcs ---
  const lightningGroup = new THREE.Group();
  lightningGroup.visible = false;
  group.add(lightningGroup);

  const numArcs = 14;
  const segsPerArc = 8;
  const arcPosBuf = new Float32Array(numArcs * segsPerArc * 2 * 3);
  const arcColBuf = new Float32Array(numArcs * segsPerArc * 2 * 3);
  const lightningGeo = new THREE.BufferGeometry();
  lightningGeo.setAttribute('position', new THREE.BufferAttribute(arcPosBuf, 3));
  lightningGeo.setAttribute('color', new THREE.BufferAttribute(arcColBuf, 3));

  const lightningMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const lightningSegments = new THREE.LineSegments(lightningGeo, lightningMat);
  lightningSegments.frustumCulled = false;
  lightningGroup.add(lightningSegments);

  // Sampled real GLB mesh vertices stored as { mesh, localPos } so arcs follow moving/exploding parts!
  let sampledSkinAnchors: { mesh: THREE.Mesh; localPos: THREE.Vector3 }[] = [];
  const _wStart = new THREE.Vector3();
  const _wEnd = new THREE.Vector3();

  return {
    group,
    bindRealGlbSurfaceVertices(modelRoot: THREE.Object3D) {
      sampledSkinAnchors = [];
      const meshes: THREE.Mesh[] = [];
      modelRoot.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh && m.geometry?.attributes?.position) {
          meshes.push(m);
        }
      });
      if (meshes.length === 0) return;

      // Uniformly sample up to 180 authentic surface vertices across the real .glb CAD sub-meshes
      const perMesh = Math.max(3, Math.ceil(180 / meshes.length));
      for (const m of meshes) {
        const posAttr = m.geometry.attributes.position;
        const count = posAttr.count;
        if (count === 0) continue;
        const step = Math.max(1, Math.floor(count / perMesh));
        for (let k = 0; k < count && sampledSkinAnchors.length < 220; k += step) {
          sampledSkinAnchors.push({
            mesh: m,
            localPos: new THREE.Vector3(posAttr.getX(k), posAttr.getY(k), posAttr.getZ(k))
          });
        }
      }
    },
    updateDisasterFX({ config, anchorWorld, headingYaw, modelScaleRadius, simTime }) {
      // 1. Mach-8 Ionized Plasma Sheath
      plasmaGroup.visible = config.mach8PlasmaSheath;
      if (config.mach8PlasmaSheath) {
        plasmaGroup.position.copy(anchorWorld);
        plasmaGroup.rotation.set(0, -headingYaw, 0);
        const s = Math.max(0.55, modelScaleRadius * 0.92);
        bowMesh.scale.set(s, s, s);
        bowMat.uniforms.uTime.value = simTime;

        for (let i = 0; i < wakeCount; i++) {
          const u = (simTime * 2.8 + i * 0.09) % 1.0;
          const ang = i * 2.399 + simTime * 4.0;
          const r = (0.28 + u * 0.95) * s;
          wakePos[i * 3] = (-0.55 + u * 2.9) * s;
          wakePos[i * 3 + 1] = Math.sin(ang) * r;
          wakePos[i * 3 + 2] = Math.cos(ang) * r;
        }
        wakeGeo.attributes.position.needsUpdate = true;
      }

      // 2. Faraday-Cage Surface Mesh Lightning Arcs across real .glb vertices
      const showLightning = config.faradayLightningArcs && sampledSkinAnchors.length >= 4;
      lightningGroup.visible = showLightning;
      if (showLightning) {
        const nAnchors = sampledSkinAnchors.length;
        // Re-jump dielectric breakdown paths at ~24Hz for realistic high-voltage surface crawling!
        const tickBucket = Math.floor(simTime * 24.0);
        let cursor = 0;

        for (let a = 0; a < numArcs; a++) {
          const idxA = (tickBucket * 17 + a * 31) % nAnchors;
          // Pick a nearby skin vertex within a few hops so arcs crawl organically over the fuselage/chassis
          const idxB = (idxA + 3 + ((tickBucket * 7 + a * 13) % Math.min(28, nAnchors - 1))) % nAnchors;

          const ancA = sampledSkinAnchors[idxA];
          const ancB = sampledSkinAnchors[idxB];
          _wStart.copy(ancA.localPos).applyMatrix4(ancA.mesh.matrixWorld);
          _wEnd.copy(ancB.localPos).applyMatrix4(ancB.mesh.matrixWorld);

          const pts = generateSurfaceLightningArcPoints(
            [_wStart.x, _wStart.y, _wStart.z],
            [_wEnd.x, _wEnd.y, _wEnd.z],
            [anchorWorld.x, anchorWorld.y, anchorWorld.z],
            tickBucket * 0.37 + a * 1.91,
            segsPerArc
          );

          const isCoreWhite = a % 2 === 0;
          for (let s = 0; s < pts.length - 1; s++) {
            const b = cursor * 3;
            arcPosBuf[b] = pts[s][0];
            arcPosBuf[b + 1] = pts[s][1];
            arcPosBuf[b + 2] = pts[s][2];

            arcPosBuf[b + 3] = pts[s + 1][0];
            arcPosBuf[b + 4] = pts[s + 1][1];
            arcPosBuf[b + 5] = pts[s + 1][2];

            const cr = isCoreWhite ? 0.78 : 0.25;
            const cg = isCoreWhite ? 0.94 : 0.72;
            const cb = 1.0;
            arcColBuf[b] = cr;
            arcColBuf[b + 1] = cg;
            arcColBuf[b + 2] = cb;
            arcColBuf[b + 3] = cr;
            arcColBuf[b + 4] = cg;
            arcColBuf[b + 5] = cb;
            cursor += 2;
          }
        }
        lightningGeo.setDrawRange(0, cursor);
        lightningGeo.attributes.position.needsUpdate = true;
        lightningGeo.attributes.color.needsUpdate = true;
      }
    },
    dispose() {
      glowTex.dispose();
      bowGeo.dispose();
      bowMat.dispose();
      wakeGeo.dispose();
      wakeMat.dispose();
      lightningGeo.dispose();
      lightningMat.dispose();
    }
  };
}
