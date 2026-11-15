import * as THREE from 'three';

export interface SciFiVfxConfig {
  /** Manual Nanite dissolve / digital reconstruction mode */
  naniteDissolveEnabled: boolean;
  /** Manual dissolve progress [0.0 = solid PBR .. 1.0 = full hex-nanite lattice] */
  naniteProgress: number;
  /** Automatically run a 0.65s holographic Nanite materialization sweep on robot switch */
  autoSpawnMaterialize: boolean;
  /** Conformal Fresnel hexagonal energy shield + 3D raycast hit ripples */
  hexShieldEnabled: boolean;
  /** Overdrive joint seam cold-gas venting & Sandevistan chromatic afterimage ghosts */
  overdriveVentingEnabled: boolean;
}

export function createDefaultSciFiVfxConfig(): SciFiVfxConfig {
  return {
    naniteDissolveEnabled: false,
    naniteProgress: 0.0,
    autoSpawnMaterialize: true,
    hexShieldEnabled: false,
    overdriveVentingEnabled: false
  };
}

export interface NaniteMaterializeState {
  mode: 'idle' | 'spawn_in' | 'demo_cycle';
  elapsedSec: number;
  durationSec: number;
}

export function createInitialNaniteState(): NaniteMaterializeState {
  return {
    mode: 'idle',
    elapsedSec: 0,
    durationSec: 0.65
  };
}

export function triggerNaniteSpawnSweep(durationSec: number = 0.65): NaniteMaterializeState {
  return {
    mode: 'spawn_in',
    elapsedSec: 0,
    durationSec: Math.max(0.25, durationSec)
  };
}

export function triggerNaniteDemoCycle(durationSec: number = 2.4): NaniteMaterializeState {
  return {
    mode: 'demo_cycle',
    elapsedSec: 0,
    durationSec: Math.max(0.8, durationSec)
  };
}

export interface NaniteShaderFrame {
  nextState: NaniteMaterializeState;
  active: boolean;
  sweepWorldY: number;
  dissolveAmount01: number;
}

/**
 * Advances automatic 0.65s spawn materialization or manual/demo Nanite dissolve state.
 */
export function stepNaniteState(
  prev: NaniteMaterializeState,
  dtSec: number,
  minY: number,
  maxY: number,
  manualEnabled: boolean,
  manualProgress01: number
): NaniteShaderFrame {
  const spanY = Math.max(0.35, maxY - minY);
  const clampedDt = Math.max(0, Math.min(0.08, dtSec));

  if (prev.mode !== 'idle') {
    const elapsed = prev.elapsedSec + clampedDt;
    if (elapsed >= prev.durationSec) {
      return {
        nextState: { mode: 'idle', elapsedSec: 0, durationSec: prev.durationSec },
        active: manualEnabled && manualProgress01 > 0.005,
        sweepWorldY: maxY + 0.25,
        dissolveAmount01: manualEnabled ? Math.max(0, Math.min(1, manualProgress01)) : 0
      };
    }

    const u = Math.max(0, Math.min(1, elapsed / prev.durationSec));
    if (prev.mode === 'spawn_in') {
      // Smooth cubic ease-out sweep from bottom-to-top over 0.65s
      const eased = 1 - Math.pow(1 - u, 2.4);
      const sweepY = minY - 0.08 + eased * (spanY + 0.24);
      return {
        nextState: { ...prev, elapsedSec: elapsed },
        active: true,
        sweepWorldY: sweepY,
        dissolveAmount01: Math.max(0, 1 - eased)
      };
    }

    // Demo cycle: dissolve down then reconstruct back up cleanly
    const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
    const smoothTri = tri * tri * (3 - 2 * tri);
    const sweepY = maxY + 0.12 - smoothTri * (spanY + 0.24);
    return {
      nextState: { ...prev, elapsedSec: elapsed },
      active: true,
      sweepWorldY: sweepY,
      dissolveAmount01: smoothTri
    };
  }

  if (manualEnabled && manualProgress01 > 0.005) {
    const p = Math.max(0, Math.min(1, manualProgress01));
    const sweepY = maxY + 0.12 - p * (spanY + 0.24);
    return {
      nextState: prev,
      active: true,
      sweepWorldY: sweepY,
      dissolveAmount01: p
    };
  }

  return {
    nextState: prev,
    active: false,
    sweepWorldY: maxY + 99,
    dissolveAmount01: 0
  };
}

export interface TacticalPulseWaveState {
  active: boolean;
  elapsedSec: number;
  durationSec: number;
  originXZ: [number, number];
  radiusMeters: number;
  intensity01: number;
}

export function createInitialTacticalPulseState(): TacticalPulseWaveState {
  return {
    active: false,
    elapsedSec: 0,
    durationSec: 1.75,
    originXZ: [0, 0],
    radiusMeters: 0,
    intensity01: 0
  };
}

export function triggerTacticalPulseWave(
  originXZ: [number, number] = [0, 0],
  durationSec: number = 1.75
): TacticalPulseWaveState {
  return {
    active: true,
    elapsedSec: 0,
    durationSec: Math.max(0.6, durationSec),
    originXZ: [originXZ[0], originXZ[1]],
    radiusMeters: 0.15,
    intensity01: 1.0
  };
}

export function stepTacticalPulseWave(
  prev: TacticalPulseWaveState,
  dtSec: number,
  maxRadiusMeters: number = 14.0
): TacticalPulseWaveState {
  if (!prev.active) return prev;
  const elapsed = prev.elapsedSec + Math.max(0, Math.min(0.08, dtSec));
  if (elapsed >= prev.durationSec) {
    return {
      ...prev,
      active: false,
      elapsedSec: 0,
      radiusMeters: 0,
      intensity01: 0
    };
  }
  const u = elapsed / prev.durationSec;
  const eased = 1 - Math.pow(1 - u, 2.1);
  const fade = u < 0.2 ? u / 0.2 : Math.pow(Math.max(0, 1 - (u - 0.2) / 0.8), 1.45);
  return {
    ...prev,
    elapsedSec: elapsed,
    radiusMeters: 0.18 + eased * maxRadiusMeters,
    intensity01: Math.max(0, Math.min(1, fade))
  };
}

export interface SciFiHangarVfxController {
  group: THREE.Group;
  shieldMesh: THREE.Mesh;
  triggerShieldHit: (hitWorldPos: THREE.Vector3) => void;
  update: (params: {
    config: SciFiVfxConfig;
    naniteFrame: NaniteShaderFrame;
    pulseState: TacticalPulseWaveState;
    robotBounds: THREE.Box3 | null;
    floorY: number;
    simTime: number;
    dt: number;
    loadFactor: number;
    hidden: boolean;
  }) => void;
  dispose: () => void;
}

/**
 * Builds the 3D Hard-Surface Sci-Fi VFX assembly for Hangar & Workstation views:
 * 1) Conformal Fresnel Hexagonal Energy Shield with 4-slot 3D Raycast Hit Ripple Waves
 * 2) Tactical Topographic Pulse Ring + Subsurface Floor Conduit & Contour Grid Reveal
 * 3) Overdrive Cold-Gas Seam Venting Plumes + Rising Nanite Materialization Embers + Sandevistan Ghosts
 */
export function createSciFiHangarVfxController(): SciFiHangarVfxController {
  const group = new THREE.Group();
  group.name = 'scifi_hard_surface_vfx_group';

  // --------------------------------------------------------------------------
  // 1. Conformal Fresnel Hexagonal Energy Shield + 4-Slot 3D Impact Ripples
  // --------------------------------------------------------------------------
  const shieldGeo = new THREE.IcosahedronGeometry(1.0, 3);
  const hitCenters = [
    new THREE.Vector3(0, 999, 0),
    new THREE.Vector3(0, 999, 0),
    new THREE.Vector3(0, 999, 0),
    new THREE.Vector3(0, 999, 0)
  ];
  const hitAges = [99, 99, 99, 99];
  let hitSlotCursor = 0;

  const shieldMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHit0: { value: hitCenters[0] },
      uHit1: { value: hitCenters[1] },
      uHit2: { value: hitCenters[2] },
      uHit3: { value: hitCenters[3] },
      uHitAges: { value: new THREE.Vector4(99, 99, 99, 99) }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNorm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHit0;
      uniform vec3 uHit1;
      uniform vec3 uHit2;
      uniform vec3 uHit3;
      uniform vec4 uHitAges;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;
      varying vec3 vLocalPos;

      // Procedural 2D hexagonal grid edge distance
      float hexEdgeMask(vec2 p) {
        p *= 9.5;
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
        vec2 nearest = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
        nearest = abs(nearest);
        float d = max(dot(nearest, s * 0.5), nearest.x);
        return smoothstep(0.41, 0.495, d);
      }

      float evalHitRipple(vec3 hitPos, float age) {
        if (age > 1.15) return 0.0;
        float dist = distance(vWorldPos, hitPos);
        float waveRadius = age * 1.45;
        float ring = 1.0 - smoothstep(0.0, 0.13, abs(dist - waveRadius));
        float core = (1.0 - smoothstep(0.0, 0.24, dist)) * (1.0 - smoothstep(0.0, 0.35, age));
        float fade = 1.0 - age / 1.15;
        return (ring * 1.35 + core * 1.55) * fade;
      }

      void main() {
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 N = normalize(vWorldNorm);
        float fresnel = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.6);

        // Tri-planar hex lattice projection for zero-distortion conformal hex cells
        vec3 blendW = abs(normalize(vLocalPos));
        blendW /= max(0.001, blendW.x + blendW.y + blendW.z);
        float hexXY = hexEdgeMask(vLocalPos.xy);
        float hexYZ = hexEdgeMask(vLocalPos.yz);
        float hexXZ = hexEdgeMask(vLocalPos.xz);
        float hexLattice = hexXY * blendW.z + hexYZ * blendW.x + hexXZ * blendW.y;

        float scanBand = 0.5 + 0.5 * sin(vLocalPos.y * 12.0 - uTime * 3.2);
        float ripple =
          evalHitRipple(uHit0, uHitAges.x) +
          evalHitRipple(uHit1, uHitAges.y) +
          evalHitRipple(uHit2, uHitAges.z) +
          evalHitRipple(uHit3, uHitAges.w);

        vec3 baseCyan = vec3(0.04, 0.86, 1.0);
        vec3 hitAmber = vec3(1.0, 0.68, 0.18);
        vec3 col = mix(baseCyan, hitAmber, clamp(ripple * 0.55, 0.0, 0.85));

        float alpha =
          fresnel * (0.06 + hexLattice * 0.52 + scanBand * 0.04) +
          hexLattice * 0.03 +
          ripple * (0.34 + hexLattice * 0.78);
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(col * (0.92 + ripple * 1.35), clamp(alpha, 0.0, 0.92));
      }
    `
  });

  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.visible = false;
  shieldMesh.renderOrder = 8;
  group.add(shieldMesh);

  // --------------------------------------------------------------------------
  // 2. Tactical Topographic Pulse Wave + Subsurface Floor Conduit Reveal
  // --------------------------------------------------------------------------
  const pulsePlaneGeo = new THREE.PlaneGeometry(28, 28);
  pulsePlaneGeo.rotateX(-Math.PI * 0.5);
  const pulsePlaneMat = new THREE.ShaderMaterial({
    uniforms: {
      uOriginXZ: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 0 },
      uIntensity: { value: 0 },
      uTime: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec2 uOriginXZ;
      uniform float uRadius;
      uniform float uIntensity;
      uniform float uTime;
      varying vec3 vWorldPos;

      void main() {
        if (uIntensity <= 0.005) discard;
        float dist = distance(vWorldPos.xz, uOriginXZ);
        if (dist > uRadius + 0.35) discard;

        // Crisp leading sonar wavefront + trailing 2.4m topographic reveal band
        float leadWave = 1.0 - smoothstep(0.0, 0.18, abs(dist - uRadius));
        float trailWake = smoothstep(uRadius - 2.6, uRadius, dist) * step(dist, uRadius);

        // Topographic contour isolines & subsurface power bus conduits
        vec2 gridCell = abs(fract(vWorldPos.xz * 2.0) - 0.5);
        float fineGrid = 1.0 - smoothstep(0.46, 0.50, max(gridCell.x, gridCell.y));
        float radialRings = 1.0 - smoothstep(0.0, 0.045, abs(fract(dist * 1.25) - 0.5));
        float conduitBus = 1.0 - smoothstep(0.0, 0.035, min(abs(vWorldPos.x), abs(vWorldPos.z)));

        vec3 cyanCol = vec3(0.02, 0.88, 1.0);
        vec3 emeraldCol = vec3(0.12, 0.96, 0.68);
        vec3 col = mix(cyanCol, emeraldCol, radialRings * 0.5) * (leadWave * 1.65 + trailWake * (fineGrid * 0.65 + radialRings * 0.55 + conduitBus * 0.85));
        float alpha = uIntensity * (leadWave * 0.78 + trailWake * (fineGrid * 0.36 + radialRings * 0.32 + conduitBus * 0.45));
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
      }
    `
  });
  const pulsePlane = new THREE.Mesh(pulsePlaneGeo, pulsePlaneMat);
  pulsePlane.visible = false;
  pulsePlane.frustumCulled = false;
  group.add(pulsePlane);

  // --------------------------------------------------------------------------
  // 3. Pooled Nanite Embers + Overdrive Cold-Gas Seam Venting + Chromatic Ghosts
  // --------------------------------------------------------------------------
  const softCanvas = document.createElement('canvas');
  softCanvas.width = 32;
  softCanvas.height = 32;
  const sCtx = softCanvas.getContext('2d');
  if (sCtx) {
    const g = sCtx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(103,232,249,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = g;
    sCtx.fillRect(0, 0, 32, 32);
  }
  const softTex = new THREE.CanvasTexture(softCanvas);
  softTex.colorSpace = THREE.SRGBColorSpace;

  const particleCap = 120;
  const pPos = new Float32Array(particleCap * 3);
  const pVel = new Float32Array(particleCap * 3);
  const pCol = new Float32Array(particleCap * 3);
  const pAge = new Float32Array(particleCap);
  const pLife = new Float32Array(particleCap);
  for (let i = 0; i < particleCap; i++) {
    pPos[i * 3 + 1] = -999;
    pAge[i] = 99;
    pLife[i] = 1;
  }
  let pCursor = 0;

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    map: softTex,
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  group.add(particles);

  const _boxCenter = new THREE.Vector3();
  const _boxSize = new THREE.Vector3();

  const spawnParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    life: number
  ) => {
    const idx = pCursor % particleCap;
    pCursor++;
    pPos[idx * 3] = x;
    pPos[idx * 3 + 1] = y;
    pPos[idx * 3 + 2] = z;
    pVel[idx * 3] = vx;
    pVel[idx * 3 + 1] = vy;
    pVel[idx * 3 + 2] = vz;
    pCol[idx * 3] = r;
    pCol[idx * 3 + 1] = g;
    pCol[idx * 3 + 2] = b;
    pAge[idx] = 0;
    pLife[idx] = life;
  };

  return {
    group,
    shieldMesh,
    triggerShieldHit(hitWorldPos) {
      const slot = hitSlotCursor % 4;
      hitSlotCursor++;
      hitCenters[slot].copy(hitWorldPos);
      hitAges[slot] = 0.001;
    },

    update(params) {
      if (params.hidden) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const dt = Math.max(0.004, Math.min(0.08, params.dt));

      if (params.robotBounds && !params.robotBounds.isEmpty()) {
        params.robotBounds.getCenter(_boxCenter);
        params.robotBounds.getSize(_boxSize);
      } else {
        _boxCenter.set(0, params.floorY + 0.75, 0);
        _boxSize.set(0.95, 1.45, 0.85);
      }

      // 1. Hexagonal Energy Shield
      if (params.config.hexShieldEnabled) {
        shieldMesh.visible = true;
        shieldMesh.position.copy(_boxCenter);
        shieldMesh.scale.set(
          Math.max(0.42, _boxSize.x * 0.64),
          Math.max(0.52, _boxSize.y * 0.60),
          Math.max(0.42, _boxSize.z * 0.64)
        );
        for (let i = 0; i < 4; i++) {
          if (hitAges[i] < 10) hitAges[i] += dt;
        }
        shieldMat.uniforms.uTime.value = params.simTime;
        shieldMat.uniforms.uHitAges.value.set(hitAges[0], hitAges[1], hitAges[2], hitAges[3]);
      } else {
        shieldMesh.visible = false;
      }

      // 2. Tactical Topographic Pulse Wave
      if (params.pulseState.active && params.pulseState.intensity01 > 0.005) {
        pulsePlane.visible = true;
        pulsePlane.position.set(
          params.pulseState.originXZ[0],
          params.floorY + 0.019,
          params.pulseState.originXZ[1]
        );
        pulsePlaneMat.uniforms.uOriginXZ.value.set(
          params.pulseState.originXZ[0],
          params.pulseState.originXZ[1]
        );
        pulsePlaneMat.uniforms.uRadius.value = params.pulseState.radiusMeters;
        pulsePlaneMat.uniforms.uIntensity.value = params.pulseState.intensity01;
        pulsePlaneMat.uniforms.uTime.value = params.simTime;
      } else {
        pulsePlane.visible = false;
      }

      // 3. Emit Nanite Reconstruction Embers & Overdrive Cold-Gas Vent Plumes
      let hasActiveParticles = false;
      if (params.naniteFrame.active) {
        for (let k = 0; k < 4; k++) {
          const ang = (params.simTime * 7.3 + k * 1.57) % (Math.PI * 2);
          const rx = Math.cos(ang) * _boxSize.x * 0.36;
          const rz = Math.sin(ang) * _boxSize.z * 0.36;
          const isAmber = k % 2 === 0;
          spawnParticle(
            _boxCenter.x + rx,
            Math.min(_boxCenter.y + _boxSize.y * 0.5, Math.max(params.floorY, params.naniteFrame.sweepWorldY)),
            _boxCenter.z + rz,
            rx * 0.45,
            0.55 + (k % 3) * 0.22,
            rz * 0.45,
            isAmber ? 1.0 : 0.08,
            isAmber ? 0.74 : 0.92,
            isAmber ? 0.18 : 1.0,
            0.48
          );
        }
      }

      if (params.config.overdriveVentingEnabled) {
        const burstRate = params.loadFactor > 0.4 ? 3 : 2;
        for (let k = 0; k < burstRate; k++) {
          const side = k % 2 === 0 ? 1 : -1;
          const phase = params.simTime * 5.0 + k;
          // Cold gas & Sandevistan cyan-violet chromatic venting from dorsal/shoulder seams
          const isChromatic = k === 2;
          spawnParticle(
            _boxCenter.x + side * _boxSize.x * 0.26,
            _boxCenter.y + _boxSize.y * 0.12,
            _boxCenter.z - _boxSize.z * 0.18,
            side * (0.65 + Math.abs(Math.sin(phase)) * 0.45),
            0.42 + (k % 2) * 0.25,
            -0.55,
            isChromatic ? 0.68 : 0.78,
            isChromatic ? 0.28 : 0.94,
            1.0,
            0.44
          );
        }
      }

      for (let i = 0; i < particleCap; i++) {
        if (pAge[i] < pLife[i]) {
          hasActiveParticles = true;
          pAge[i] += dt;
          if (pAge[i] >= pLife[i]) {
            pPos[i * 3 + 1] = -999;
          } else {
            pPos[i * 3] += pVel[i * 3] * dt;
            pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
            pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
          }
        }
      }
      particles.visible = hasActiveParticles;
      if (hasActiveParticles) {
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      }
    },

    dispose() {
      shieldGeo.dispose();
      shieldMat.dispose();
      pulsePlaneGeo.dispose();
      pulsePlaneMat.dispose();
      softTex.dispose();
      pGeo.dispose();
      pMat.dispose();
    }
  };
}
