export type PbrSurfaceMaterialClass =
  | 'titanium_anisotropic'
  | 'anodized_aluminum'
  | 'carbon_fiber_weave'
  | 'acrylic_pressure_dome'
  | 'elastomer_rubber_tire'
  | 'emissive_combustor_core'
  | 'emissive_mmrtg_core'
  | 'emissive_lumen_spotlight'
  | 'precision_steel_machined';

export interface PbrEnhancementProfile {
  surfaceClass: PbrSurfaceMaterialClass;
  metalness: number;
  roughness: number;
  envMapIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** Anisotropy strength [0..1] for brushed titanium fan blades & machined shafts */
  anisotropy: number;
  /** Physical area-light emissive radiance for Gear-2 Path Tracing */
  isEmissiveAreaLight: boolean;
  emissiveHex: number;
  emissiveRadiance: number;
}

/**
 * CAD / Digital Twin Restrained Selective Bloom Parameters:
 * Threshold >= 0.85, Strength in [0.15, 0.25] so ONLY high-energy laser kerfs,
 * active sensor beacons, and razor-thin chrome specular glints bloom — white/light
 * mechanical housings stay 100% crisp without glow blowout.
 */
export const RESTRAINED_BLOOM_CONFIG = {
  threshold: 0.88,
  strength: 0.18
} as const;

/**
 * Multi-Scale Ground-Truth / Horizon Ambient Occlusion (GTAO) Radii (meters in view space):
 * Tight joint/flange crevices + structural cavities + broad chassis/exploded-view occlusion.
 */
export const GTAO_CONFIG = {
  creviceRadius: 0.032,
  cavityRadius: 0.105,
  chassisRadius: 0.25,
  intensity: 0.74
} as const;

const PRECISION_KINEMATIC_KEYWORDS = [
  'hydraulic',
  'piston',
  'rod',
  'bearing',
  'rail',
  'guide',
  'harmonic',
  'gear',
  'pinion',
  'spline',
  'actuator',
  'servo',
  'motor',
  'stator',
  'caliper',
  'flange',
  'bolt',
  'collar',
  'coupling',
  'wrist',
  'ankle',
  'finger',
  'thumb',
  'index',
  'middle',
  'gripper',
  'jaw',
  'turret',
  'drill',
  'gimbal',
  'spindle',
  'thruster',
  'nozzle'
];

const MATTE_CASTING_OR_HOUSING_KEYWORDS = [
  'base',
  'torso',
  'pelvis',
  'chassis',
  'shell',
  'cover',
  'cowling',
  'nacelle',
  'shroud',
  'hood',
  'body',
  'frame',
  'housing',
  'casing',
  'thigh',
  'calf',
  'hip',
  'shoulder',
  'upper_arm',
  'forearm',
  'flipper',
  'track',
  'fender',
  'bumper',
  'panel',
  'fairing',
  'pylon',
  'wing',
  'fuselage'
];

/**
 * Classifies real .glb CAD sub-meshes into physically stratified microfacet PBR profiles:
 * - Matte bead-blasted anodized aluminum / industrial powder-coat for structural castings & outer shells
 *   (Roughness 0.45–0.70, low mirror glare, crisp volumetric light-to-dark form transitions).
 * - High-metalness (0.90+) & low-roughness (0.12–0.20) machined chrome / stainless steel / titanium
 *   for precision kinematic parts (hydraulic rods, bearing races, guide rails, rotors, harmonic drives).
 * - Calibrated physical emissive mesh area lights for Gear-2 Path Tracing GI bounce.
 */
export function classifyPbrMaterialEnhancement(
  contextId: string,
  partName: string,
  layer: 'L1' | 'L2' | 'L3'
): PbrEnhancementProfile {
  const id = contextId.toLowerCase();
  const n = partName.toLowerCase();

  // 1. High-Radiance Emissive Physical Area Light Sources (Gear 2 Path Tracing GI Bounce)
  if (
    (id.includes('cfm56') || id.includes('b737')) &&
    (n.includes('combustor') || n.includes('burner') || n.includes('hpt') || n.includes('nozzle_core'))
  ) {
    return {
      surfaceClass: 'emissive_combustor_core',
      metalness: 0.78,
      roughness: 0.26,
      envMapIntensity: 1.15,
      clearcoat: 0.05,
      clearcoatRoughness: 0.35,
      anisotropy: 0.35,
      isEmissiveAreaLight: true,
      emissiveHex: 0xff5a1f,
      emissiveRadiance: 2.95
    };
  }

  if (
    id === 'mars2020' &&
    (n.includes('mmrtg') || n.includes('rtg') || n.includes('power_source') || n.includes('heat_exchanger'))
  ) {
    return {
      surfaceClass: 'emissive_mmrtg_core',
      metalness: 0.46,
      roughness: 0.42,
      envMapIntensity: 1.05,
      clearcoat: 0.06,
      clearcoatRoughness: 0.38,
      anisotropy: 0.18,
      isEmissiveAreaLight: true,
      emissiveHex: 0xff6b1a,
      emissiveRadiance: 2.65
    };
  }

  if (
    (id === 'bluerov2' || id === 'rexrov2' || id === 'sar') &&
    (n.includes('light') || n.includes('lumen') || n.includes('led') || n.includes('lamp') || n.includes('beacon'))
  ) {
    return {
      surfaceClass: 'emissive_lumen_spotlight',
      metalness: 0.22,
      roughness: 0.14,
      envMapIntensity: 1.25,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      anisotropy: 0.0,
      isEmissiveAreaLight: true,
      emissiveHex: 0x67e8f9,
      emissiveRadiance: 2.85
    };
  }

  // 2. Clearcoat / Optical Acrylic Pressure Domes, Camera Lenses & LiDAR Windows
  if (
    n.includes('dome') ||
    n.includes('acrylic') ||
    n.includes('glass') ||
    n.includes('lens') ||
    n.includes('camera') ||
    n.includes('window') ||
    n.includes('visor')
  ) {
    return {
      surfaceClass: 'acrylic_pressure_dome',
      metalness: 0.06,
      roughness: 0.08,
      envMapIntensity: 1.38,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      anisotropy: 0.0,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 3. Precision Turned Titanium Fan Blades, Compressors, Shafts & Rotors (Metalness 0.92+, Roughness 0.14–0.18)
  if (
    n.includes('titanium') ||
    n.includes('fan') ||
    n.includes('blade') ||
    n.includes('lpc') ||
    n.includes('hpc') ||
    n.includes('lpt') ||
    n.includes('shaft') ||
    n.includes('rotor') ||
    n.includes('prop')
  ) {
    return {
      surfaceClass: 'titanium_anisotropic',
      metalness: 0.93,
      roughness: 0.16,
      envMapIntensity: 1.32,
      clearcoat: 0.08,
      clearcoatRoughness: 0.18,
      anisotropy: 0.78,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 4. Satin Woven Carbon-Fiber / Composite Cascade Elements (Reversers, Booms)
  if (n.includes('carbon') || n.includes('composite') || n.includes('reverser')) {
    return {
      surfaceClass: 'carbon_fiber_weave',
      metalness: 0.26,
      roughness: 0.48,
      envMapIntensity: 0.88,
      clearcoat: 0.14,
      clearcoatRoughness: 0.34,
      anisotropy: 0.36,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 5. Precision Kinematic Motion Parts (Hydraulic Rods, Bearing Races, Guide Rails, Harmonic Drives, Flanges)
  const isPrecisionKinematic = PRECISION_KINEMATIC_KEYWORDS.some((kw) => n.includes(kw));
  if (isPrecisionKinematic) {
    return {
      surfaceClass: 'precision_steel_machined',
      metalness: 0.92,
      roughness: 0.15,
      envMapIntensity: 1.28,
      clearcoat: 0.06,
      clearcoatRoughness: 0.16,
      anisotropy: 0.58,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 5b. High-Roughness (0.88–0.94) Elastomer Rubber Tires, Treads, Gaskets & Foot Pads
  if (
    n.includes('tire') ||
    n.includes('rubber') ||
    n.includes('foot_pad') ||
    n.includes('tread') ||
    n.includes('gasket')
  ) {
    return {
      surfaceClass: 'elastomer_rubber_tire',
      metalness: 0.04,
      roughness: 0.91,
      envMapIntensity: 0.42,
      clearcoat: 0.0,
      clearcoatRoughness: 0.85,
      anisotropy: 0.0,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 6. Structural Castings, Painted/Anodized Outer Shells & Limb Housings (Roughness 0.45–0.70, Zero Plastic Glare!)
  const isCastingOrHousing =
    layer === 'L1' || MATTE_CASTING_OR_HOUSING_KEYWORDS.some((kw) => n.includes(kw));
  if (isCastingOrHousing) {
    // Subtle deterministic per-part roughness variation within [0.50, 0.66] for tactile assembly contrast
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = (hash * 31 + n.charCodeAt(i)) | 0;
    }
    const microVar = ((Math.abs(hash) % 17) / 16) * 0.14; // [0.00 .. 0.14]
    return {
      surfaceClass: 'anodized_aluminum',
      metalness: 0.24,
      roughness: Number((0.50 + microVar).toFixed(3)),
      envMapIntensity: 0.82,
      clearcoat: 0.03,
      clearcoatRoughness: 0.54,
      anisotropy: 0.12,
      isEmissiveAreaLight: false,
      emissiveHex: 0x000000,
      emissiveRadiance: 0
    };
  }

  // 7. Default L2/L3 Internal Machined Mechanical Linkages & End-Effector Hardware
  return {
    surfaceClass: 'precision_steel_machined',
    metalness: 0.91,
    roughness: 0.17,
    envMapIntensity: 1.24,
    clearcoat: 0.05,
    clearcoatRoughness: 0.2,
    anisotropy: 0.5,
    isEmissiveAreaLight: false,
    emissiveHex: 0x000000,
    emissiveRadiance: 0
  };
}

function haltonRadicalInverse(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = Math.max(1, Math.floor(index));
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Low-discrepancy 2D Halton (base 2, base 3) quasi-Monte Carlo sample offset in [-0.5, +0.5]^2.
 * Sample 1 returns near-center jitter so low-SPP interactive previews stay crisp.
 */
export function computeHaltonJitter2D(sampleIndex: number): [number, number] {
  if (sampleIndex <= 1) return [0, 0];
  const jx = haltonRadicalInverse(sampleIndex, 2) - 0.5;
  const jy = haltonRadicalInverse(sampleIndex, 3) - 0.5;
  return [jx, jy];
}

export interface PathTracerAccumulatorState {
  enabled: boolean;
  spp: number;
  maxSpp: number;
  lastSignature: number;
  converged: boolean;
}

export function createPathTracerAccumulatorState(maxSpp: number = 256): PathTracerAccumulatorState {
  return {
    enabled: false,
    spp: 0,
    maxSpp,
    lastSignature: Number.NaN,
    converged: false
  };
}

/**
 * Computes a fast deterministic floating-point signature over camera matrix, explosion progress,
 * optical clip plane, and active joint pose so any dynamic motion resets SPP to 0 cleanly,
 * while stationary inspection accumulates smoothly up to 256 SPP.
 */
export function computeSceneStateSignature(
  camMatrixElements: ArrayLike<number>,
  explosionProgress: number,
  clipRatio: number,
  poseChecksum: number
): number {
  let acc = 0;
  for (let i = 0; i < 16; i++) {
    acc += Math.round((camMatrixElements[i] || 0) * 2000) * (i + 3);
  }
  acc += Math.round(explosionProgress * 2500) * 31;
  acc += Math.round(clipRatio * 2500) * 47;
  acc += Math.round(poseChecksum * 1200) * 73;
  return acc;
}

/**
 * Advances progressive Monte Carlo path-tracing SPP accumulation.
 * Resets `spp` to `samplesAdded` (typically 1..16) whenever `sceneSignature` changes,
 * and increments monotonically up to `maxSpp` (256) when stationary.
 */
export function stepPathTracerAccumulatorState(
  prev: PathTracerAccumulatorState,
  enabled: boolean,
  sceneSignature: number,
  samplesPerFrame: number = 2
): { next: PathTracerAccumulatorState; didReset: boolean; blendWeight: number } {
  if (!enabled) {
    return {
      next: {
        ...prev,
        enabled: false,
        spp: 0,
        lastSignature: sceneSignature,
        converged: false
      },
      didReset: prev.enabled,
      blendWeight: 1.0
    };
  }

  const moved = !Number.isFinite(prev.lastSignature) || prev.lastSignature !== sceneSignature || !prev.enabled;
  if (moved) {
    const initialSpp = Math.max(1, Math.min(prev.maxSpp, samplesPerFrame));
    return {
      next: {
        enabled: true,
        spp: initialSpp,
        maxSpp: prev.maxSpp,
        lastSignature: sceneSignature,
        converged: initialSpp >= prev.maxSpp
      },
      didReset: true,
      blendWeight: 1.0
    };
  }

  if (prev.spp >= prev.maxSpp) {
    return {
      next: { ...prev, converged: true },
      didReset: false,
      blendWeight: 0.0
    };
  }

  const nextSpp = Math.min(prev.maxSpp, prev.spp + Math.max(1, samplesPerFrame));
  const added = nextSpp - prev.spp;
  const blendWeight = added / nextSpp;

  return {
    next: {
      enabled: true,
      spp: nextSpp,
      maxSpp: prev.maxSpp,
      lastSignature: sceneSignature,
      converged: nextSpp >= prev.maxSpp
    },
    didReset: false,
    blendWeight
  };
}
