import * as THREE from 'three';

export type StudioLightingPresetId =
  | 'cold_lab'
  | 'cyberpunk_wet'
  | 'mars_golden'
  | 'metrology_darkroom';

export interface StudioLightingPresetSpec {
  id: StudioLightingPresetId;
  label: string;
  shortLabel: string;
  subtitle: string;
  bgHex: number;
  fogHex: number;
  fogDensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyHex: number;
  keyIntensity: number;
  keyPos: [number, number, number];
  rimHex: number;
  rimIntensity: number;
  rimPos: [number, number, number];
  bottomHex: number;
  bottomIntensity: number;
  deckBaseHex: number;
  deckHorizonHex: number;
  deckReflectIntensity: number;
  deckWetness: number;
  deckSeamGlowHex: number;
  deckSeamGlowStrength: number;
  volumetricConesOpacity: number;
  volumetricConeColorA: number;
  volumetricConeColorB: number;
  dustMotesOpacity: number;
  orbitingSpotIntensity: number;
}

export const STUDIO_LIGHTING_PRESETS: Record<StudioLightingPresetId, StudioLightingPresetSpec> = {
  cold_lab: {
    id: 'cold_lab',
    label: '冷峻工业实验室',
    shortLabel: '工业实验室',
    subtitle: '5600K 柔光箱阵列 · 哑光自流平地面',
    bgHex: 0x0d1017,
    fogHex: 0x0d1017,
    fogDensity: 0.018,
    hemiSkyHex: 0xdbeafe,
    hemiGroundHex: 0x11151d,
    hemiIntensity: 0.64,
    keyHex: 0xfff7ed,
    keyIntensity: 1.28,
    keyPos: [4.6, 7.6, 5.4],
    rimHex: 0x7dd3fc,
    rimIntensity: 0.82,
    rimPos: [-5.8, 3.8, -4.8],
    bottomHex: 0x38bdf8,
    bottomIntensity: 0.24,
    deckBaseHex: 0x141820,
    deckHorizonHex: 0x0d1017,
    deckReflectIntensity: 0.18,
    deckWetness: 0.15,
    deckSeamGlowHex: 0x38bdf8,
    deckSeamGlowStrength: 0.12,
    volumetricConesOpacity: 0.0,
    volumetricConeColorA: 0x38bdf8,
    volumetricConeColorB: 0xe2e8f0,
    dustMotesOpacity: 0.08,
    orbitingSpotIntensity: 0.0
  },
  cyberpunk_wet: {
    id: 'cyberpunk_wet',
    label: '赛博暗夜机库',
    shortLabel: '赛博湿地面',
    subtitle: '青/琥珀双色轮廓光 · 湿润镜面反射 + 双体积光束',
    bgHex: 0x060911,
    fogHex: 0x060911,
    fogDensity: 0.026,
    hemiSkyHex: 0x1e3a5f,
    hemiGroundHex: 0x090b12,
    hemiIntensity: 0.42,
    keyHex: 0x00e5ff,
    keyIntensity: 1.52,
    keyPos: [4.8, 6.8, 4.2],
    rimHex: 0xff6b35,
    rimIntensity: 1.65,
    rimPos: [-5.4, 3.4, -4.6],
    bottomHex: 0x00e5ff,
    bottomIntensity: 0.38,
    deckBaseHex: 0x0a0f18,
    deckHorizonHex: 0x060911,
    deckReflectIntensity: 0.46,
    deckWetness: 0.86,
    deckSeamGlowHex: 0x00e5ff,
    deckSeamGlowStrength: 0.58,
    volumetricConesOpacity: 0.19,
    volumetricConeColorA: 0x00e5ff,
    volumetricConeColorB: 0xff6b35,
    dustMotesOpacity: 0.52,
    orbitingSpotIntensity: 0.0
  },
  mars_golden: {
    id: 'mars_golden',
    label: '火星沙暴黄金时刻',
    shortLabel: '火星黄金时刻',
    subtitle: '2800K 低角暖阳逆光 · 赭石漫射与沙尘丁达尔',
    bgHex: 0x1b100b,
    fogHex: 0x24140d,
    fogDensity: 0.032,
    hemiSkyHex: 0xfdba74,
    hemiGroundHex: 0x431407,
    hemiIntensity: 0.58,
    keyHex: 0xffb36b,
    keyIntensity: 1.72,
    keyPos: [7.8, 2.5, -3.6],
    rimHex: 0x7dd3fc,
    rimIntensity: 0.55,
    rimPos: [-5.2, 4.4, 4.8],
    bottomHex: 0xc2410c,
    bottomIntensity: 0.42,
    deckBaseHex: 0x231510,
    deckHorizonHex: 0x1b100b,
    deckReflectIntensity: 0.12,
    deckWetness: 0.08,
    deckSeamGlowHex: 0xf59e0b,
    deckSeamGlowStrength: 0.22,
    volumetricConesOpacity: 0.14,
    volumetricConeColorA: 0xffb36b,
    volumetricConeColorB: 0xf97316,
    dustMotesOpacity: 0.64,
    orbitingSpotIntensity: 0.0
  },
  metrology_darkroom: {
    id: 'metrology_darkroom',
    label: '光学暗室检测',
    shortLabel: '光学暗室',
    subtitle: '全黑消光背景 · 环绕准直强聚光探照检验',
    bgHex: 0x030407,
    fogHex: 0x030407,
    fogDensity: 0.015,
    hemiSkyHex: 0x334155,
    hemiGroundHex: 0x020305,
    hemiIntensity: 0.18,
    keyHex: 0xf8fafc,
    keyIntensity: 0.45,
    keyPos: [3.2, 6.2, 3.8],
    rimHex: 0x38bdf8,
    rimIntensity: 0.95,
    rimPos: [-5.6, 2.8, -4.4],
    bottomHex: 0x0ea5e9,
    bottomIntensity: 0.14,
    deckBaseHex: 0x07090e,
    deckHorizonHex: 0x030407,
    deckReflectIntensity: 0.32,
    deckWetness: 0.48,
    deckSeamGlowHex: 0x38bdf8,
    deckSeamGlowStrength: 0.34,
    volumetricConesOpacity: 0.12,
    volumetricConeColorA: 0xe0f2fe,
    volumetricConeColorB: 0x38bdf8,
    dustMotesOpacity: 0.36,
    orbitingSpotIntensity: 5.4
  }
};

export const STUDIO_LIGHTING_PRESET_LIST: StudioLightingPresetSpec[] = [
  STUDIO_LIGHTING_PRESETS.cold_lab,
  STUDIO_LIGHTING_PRESETS.cyberpunk_wet,
  STUDIO_LIGHTING_PRESETS.mars_golden,
  STUDIO_LIGHTING_PRESETS.metrology_darkroom
];

export interface CinemaOpticsConfig {
  lightingPreset: StudioLightingPresetId;
  /** Physical exposure compensation in stops [-1.5 .. +1.5] */
  exposureEv: number;
  /** Selective HDR bloom threshold [0.70 .. 0.96] */
  bloomThreshold: number;
  /** Selective HDR bloom strength [0.06 .. 0.45] */
  bloomStrength: number;
  /** Panavision horizontal anamorphic flare streak intensity [0.0 .. 1.0] */
  anamorphicStreak: number;
  /** Auto-focus macro / part-isolation shallow depth of field */
  smartBokehEnabled: boolean;
  /** Subtle 35mm organic film grain [0.0 .. 0.30] */
  filmGrain: number;
  /** Subtle peripheral vignette & radial chromatic dispersion */
  chromaticVignette: boolean;
  /** Dynamic frame-budget guard (>20ms auto-scales multi-tap samples) */
  frameBudgetGuard: boolean;
}

export function createDefaultCinemaOpticsConfig(): CinemaOpticsConfig {
  return {
    lightingPreset: 'cold_lab',
    exposureEv: 0.08,
    bloomThreshold: 0.86,
    bloomStrength: 0.2,
    anamorphicStreak: 0.36,
    smartBokehEnabled: false,
    filmGrain: 0.05,
    chromaticVignette: true,
    frameBudgetGuard: true
  };
}

export function evToLinearExposureMultiplier(ev: number): number {
  const clamped = Math.max(-1.5, Math.min(1.5, Number.isFinite(ev) ? ev : 0));
  return Math.pow(2, clamped);
}

export function computeSmartFocusDistanceMeters(
  camPos: [number, number, number],
  targetPos: [number, number, number]
): number {
  const dx = camPos[0] - targetPos[0];
  const dy = camPos[1] - targetPos[1];
  const dz = camPos[2] - targetPos[2];
  return Math.max(0.25, Math.min(28.0, Math.hypot(dx, dy, dz)));
}

export interface FrameBudgetGuardSnapshot {
  rollingMs: number;
  qualityScale: number;
  anamorphicTapScale: number;
  isThrottled: boolean;
}

/**
 * Tracks exponential moving average frame duration (ms) and scales down
 * secondary post-processing taps whenever frame time exceeds 20ms (<50 FPS).
 */
export function stepFrameBudgetGuard(
  prevRollingMs: number,
  rawDtSec: number,
  guardEnabled: boolean,
  isSoftwareGl: boolean
): FrameBudgetGuardSnapshot {
  const sampleMs = Math.max(2.0, Math.min(120.0, rawDtSec * 1000));
  const rollingMs =
    prevRollingMs <= 0 ? sampleMs : prevRollingMs * 0.88 + sampleMs * 0.12;

  if (isSoftwareGl) {
    return {
      rollingMs,
      qualityScale: 0.45,
      anamorphicTapScale: 0.5,
      isThrottled: true
    };
  }

  if (!guardEnabled || rollingMs <= 20.0) {
    return {
      rollingMs,
      qualityScale: 1.0,
      anamorphicTapScale: 1.0,
      isThrottled: false
    };
  }

  if (rollingMs <= 28.0) {
    return {
      rollingMs,
      qualityScale: 0.68,
      anamorphicTapScale: 0.65,
      isThrottled: true
    };
  }

  return {
    rollingMs,
    qualityScale: 0.42,
    anamorphicTapScale: 0.35,
    isThrottled: true
  };
}

export interface StudioAtmosphereRigController {
  group: THREE.Group;
  applyPreset: (
    presetId: StudioLightingPresetId,
    targets: {
      scene: THREE.Scene;
      hemiLight?: THREE.HemisphereLight | null;
      keyLight?: THREE.DirectionalLight | null;
      rimLight?: THREE.DirectionalLight | null;
      bottomLight?: THREE.DirectionalLight | null;
      setDeckStyle?: (params: {
        baseHex: number;
        horizonHex: number;
        reflectIntensity: number;
        wetness: number;
        seamGlowHex: number;
        seamGlowStrength: number;
      }) => void;
    }
  ) => void;
  update: (simTime: number, floorY: number, hidden: boolean) => void;
  dispose: () => void;
}

/**
 * Builds dual soft-faded volumetric spotlight cones, floating Tyndall dust motes,
 * and an orbiting collimated optical metrology spotlight for Hangar / Workstation scenes.
 */
export function createStudioAtmosphereRig(
  isSoftwareGl: boolean
): StudioAtmosphereRigController {
  const group = new THREE.Group();
  group.name = 'studio_cinema_atmosphere_rig';

  let currentPreset: StudioLightingPresetSpec = STUDIO_LIGHTING_PRESETS.cold_lab;

  // Custom Fresnel + Vertical-Fade Volumetric Cone Shader (zero hard geometric edges!)
  const coneGeo = new THREE.CylinderGeometry(0.28, 1.85, 4.8, 28, 1, true);
  const makeConeMat = (hex: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(hex) },
        uOpacity: { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vViewNorm;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewNorm = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vViewNorm;
        varying vec3 vViewDir;
        void main() {
          if (uOpacity <= 0.002) discard;
          float edgeSoft = pow(abs(dot(normalize(vViewNorm), normalize(vViewDir))), 1.85);
          float topFade = smoothstep(1.0, 0.72, vUv.y);
          float bottomFade = smoothstep(0.0, 0.34, vUv.y);
          float alpha = uOpacity * edgeSoft * topFade * bottomFade;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });

  const coneMatA = makeConeMat(0x00e5ff);
  const coneMatB = makeConeMat(0xff6b35);

  const coneA = new THREE.Mesh(coneGeo, coneMatA);
  coneA.position.set(1.55, 1.55, 1.15);
  coneA.rotation.set(0.22, 0, 0.32);
  coneA.frustumCulled = false;
  group.add(coneA);

  const coneB = new THREE.Mesh(coneGeo, coneMatB);
  coneB.position.set(-1.65, 1.48, -1.05);
  coneB.rotation.set(-0.2, 0, -0.34);
  coneB.frustumCulled = false;
  group.add(coneB);

  // Floating Tyndall Micro-Dust Motes inside the Hangar Light Volume
  const moteCount = isSoftwareGl ? 72 : 160;
  const moteBase = new Float32Array(moteCount * 3);
  const motePos = new Float32Array(moteCount * 3);
  const moteCol = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const r = 0.25 + ((i * 37) % 100) / 100 * 2.45;
    const y = -0.55 + ((i * 53) % 100) / 100 * 2.85;
    moteBase[i * 3] = Math.cos(a) * r;
    moteBase[i * 3 + 1] = y;
    moteBase[i * 3 + 2] = Math.sin(a) * r;
    motePos[i * 3] = moteBase[i * 3];
    motePos[i * 3 + 1] = y;
    motePos[i * 3 + 2] = moteBase[i * 3 + 2];
    const warmMix = i % 3 === 0 ? 1 : 0;
    moteCol[i * 3] = warmMix ? 1.0 : 0.45;
    moteCol[i * 3 + 1] = warmMix ? 0.72 : 0.92;
    moteCol[i * 3 + 2] = warmMix ? 0.45 : 1.0;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));

  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = 32;
  moteCanvas.height = 32;
  const mCtx = moteCanvas.getContext('2d');
  if (mCtx) {
    const g = mCtx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(224,242,254,0.65)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mCtx.fillStyle = g;
    mCtx.fillRect(0, 0, 32, 32);
  }
  const moteTex = new THREE.CanvasTexture(moteCanvas);
  moteTex.colorSpace = THREE.SRGBColorSpace;

  const moteMat = new THREE.PointsMaterial({
    map: moteTex,
    size: 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  // Orbiting Collimated Inspection Spotlight for Optical Metrology Darkroom
  const metrologySpot = new THREE.SpotLight(0xe0f2fe, 0.0, 14.0, Math.PI / 6.5, 0.42, 1.4);
  metrologySpot.position.set(2.8, 2.6, 2.4);
  metrologySpot.target.position.set(0, 0.05, 0);
  group.add(metrologySpot);
  group.add(metrologySpot.target);

  let lastPresetApplied: StudioLightingPresetId | null = null;

  return {
    group,
    applyPreset(presetId, targets) {
      const spec = STUDIO_LIGHTING_PRESETS[presetId] || STUDIO_LIGHTING_PRESETS.cold_lab;
      currentPreset = spec;
      if (lastPresetApplied !== presetId) {
        lastPresetApplied = presetId;
        if (targets.scene.background instanceof THREE.Color) {
          targets.scene.background.setHex(spec.bgHex);
        } else {
          targets.scene.background = new THREE.Color(spec.bgHex);
        }
        if (targets.scene.fog instanceof THREE.FogExp2) {
          targets.scene.fog.color.setHex(spec.fogHex);
          targets.scene.fog.density = spec.fogDensity;
        } else {
          targets.scene.fog = new THREE.FogExp2(spec.fogHex, spec.fogDensity);
        }
      }

      if (targets.hemiLight) {
        targets.hemiLight.color.setHex(spec.hemiSkyHex);
        targets.hemiLight.groundColor.setHex(spec.hemiGroundHex);
        targets.hemiLight.intensity = spec.hemiIntensity;
      }
      if (targets.keyLight) {
        targets.keyLight.color.setHex(spec.keyHex);
        targets.keyLight.intensity = spec.keyIntensity;
        targets.keyLight.position.set(spec.keyPos[0], spec.keyPos[1], spec.keyPos[2]);
      }
      if (targets.rimLight) {
        targets.rimLight.color.setHex(spec.rimHex);
        targets.rimLight.intensity = spec.rimIntensity;
        targets.rimLight.position.set(spec.rimPos[0], spec.rimPos[1], spec.rimPos[2]);
      }
      if (targets.bottomLight) {
        targets.bottomLight.color.setHex(spec.bottomHex);
        targets.bottomLight.intensity = spec.bottomIntensity;
      }
      targets.setDeckStyle?.({
        baseHex: spec.deckBaseHex,
        horizonHex: spec.deckHorizonHex,
        reflectIntensity: spec.deckReflectIntensity,
        wetness: spec.deckWetness,
        seamGlowHex: spec.deckSeamGlowHex,
        seamGlowStrength: spec.deckSeamGlowStrength
      });

      coneMatA.uniforms.uColor.value.setHex(spec.volumetricConeColorA);
      coneMatB.uniforms.uColor.value.setHex(spec.volumetricConeColorB);
      coneMatA.uniforms.uOpacity.value = spec.volumetricConesOpacity;
      coneMatB.uniforms.uOpacity.value = spec.volumetricConesOpacity * 0.88;
      moteMat.opacity = spec.dustMotesOpacity;
      metrologySpot.intensity = spec.orbitingSpotIntensity;
    },

    update(simTime, floorY, hidden) {
      group.visible = !hidden;
      if (hidden) return;

      const showCones = currentPreset.volumetricConesOpacity > 0.005;
      coneA.visible = showCones;
      coneB.visible = showCones;

      if (currentPreset.id === 'metrology_darkroom') {
        const ang = simTime * 0.62;
        const rad = 2.95;
        const sx = Math.cos(ang) * rad;
        const sz = Math.sin(ang) * rad;
        metrologySpot.position.set(sx, 2.35 + Math.sin(simTime * 1.1) * 0.35, sz);
        coneA.position.set(sx * 0.62, floorY + 2.15, sz * 0.62);
        coneA.lookAt(0, floorY + 0.35, 0);
        coneA.rotateX(Math.PI * 0.5);
        coneB.visible = false;
      } else if (showCones) {
        coneA.position.set(1.55, floorY + 2.35, 1.15);
        coneA.rotation.set(0.22 + Math.sin(simTime * 0.45) * 0.03, 0, 0.32);
        coneB.position.set(-1.65, floorY + 2.28, -1.05);
        coneB.rotation.set(-0.2 + Math.cos(simTime * 0.4) * 0.03, 0, -0.34);
      }

      if (currentPreset.dustMotesOpacity > 0.02 && !isSoftwareGl) {
        const posAttr = moteGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < moteCount; i++) {
          const b = i * 3;
          posAttr.array[b] = moteBase[b] + Math.sin(simTime * 0.42 + i * 0.7) * 0.08;
          posAttr.array[b + 1] =
            floorY +
            0.18 +
            ((moteBase[b + 1] + 0.8 + simTime * (0.045 + (i % 5) * 0.008)) % 2.85);
          posAttr.array[b + 2] = moteBase[b + 2] + Math.cos(simTime * 0.38 + i * 0.9) * 0.08;
        }
        posAttr.needsUpdate = true;
      }
    },

    dispose() {
      coneGeo.dispose();
      coneMatA.dispose();
      coneMatB.dispose();
      moteGeo.dispose();
      moteTex.dispose();
      moteMat.dispose();
    }
  };
}

/**
 * Lightweight single-pass Anamorphic + Micro-Impulse Post-Processing Pipeline
 * for MarsSciFiCombatGame.tsx (adds horizontal cyan/amber Panavision flare streaks
 * on muzzle flashes, missiles, Boss shield breaks & overheat venting + radial impact vignette).
 */
export interface CombatAnamorphicPostController {
  render: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    params: {
      rawDt: number;
      simTime: number;
      anamorphicStrength: number;
      impulseIntensity01: number;
    }
  ) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createCombatAnamorphicPostPipeline(
  renderer: THREE.WebGLRenderer,
  initialW: number,
  initialH: number,
  isSoftwareGl: boolean
): CombatAnamorphicPostController {
  let w = Math.max(64, Math.floor(initialW));
  let h = Math.max(64, Math.floor(initialH));
  let rollingMs = 14.0;

  let rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postScene = new THREE.Scene();

  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: rt.texture },
      uResolution: { value: new THREE.Vector2(w, h) },
      uAnamorphic: { value: 0.44 },
      uImpulse: { value: 0.0 },
      uTime: { value: 0.0 }
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tScene;
      uniform vec2 uResolution;
      uniform float uAnamorphic;
      uniform float uImpulse;
      uniform float uTime;
      varying vec2 vUv;

      vec3 highPass(vec3 c) {
        float peak = max(max(c.r, c.g), c.b);
        float k = max(0.0, peak - 0.80) / 0.20;
        return c * k * k;
      }

      void main() {
        vec2 texel = 1.0 / max(vec2(64.0), uResolution);
        vec2 dir = vUv - 0.5;
        float dist = length(dir);

        // Radial chromatic dispersion scaled slightly during heavy weapon/shield impacts
        float ca = (0.0014 + uImpulse * 0.0055) * dist;
        float r = texture2D(tScene, clamp(vUv - dir * ca, 0.002, 0.998)).r;
        float g = texture2D(tScene, vUv).g;
        float b = texture2D(tScene, clamp(vUv + dir * ca, 0.002, 0.998)).b;
        vec3 col = vec3(r, g, b);

        // 8-tap wide horizontal Panavision Anamorphic Flare Streak
        vec3 streak = vec3(0.0);
        float dx1 = texel.x * 5.0;
        float dx2 = texel.x * 13.0;
        float dx3 = texel.x * 26.0;
        float dx4 = texel.x * 44.0;
        streak += (highPass(texture2D(tScene, clamp(vUv + vec2(dx1, 0.0), 0.002, 0.998)).rgb) +
                   highPass(texture2D(tScene, clamp(vUv - vec2(dx1, 0.0), 0.002, 0.998)).rgb)) * 0.26;
        streak += (highPass(texture2D(tScene, clamp(vUv + vec2(dx2, 0.0), 0.002, 0.998)).rgb) +
                   highPass(texture2D(tScene, clamp(vUv - vec2(dx2, 0.0), 0.002, 0.998)).rgb)) * 0.19;
        streak += (highPass(texture2D(tScene, clamp(vUv + vec2(dx3, 0.0), 0.002, 0.998)).rgb) +
                   highPass(texture2D(tScene, clamp(vUv - vec2(dx3, 0.0), 0.002, 0.998)).rgb)) * 0.12;
        streak += (highPass(texture2D(tScene, clamp(vUv + vec2(dx4, 0.0), 0.002, 0.998)).rgb) +
                   highPass(texture2D(tScene, clamp(vUv - vec2(dx4, 0.0), 0.002, 0.998)).rgb)) * 0.07;

        vec3 anamorphicTint = vec3(0.38, 0.86, 1.0) * streak.b + vec3(1.0, 0.62, 0.28) * streak.r * 0.65;
        col += (streak * 0.45 + anamorphicTint * 0.65) * uAnamorphic;

        // Subtle cinema vignette + film grain
        float vig = 1.0 - smoothstep(0.42, 0.96, dist) * (0.18 + uImpulse * 0.16);
        float grain = fract(sin(dot(vUv * uResolution + uTime * 37.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        col = clamp(col * vig + grain * 0.014, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const quad = new THREE.Mesh(quadGeo, postMat);
  quad.frustumCulled = false;
  postScene.add(quad);

  return {
    render(scene, camera, params) {
      const budget = stepFrameBudgetGuard(rollingMs, params.rawDt, true, isSoftwareGl);
      rollingMs = budget.rollingMs;

      // On software WebGL or severe frame budget pressure, bypass fullscreen RT pass seamlessly
      if (isSoftwareGl || params.anamorphicStrength <= 0.01) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      const prevToneMapping = renderer.toneMapping;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);

      postMat.uniforms.tScene.value = rt.texture;
      postMat.uniforms.uAnamorphic.value = params.anamorphicStrength * budget.anamorphicTapScale;
      postMat.uniforms.uImpulse.value = Math.max(0, Math.min(1, params.impulseIntensity01));
      postMat.uniforms.uTime.value = params.simTime;

      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(postScene, orthoCam);
      renderer.toneMapping = prevToneMapping;
    },
    setSize(width, height) {
      const nw = Math.max(64, Math.floor(width));
      const nh = Math.max(64, Math.floor(height));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      rt.dispose();
      rt = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.UnsignedByteType,
        depthBuffer: true
      });
      postMat.uniforms.uResolution.value.set(w, h);
    },
    dispose() {
      rt.dispose();
      quadGeo.dispose();
      postMat.dispose();
    }
  };
}
