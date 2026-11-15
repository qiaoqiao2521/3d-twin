import * as THREE from 'three';
import { InteractiveFieldTarget, UltimateSkillState } from './signatureShowcaseEngine';

// ============================================================================
// SIGNATURE SHOWCASE & INTERACTIVE TACTICAL ARENA 3D VFX CONTROLLER
// Strictly sculpted with ExtrudeGeometry (beveled hex plinths), LatheGeometry
// (faceted reactor cores & volumetric domes), TubeGeometry (gimbal rings &
// converging plasma beams), and custom GLSL ShaderMaterials!
// ============================================================================

export interface SignatureShowcaseSceneFXController {
  rootGroup: THREE.Group;
  targetHitProxies: THREE.Mesh[];
  updateHangarShowcase: (params: {
    skill: UltimateSkillState;
    anchorWorld: THREE.Vector3;
    floorY: number;
    modelRadius: number;
    accentHex: number;
    simTime: number;
  }) => void;
  updateSandboxInteractiveFX: (params: {
    skill: UltimateSkillState;
    actorWorld: THREE.Vector3;
    actorGroundY: number;
    modelRadius: number;
    accentHex: number;
    targets: InteractiveFieldTarget[];
    lockedTargetId: string | null;
    rallyPoint: { active: boolean; x: number; y: number; z: number } | null;
    simTime: number;
  }) => void;
  dispose: () => void;
}

function createHexPlinthGeometry(radius: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: radius * 0.08,
    bevelThickness: depth * 0.16
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createClosedRingTubeGeometry(ringRadius: number, tubeRadius: number): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = [];
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * ringRadius, 0, Math.sin(a) * ringRadius));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.TubeGeometry(curve, 48, tubeRadius, 8, true);
}

function createFacetedCrystalLatheGeometry(radius: number, halfHeight: number): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.001, -halfHeight),
    new THREE.Vector2(radius * 0.68, -halfHeight * 0.45),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius * 0.68, halfHeight * 0.45),
    new THREE.Vector2(0.001, halfHeight)
  ];
  return new THREE.LatheGeometry(profile, 8);
}

function createHemisphereDomeLatheGeometry(radius: number): THREE.LatheGeometry {
  const profile: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * (Math.PI * 0.5);
    profile.push(new THREE.Vector2(Math.max(0.002, Math.cos(theta) * radius), Math.sin(theta) * radius));
  }
  return new THREE.LatheGeometry(profile, 40);
}

function createTaperedColumnLatheGeometry(rBottom: number, rTop: number, height: number): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(Math.max(0.002, rBottom), 0),
    new THREE.Vector2(Math.max(0.002, (rBottom + rTop) * 0.5), height * 0.5),
    new THREE.Vector2(Math.max(0.002, rTop), height)
  ];
  return new THREE.LatheGeometry(profile, 18);
}

interface TargetVisualRig {
  group: THREE.Group;
  plinthMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  outerGimbal: THREE.Mesh;
  innerGimbal: THREE.Mesh;
  shieldDome: THREE.Mesh;
  shieldMat: THREE.ShaderMaterial;
  coreMat: THREE.MeshStandardMaterial;
  lockReticle: THREE.Mesh;
  hitProxy: THREE.Mesh;
  shards: THREE.Mesh[];
}

export function createSignatureShowcaseSceneFXController(
  maxTargets = 4
): SignatureShowcaseSceneFXController {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'SignatureShowcaseSceneFX';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  // ==========================================================================
  // 1. 360° ENGINEERING BLUEPRINT AZIMUTH GROUND DIAL + VOLUMETRIC DOME
  // ==========================================================================
  const dialGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  dialGeo.rotateX(-Math.PI / 2);
  geometriesToDispose.push(dialGeo);

  const dialMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAccent: { value: new THREE.Color(0x00e5ff) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uAccent;
      varying vec2 vUv;

      void main() {
        float r = length(vUv);
        if (r > 1.0 || uOpacity <= 0.002) discard;

        float ang = atan(vUv.y, vUv.x);
        float rotA = ang + uTime * 0.85;
        float rotB = ang - uTime * 1.35;

        // Precision CAD degree ticks + concentric range rings + radar sweep
        float outerRing = smoothstep(0.018, 0.002, abs(r - 0.94));
        float midRing = smoothstep(0.014, 0.002, abs(r - 0.66)) * step(0.1, sin(rotB * 12.0));
        float innerRing = smoothstep(0.014, 0.002, abs(r - 0.36));

        float majorTicks = smoothstep(0.96, 0.995, cos(rotA * 24.0)) * smoothstep(0.09, 0.01, abs(r - 0.88));
        float minorTicks = smoothstep(0.92, 0.99, cos(ang * 72.0)) * smoothstep(0.04, 0.005, abs(r - 0.94)) * 0.55;
        float crosshairs = (smoothstep(0.008, 0.001, abs(vUv.x)) + smoothstep(0.008, 0.001, abs(vUv.y))) * step(0.32, r) * step(r, 0.95) * 0.45;

        float sweepWave = fract(r * 1.8 - uTime * 1.4);
        float pulseRing = smoothstep(0.12, 0.0, abs(sweepWave - 0.5)) * (1.0 - r) * 0.55;

        float intensity = outerRing * 1.15 + midRing * 0.85 + innerRing * 0.9 + majorTicks * 1.1 + minorTicks + crosshairs + pulseRing;
        vec3 col = mix(uAccent, vec3(0.95, 0.99, 1.0), clamp(outerRing + majorTicks * 0.6, 0.0, 1.0));
        float alpha = clamp(intensity * uOpacity, 0.0, 0.92);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
  materialsToDispose.push(dialMat);

  const azimuthDialMesh = new THREE.Mesh(dialGeo, dialMat);
  azimuthDialMesh.visible = false;
  azimuthDialMesh.renderOrder = 6;
  rootGroup.add(azimuthDialMesh);

  // Volumetric Shockwave Hemisphere Dome
  const domeGeo = createHemisphereDomeLatheGeometry(1.0);
  geometriesToDispose.push(domeGeo);
  const domeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uAccent: { value: new THREE.Color(0x00e5ff) }
    },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform vec3 uAccent;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying float vLocalY;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormalW))), 2.4);
        float baseSkirt = smoothstep(0.35, 0.0, vLocalY) * 0.65;
        float fade = sin(clamp(uProgress, 0.0, 1.0) * 3.14159265);
        float hexBand = 0.65 + 0.35 * sin(vLocalY * 36.0 - uProgress * 18.0);
        float alpha = (fresnel * 0.85 + baseSkirt * 0.45) * hexBand * fade * 0.68;
        if (alpha < 0.008) discard;
        vec3 col = mix(uAccent, vec3(1.0, 0.96, 0.88), fresnel * 0.45);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
  materialsToDispose.push(domeMat);

  const shockDomeMesh = new THREE.Mesh(domeGeo, domeMat);
  shockDomeMesh.visible = false;
  shockDomeMesh.renderOrder = 8;
  rootGroup.add(shockDomeMesh);

  // ==========================================================================
  // 2. CONVERGING ULTIMATE ENERGY BEAMS (UP TO 4 TARGET STREAMS)
  // ==========================================================================
  const beamCoreGeo = createTaperedColumnLatheGeometry(0.055, 0.035, 1.0);
  beamCoreGeo.rotateX(Math.PI / 2); // oriented along +Z from 0..1
  geometriesToDispose.push(beamCoreGeo);

  const beamHaloGeo = createTaperedColumnLatheGeometry(0.16, 0.11, 1.0);
  beamHaloGeo.rotateX(Math.PI / 2);
  geometriesToDispose.push(beamHaloGeo);

  const beamCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beamHaloMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  materialsToDispose.push(beamCoreMat, beamHaloMat);

  const beamRigs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.visible = false;
    const cMesh = new THREE.Mesh(beamCoreGeo, beamCoreMat);
    const hMesh = new THREE.Mesh(beamHaloGeo, beamHaloMat);
    g.add(cMesh, hMesh);
    rootGroup.add(g);
    beamRigs.push(g);
  }

  // ==========================================================================
  // 3. COMPOSITE 6-PART INTERACTIVE 3D TACTICAL FIELD TARGETS
  // ==========================================================================
  const sharedPlinthGeo = createHexPlinthGeometry(1.05, 0.24);
  const sharedPillarGeo = createTaperedColumnLatheGeometry(0.42, 0.26, 0.95);
  const sharedCoreGeo = createFacetedCrystalLatheGeometry(0.42, 0.62);
  const sharedOuterGimbalGeo = createClosedRingTubeGeometry(0.82, 0.038);
  const sharedInnerGimbalGeo = createClosedRingTubeGeometry(0.62, 0.028);
  const sharedShieldGeo = createFacetedCrystalLatheGeometry(1.22, 1.38);
  const sharedProxyGeo = createFacetedCrystalLatheGeometry(1.65, 1.85);
  const sharedReticleGeo = createClosedRingTubeGeometry(1.18, 0.035);
  const sharedShardGeo = createFacetedCrystalLatheGeometry(0.16, 0.24);

  geometriesToDispose.push(
    sharedPlinthGeo,
    sharedPillarGeo,
    sharedCoreGeo,
    sharedOuterGimbalGeo,
    sharedInnerGimbalGeo,
    sharedShieldGeo,
    sharedProxyGeo,
    sharedReticleGeo,
    sharedShardGeo
  );

  const sharedPlinthMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.36
  });
  const sharedGimbalMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.18
  });
  const sharedProxyMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const sharedReticleMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  materialsToDispose.push(sharedPlinthMat, sharedGimbalMat, sharedProxyMat, sharedReticleMat);

  const targetRigs: TargetVisualRig[] = [];
  const targetHitProxies: THREE.Mesh[] = [];

  for (let i = 0; i < maxTargets; i++) {
    const group = new THREE.Group();
    group.visible = false;

    const plinthMesh = new THREE.Mesh(sharedPlinthGeo, sharedPlinthMat);
    plinthMesh.position.y = 0.02;
    const pillarMesh = new THREE.Mesh(sharedPillarGeo, sharedPlinthMat);
    pillarMesh.position.y = 0.22;
    group.add(plinthMesh, pillarMesh);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.35,
      metalness: 0.35,
      roughness: 0.14
    });
    materialsToDispose.push(coreMat);

    const coreMesh = new THREE.Mesh(sharedCoreGeo, coreMat);
    coreMesh.position.y = 1.48;
    group.add(coreMesh);

    const outerGimbal = new THREE.Mesh(sharedOuterGimbalGeo, sharedGimbalMat);
    outerGimbal.position.y = 1.48;
    outerGimbal.rotation.z = Math.PI * 0.25;
    const innerGimbal = new THREE.Mesh(sharedInnerGimbalGeo, sharedGimbalMat);
    innerGimbal.position.y = 1.48;
    innerGimbal.rotation.x = Math.PI * 0.32;
    group.add(outerGimbal, innerGimbal);

    const shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uShieldRatio: { value: 1.0 },
        uHitFlash: { value: 0.0 },
        uColor: { value: new THREE.Color(0x00e5ff) }
      },
      vertexShader: `
        varying vec3 vNorm;
        varying vec3 vWorld;
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNorm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uShieldRatio;
        uniform float uHitFlash;
        uniform vec3 uColor;
        varying vec3 vNorm;
        varying vec3 vWorld;
        varying vec3 vLocal;

        void main() {
          if (uShieldRatio <= 0.01 && uHitFlash <= 0.01) discard;
          vec3 V = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - abs(dot(V, normalize(vNorm))), 2.1);
          float lattice = smoothstep(0.75, 0.98, abs(sin(vLocal.y * 14.0 - uTime * 3.2) * cos(atan(vLocal.z, vLocal.x) * 8.0)));
          float flashBoost = uHitFlash * (0.65 + 0.35 * sin(vLocal.y * 28.0));
          float alpha = (fresnel * 0.42 + lattice * 0.22) * uShieldRatio + flashBoost * 0.65;
          if (alpha < 0.01) discard;
          vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), clamp(uHitFlash * 0.85, 0.0, 1.0));
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
        }
      `
    });
    materialsToDispose.push(shieldMat);

    const shieldDome = new THREE.Mesh(sharedShieldGeo, shieldMat);
    shieldDome.position.y = 1.45;
    shieldDome.renderOrder = 7;
    group.add(shieldDome);

    const lockReticle = new THREE.Mesh(sharedReticleGeo, sharedReticleMat);
    lockReticle.position.y = 2.55;
    lockReticle.visible = false;
    group.add(lockReticle);

    const hitProxy = new THREE.Mesh(sharedProxyGeo, sharedProxyMat);
    hitProxy.position.y = 1.45;
    hitProxy.userData.interactiveTargetIndex = i;
    group.add(hitProxy);
    targetHitProxies.push(hitProxy);

    const shards: THREE.Mesh[] = [];
    for (let s = 0; s < 8; s++) {
      const shard = new THREE.Mesh(sharedShardGeo, coreMat);
      shard.visible = false;
      group.add(shard);
      shards.push(shard);
    }

    rootGroup.add(group);
    targetRigs.push({
      group,
      plinthMesh,
      coreMesh,
      outerGimbal,
      innerGimbal,
      shieldDome,
      shieldMat,
      coreMat,
      lockReticle,
      hitProxy,
      shards
    });
  }

  // ==========================================================================
  // 4. INTERACTIVE CLICK-TO-COMMAND GROUND RALLY BEACON
  // ==========================================================================
  const rallyGroup = new THREE.Group();
  rallyGroup.visible = false;
  const rallyRingGeo = createClosedRingTubeGeometry(0.85, 0.032);
  const rallyPillarGeo = createTaperedColumnLatheGeometry(0.14, 0.02, 3.2);
  geometriesToDispose.push(rallyRingGeo, rallyPillarGeo);

  const rallyMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const rallyBeamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  materialsToDispose.push(rallyMat, rallyBeamMat);

  const rallyRingMesh = new THREE.Mesh(rallyRingGeo, rallyMat);
  rallyRingMesh.position.y = 0.06;
  const rallyBeamMesh = new THREE.Mesh(rallyPillarGeo, rallyBeamMat);
  rallyBeamMesh.position.y = 0.05;
  rallyGroup.add(rallyRingMesh, rallyBeamMesh);
  rootGroup.add(rallyGroup);

  const _tmpTargetPos = new THREE.Vector3();
  const _tmpOriginPos = new THREE.Vector3();

  return {
    rootGroup,
    targetHitProxies,

    updateHangarShowcase({ skill, anchorWorld, floorY, modelRadius, accentHex, simTime }) {
      for (const tr of targetRigs) tr.group.visible = false;
      rallyGroup.visible = false;

      if (!skill.active) {
        azimuthDialMesh.visible = false;
        shockDomeMesh.visible = false;
        for (const b of beamRigs) b.visible = false;
        return;
      }

      dialMat.uniforms.uTime.value = simTime;
      dialMat.uniforms.uOpacity.value = skill.azDialRadiusScale * 0.88;
      dialMat.uniforms.uAccent.value.setHex(accentHex);
      azimuthDialMesh.visible = skill.azDialRadiusScale > 0.02;
      const dialDiam = Math.max(2.6, modelRadius * 3.1) * (0.45 + 0.55 * skill.azDialRadiusScale);
      azimuthDialMesh.position.set(anchorWorld.x, floorY + 0.022, anchorWorld.z);
      azimuthDialMesh.scale.set(dialDiam, 1, dialDiam);

      if (skill.domePulse01 > 0.005) {
        shockDomeMesh.visible = true;
        domeMat.uniforms.uProgress.value = skill.domePulse01;
        domeMat.uniforms.uAccent.value.setHex(accentHex);
        const domeRad = modelRadius * (0.65 + skill.domePulse01 * 2.45);
        shockDomeMesh.position.set(anchorWorld.x, floorY + 0.02, anchorWorld.z);
        shockDomeMesh.scale.setScalar(domeRad);
      } else {
        shockDomeMesh.visible = false;
      }

      // 4 Symmetrical Orbital Calibration Beams in Hangar during Phase III
      beamHaloMat.color.setHex(accentHex);
      if (skill.beamConvergence01 > 0.02) {
        _tmpOriginPos.set(anchorWorld.x, anchorWorld.y + modelRadius * 0.25, anchorWorld.z);
        beamCoreMat.opacity = skill.beamConvergence01 * 0.92;
        beamHaloMat.opacity = skill.beamConvergence01 * 0.42;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + simTime * 0.95;
          const outR = dialDiam * 0.46;
          _tmpTargetPos.set(
            anchorWorld.x + Math.cos(ang) * outR,
            floorY + 0.04,
            anchorWorld.z + Math.sin(ang) * outR
          );
          const dist = _tmpOriginPos.distanceTo(_tmpTargetPos);
          const rig = beamRigs[i];
          rig.visible = true;
          rig.position.copy(_tmpOriginPos);
          rig.lookAt(_tmpTargetPos);
          rig.scale.set(0.55, 0.55, Math.max(0.1, dist));
        }
      } else {
        for (const b of beamRigs) b.visible = false;
      }
    },

    updateSandboxInteractiveFX({
      skill,
      actorWorld,
      actorGroundY,
      modelRadius,
      accentHex,
      targets,
      lockedTargetId,
      rallyPoint,
      simTime
    }) {
      // 1. Update Interactive 3D Field Targets
      for (let i = 0; i < targetRigs.length; i++) {
        const rig = targetRigs[i];
        const t = targets[i];
        if (!t) {
          rig.group.visible = false;
          continue;
        }
        rig.group.visible = true;
        rig.group.position.set(t.x, t.y, t.z);
        rig.hitProxy.userData.interactiveTargetId = t.id;

        if (t.alive) {
          rig.coreMesh.visible = true;
          rig.outerGimbal.visible = true;
          rig.innerGimbal.visible = true;
          rig.shieldDome.visible = true;
          for (const sh of rig.shards) sh.visible = false;

          rig.coreMesh.rotation.y = simTime * 1.9 + i;
          rig.outerGimbal.rotation.y = simTime * 1.35 + i * 0.7;
          rig.innerGimbal.rotation.z = -simTime * 2.1 + i;

          const hpRatio = t.hp / Math.max(1, t.maxHp);
          rig.coreMat.color.setHex(t.hitFlash01 > 0.2 ? 0xffffff : t.accentHex);
          rig.coreMat.emissive.setHex(t.hitFlash01 > 0.2 ? 0xfef08a : t.accentHex);
          rig.coreMat.emissiveIntensity = 1.1 + (1 - hpRatio) * 1.2 + t.hitFlash01 * 2.4;

          rig.shieldMat.uniforms.uTime.value = simTime;
          rig.shieldMat.uniforms.uShieldRatio.value = t.shield / Math.max(1, t.maxShield);
          rig.shieldMat.uniforms.uHitFlash.value = t.hitFlash01;
          rig.shieldMat.uniforms.uColor.value.setHex(t.accentHex);

          const isLocked = lockedTargetId === t.id;
          rig.lockReticle.visible = isLocked;
          if (isLocked) {
            rig.lockReticle.rotation.y = -simTime * 2.6;
            const pulse = 1.0 + 0.08 * Math.sin(simTime * 8.0);
            rig.lockReticle.scale.set(pulse, 1, pulse);
          }
        } else {
          // Outward kinematic shatter burst on KO!
          rig.coreMesh.visible = false;
          rig.outerGimbal.visible = false;
          rig.innerGimbal.visible = false;
          rig.shieldDome.visible = false;
          rig.lockReticle.visible = false;

          const sp = t.shatterProgress01;
          const fadeScale = Math.max(0.01, 1 - sp);
          for (let s = 0; s < rig.shards.length; s++) {
            const sh = rig.shards[s];
            sh.visible = sp < 0.98;
            const ang = (s / rig.shards.length) * Math.PI * 2 + i;
            const rad = sp * 2.8;
            const lift = 1.45 + Math.sin(sp * Math.PI) * 1.3 - sp * sp * 1.4;
            sh.position.set(Math.cos(ang) * rad, Math.max(0.15, lift), Math.sin(ang) * rad);
            sh.rotation.set(sp * 9 + s, sp * 7, s);
            sh.scale.setScalar(fadeScale);
          }
        }
      }

      // 2. Rally Waypoint Beacon
      if (rallyPoint && rallyPoint.active) {
        rallyGroup.visible = true;
        rallyGroup.position.set(rallyPoint.x, rallyPoint.y, rallyPoint.z);
        const rScale = 0.85 + 0.18 * Math.sin(simTime * 5.5);
        rallyRingMesh.scale.set(rScale, 1, rScale);
        rallyRingMesh.rotation.y = simTime * 1.8;
      } else {
        rallyGroup.visible = false;
      }

      // 3. Ultimate Skill Azimuth Ground Dial + Plasma Dome + Multi-Target Converging Beams!
      if (!skill.active) {
        azimuthDialMesh.visible = false;
        shockDomeMesh.visible = false;
        for (const b of beamRigs) b.visible = false;
        return;
      }

      dialMat.uniforms.uTime.value = simTime;
      dialMat.uniforms.uOpacity.value = skill.azDialRadiusScale * 0.9;
      dialMat.uniforms.uAccent.value.setHex(accentHex);
      azimuthDialMesh.visible = skill.azDialRadiusScale > 0.02;
      const dialDiam = Math.max(5.5, modelRadius * 5.2) * (0.4 + 0.6 * skill.azDialRadiusScale);
      azimuthDialMesh.position.set(actorWorld.x, actorGroundY + 0.06, actorWorld.z);
      azimuthDialMesh.scale.set(dialDiam, 1, dialDiam);

      if (skill.domePulse01 > 0.005) {
        shockDomeMesh.visible = true;
        domeMat.uniforms.uProgress.value = skill.domePulse01;
        domeMat.uniforms.uAccent.value.setHex(accentHex);
        const domeRad = 1.6 + skill.domePulse01 * 16.5;
        shockDomeMesh.position.set(actorWorld.x, actorGroundY + 0.05, actorWorld.z);
        shockDomeMesh.scale.setScalar(domeRad);
      } else {
        shockDomeMesh.visible = false;
      }

      beamHaloMat.color.setHex(accentHex);
      if (skill.beamConvergence01 > 0.02) {
        _tmpOriginPos.set(actorWorld.x, actorWorld.y + modelRadius * 0.55, actorWorld.z);
        beamCoreMat.opacity = skill.beamConvergence01 * 0.95;
        beamHaloMat.opacity = skill.beamConvergence01 * 0.45;
        const aliveTargets = targets.filter((t) => t.alive);
        for (let i = 0; i < beamRigs.length; i++) {
          const rig = beamRigs[i];
          const tgt = aliveTargets[i];
          if (tgt) {
            _tmpTargetPos.set(tgt.x, tgt.y + 1.45, tgt.z);
          } else {
            const ang = (i / 4) * Math.PI * 2 + simTime * 1.2;
            _tmpTargetPos.set(
              actorWorld.x + Math.cos(ang) * 9.5,
              actorGroundY + 0.25,
              actorWorld.z + Math.sin(ang) * 9.5
            );
          }
          const dist = _tmpOriginPos.distanceTo(_tmpTargetPos);
          rig.visible = dist < 48;
          if (rig.visible) {
            rig.position.copy(_tmpOriginPos);
            rig.lookAt(_tmpTargetPos);
            rig.scale.set(1.0, 1.0, Math.max(0.2, dist));
          }
        }
      } else {
        for (const b of beamRigs) b.visible = false;
      }
    },

    dispose() {
      for (const g of geometriesToDispose) g.dispose();
      for (const m of materialsToDispose) m.dispose();
    }
  };
}
