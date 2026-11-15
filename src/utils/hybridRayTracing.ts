import * as THREE from 'three';
import {
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree
} from 'three-mesh-bvh';
import {
  GTAO_CONFIG,
  RESTRAINED_BLOOM_CONFIG,
  classifyPbrMaterialEnhancement,
  computeHaltonJitter2D,
  computeSceneStateSignature,
  createPathTracerAccumulatorState,
  PathTracerAccumulatorState,
  stepPathTracerAccumulatorState
} from './hybridRayTracingMath';
import {
  CinemaOpticsConfig,
  evToLinearExposureMultiplier,
  stepFrameBudgetGuard
} from './cinemaOpticsPipeline';

let _cachedIsSoftwareGl: boolean | null = null;

/**
 * Probes WebGL2 renderer string once per session to distinguish hardware GPUs
 * from headless/software rasterizers (SwiftShader / llvmpipe).
 */
export function detectSoftwareWebGL(): boolean {
  if (_cachedIsSoftwareGl !== null) return _cachedIsSoftwareGl;
  if (typeof document === 'undefined') {
    _cachedIsSoftwareGl = false;
    return false;
  }
  try {
    const probeCanvas = document.createElement('canvas');
    const probeGl = probeCanvas.getContext('webgl2');
    const dbgExt = probeGl?.getExtension('WEBGL_debug_renderer_info');
    const gpuStr = probeGl
      ? String(probeGl.getParameter(dbgExt ? dbgExt.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER))
      : '';
    probeGl?.getExtension('WEBGL_lose_context')?.loseContext();
    _cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuStr);
  } catch {
    _cachedIsSoftwareGl = false;
  }
  return _cachedIsSoftwareGl;
}

// Patch Three.js prototypes once so raycasting against 200k+ triangle GLB CAD parts uses O(log N) static MeshBVH!
let _bvhPatched = false;
function ensureThreeMeshBvhPatched() {
  if (_bvhPatched) return;
  _bvhPatched = true;
  (THREE.BufferGeometry.prototype as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree =
    computeBoundsTree;
  (THREE.BufferGeometry.prototype as unknown as { disposeBoundsTree: typeof disposeBoundsTree }).disposeBoundsTree =
    disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

const _builtBvhGeometries = new WeakSet<THREE.BufferGeometry>();

let _sharedBeadBlastBumpTex: THREE.DataTexture | null = null;

/**
 * Generates a tileable 128x128 isotropic bead-blasted anodized aluminum micro-grain bump texture
 * so matte structural castings & housings exhibit tactile industrial sandblasted relief rather than plastic flatness.
 */
function getSharedBeadBlastBumpMap(): THREE.DataTexture {
  if (_sharedBeadBlastBumpTex) return _sharedBeadBlastBumpTex;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const n1 = h1 - Math.floor(h1);
      const h2 = Math.sin((x + 17) * 39.346 + (y + 29) * 11.135) * 24634.6345;
      const n2 = h2 - Math.floor(h2);
      const grain = Math.round(128 + (n1 * 0.65 + n2 * 0.35 - 0.5) * 38);
      const idx = (y * size + x) * 4;
      data[idx] = grain;
      data[idx + 1] = grain;
      data[idx + 2] = grain;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.needsUpdate = true;
  _sharedBeadBlastBumpTex = tex;
  return tex;
}

/**
 * Builds a custom 4-vertex indexed quad BufferGeometry directly from typed attribute arrays.
 * If `horizontalXZ` is true, lies on Y=0 plane facing +Y; otherwise lies in clip/XY plane [-w/2..w/2, -h/2..h/2].
 */
export function createCustomQuadGeometry(
  width: number,
  height: number,
  horizontalXZ: boolean
): THREE.BufferGeometry {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const pos = horizontalXZ
    ? new Float32Array([-hw, 0, -hh, hw, 0, -hh, hw, 0, hh, -hw, 0, hh])
    : new Float32Array([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0]);
  const norm = horizontalXZ
    ? new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
    : new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(horizontalXZ ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  return g;
}

export interface EmissiveAreaLightSource {
  node: THREE.Object3D;
  color: THREE.Color;
  radiance: number;
  radius: number;
}

/**
 * Builds a calibrated CAD / Digital Twin Industrial Studio Lightbox PMREM environment.
 * Uses restrained softbox intensities with dark architectural framing so chrome/titanium
 * kinematic parts display crisp high-contrast reflections while white/light structural
 * shells preserve full midtone form without overexposure.
 */
export function createStudioLightboxPmrem(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0b0e14);

  const dispositions: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  const addEmitterPanel = (
    w: number,
    h: number,
    horiz: boolean,
    pos: [number, number, number],
    rot: [number, number, number],
    r: number,
    g: number,
    b: number
  ) => {
    const geo = createCustomQuadGeometry(w, h, horiz);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(r, g, b),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    envScene.add(mesh);
    dispositions.push({ geo, mat });
  };

  // Calibrated Overhead Studio Softbox Strips (crisp specular lines on chrome/steel, zero white-shell blowout)
  addEmitterPanel(11.5, 1.5, true, [0, 8.8, -2.4], [Math.PI, 0, 0], 2.35, 2.42, 2.55);
  addEmitterPanel(11.5, 1.5, true, [0, 8.8, 2.4], [Math.PI, 0, 0], 2.1, 2.18, 2.32);
  // Dark Studio Gantry Divider Rib between overhead softboxes for realistic chrome horizon contrast
  addEmitterPanel(13.0, 1.2, true, [0, 8.6, 0.0], [Math.PI, 0, 0], 0.04, 0.05, 0.07);
  // Neutral-Warm Key Studio Diffuser
  addEmitterPanel(8.5, 3.4, false, [8.8, 3.6, 3.4], [0, -Math.PI * 0.42, 0], 1.95, 1.68, 1.32);
  // Cool Slate-Cyan Precision Rim Strip
  addEmitterPanel(9.5, 3.6, false, [-8.8, 3.2, -3.4], [0, Math.PI * 0.38, 0], 0.52, 1.28, 1.92);
  // Matte Space-Gray Industrial Floor Bounce
  addEmitterPanel(22, 22, true, [0, -4.5, 0], [0, 0, 0], 0.08, 0.09, 0.12);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(envScene, 0.032);
  pmrem.dispose();
  for (const d of dispositions) {
    d.geo.dispose();
    d.mat.dispose();
  }
  return rt.texture;
}

/**
 * Traverses a loaded .glb scene once at load time:
 * 1. Builds a static per-mesh BLAS (`MeshBVH`) once per unique BufferGeometry.
 * 2. Applies physically stratified PBR contrast:
 *    - Matte bead-blasted anodized aluminum / powder-coat on structural castings & outer shells (roughness 0.48-0.68).
 *    - High-metalness (0.90+), low-roughness (0.12-0.20) chrome / stainless steel / titanium on precision kinematic parts.
 * 3. Collects physical emissive mesh area lights for Gear-2 Path Tracing.
 */
export function upgradeGlbPbrAndBuildStaticBvh(
  root: THREE.Object3D,
  contextId: string,
  classifyLayerFn: (name: string) => 'L1' | 'L2' | 'L3'
): {
  bvhMeshCount: number;
  emissiveSources: EmissiveAreaLightSource[];
} {
  ensureThreeMeshBvhPatched();
  let bvhMeshCount = 0;
  const emissiveSources: EmissiveAreaLightSource[] = [];
  const beadBlastBump = getSharedBeadBlastBumpMap();

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
    if (!geom || !geom.attributes?.position) return;

    // 1. Static BLAS MeshBVH built strictly once per geometry
    if (!geom.boundsTree && !_builtBvhGeometries.has(geom)) {
      try {
        geom.boundsTree = new MeshBVH(geom, { targetLeafSize: 24 });
        _builtBvhGeometries.add(geom);
      } catch {
        // Fallback safely if non-standard attribute layout
      }
    }
    if (geom.boundsTree) bvhMeshCount++;

    // 2. Stratified Physical PBR Material Calibration
    const layer = classifyLayerFn(mesh.name || '');
    const profile = classifyPbrMaterialEnhancement(contextId, mesh.name || '', layer);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    const isMatteCasting =
      profile.surfaceClass === 'anodized_aluminum' || profile.surfaceClass === 'carbon_fiber_weave';
    const isMachinedMetal =
      profile.surfaceClass === 'precision_steel_machined' ||
      profile.surfaceClass === 'titanium_anisotropic';
    const isRubberElastomer = profile.surfaceClass === 'elastomer_rubber_tire';
    const isOpticalGlass = profile.surfaceClass === 'acrylic_pressure_dome';

    const microSurfaceClass = isMachinedMetal
      ? 1
      : profile.surfaceClass === 'carbon_fiber_weave'
        ? 2
        : isOpticalGlass
          ? 3
          : isRubberElastomer
            ? 4
            : 0;

    for (const rawMat of mats) {
      const std = rawMat as THREE.MeshStandardMaterial & {
        clearcoat?: number;
        clearcoatRoughness?: number;
        anisotropy?: number;
        ior?: number;
        iridescence?: number;
        iridescenceIOR?: number;
      };
      if (!std || !('roughness' in std)) continue;

      std.userData = { ...std.userData, microSurfaceClass };

      if (isRubberElastomer) {
        std.metalness = 0.04;
        std.roughness = 0.91;
      } else if (isMatteCasting) {
        // Enforce matte bead-blasted / industrial powder-coat finish on outer shells & castings (never mirror-oily!)
        std.metalness = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(std.metalness ?? 0.3, profile.metalness, 0.8),
          0.08,
          0.38
        );
        std.roughness = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(std.roughness ?? 0.55, profile.roughness, 0.82),
          0.45,
          0.72
        );
        if (!std.bumpMap && !std.normalMap) {
          std.bumpMap = beadBlastBump;
          std.bumpScale = 0.0022;
        }
      } else if (isMachinedMetal) {
        // Enforce crisp turned chrome / stainless steel / titanium on kinematic parts
        std.metalness = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(std.metalness ?? 0.8, profile.metalness, 0.85),
          0.88,
          0.97
        );
        std.roughness = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(std.roughness ?? 0.2, profile.roughness, 0.85),
          0.11,
          0.22
        );
      } else {
        std.metalness = THREE.MathUtils.lerp(std.metalness ?? 0.5, profile.metalness, 0.68);
        std.roughness = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(std.roughness ?? 0.4, profile.roughness, 0.72),
          0.06,
          0.88
        );
      }

      std.envMapIntensity = profile.envMapIntensity;

      if ('clearcoat' in std) {
        std.clearcoat = profile.clearcoat;
        std.clearcoatRoughness = profile.clearcoatRoughness;
      }
      if ('anisotropy' in std) {
        std.anisotropy = profile.anisotropy;
      }
      if (isOpticalGlass) {
        if ('ior' in std) std.ior = 1.52;
        if ('iridescence' in std) std.iridescence = 0.85;
        if ('iridescenceIOR' in std) std.iridescenceIOR = 1.38;
      }

      if (profile.isEmissiveAreaLight && std.emissive) {
        std.emissive.setHex(profile.emissiveHex);
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 1.0, 1.25);
      }
      std.needsUpdate = true;
    }

    if (profile.isEmissiveAreaLight) {
      emissiveSources.push({
        node: mesh,
        color: new THREE.Color(profile.emissiveHex),
        radiance: profile.emissiveRadiance,
        radius: 0.35
      });
    }
  });

  return { bvhMeshCount, emissiveSources };
}

// ============================================================================
// INFINITE MATTE SPACE-GRAY INDUSTRIAL FLOOR + SOFT CONTACT SHADOW + SUBTLE SSR
// ============================================================================

export interface SaltlineReflectorDeckController {
  mesh: THREE.Mesh;
  setFloorY: (y: number) => void;
  setContactFootprint: (centerX: number, centerZ: number, radiusX: number, radiusZ: number) => void;
  setExplosionFade: (explosion01: number) => void;
  setDeckStyle: (params: {
    baseHex: number;
    horizonHex: number;
    reflectIntensity: number;
    wetness: number;
    seamGlowHex: number;
    seamGlowStrength: number;
  }) => void;
  updateReflection: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) => void;
  dispose: () => void;
}

function createProceduralMatteFloorMap(): {
  normalRoughTex: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Uniform matte mineral/polyurethane industrial deck base (roughness ~0.70, zero wet oil puddles!)
  ctx.fillStyle = 'rgb(128, 128, 178)';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle isotropic mineral sandblast micro-grain (no glossy puddles)
  for (let i = 0; i < 950; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const nx = 122 + (i % 13);
    const ny = 122 + ((i * 3) % 13);
    const rough = 168 + (i % 26);
    ctx.fillStyle = `rgba(${nx}, ${ny}, ${rough}, 0.32)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Ultra-fine matte machine-troweled micro-texture
  ctx.lineWidth = 1.0;
  for (let s = 0; s < 240; s++) {
    const x0 = (s * 59) % 256;
    const y0 = (s * 101) % 256;
    const len = 6 + (s % 14);
    const ang = (s % 9) * 0.35;
    const nx = Math.round(128 + Math.cos(ang) * 10);
    const ny = Math.round(128 + Math.sin(ang) * 10);
    ctx.strokeStyle = `rgba(${nx}, ${ny}, 186, 0.16)`;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return { normalRoughTex: tex };
}

export function createSaltlineReflectorDeck(
  isSoftwareGl: boolean,
  initialFloorY: number = -0.86
): SaltlineReflectorDeckController {
  const rtRes = isSoftwareGl ? 192 : 384;
  const reflectRT = new THREE.WebGLRenderTarget(rtRes, rtRes, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true
  });

  const { normalRoughTex } = createProceduralMatteFloorMap();
  // 48m x 48m wide floor seamlessly fades into #0d1017 horizon fog for an infinite CAD stage
  const deckGeo = createCustomQuadGeometry(48.0, 48.0, true);

  const textureMatrix = new THREE.Matrix4();
  const virtualCamera = new THREE.PerspectiveCamera();
  const reflectClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -initialFloorY - 0.005);
  const contactFootprint = new THREE.Vector4(0.0, 0.0, 0.72, 0.72);

  const deckMat = new THREE.ShaderMaterial({
    uniforms: {
      tReflection: { value: reflectRT.texture },
      tNormalRough: { value: normalRoughTex },
      uTextureMatrix: { value: textureMatrix },
      uBaseColor: { value: new THREE.Color(0x141820) },
      uHorizonColor: { value: new THREE.Color(0x0d1017) },
      uReflectIntensity: { value: 0.18 },
      uWetness: { value: 0.15 },
      uSeamGlowColor: { value: new THREE.Color(0x38bdf8) },
      uSeamGlowStrength: { value: 0.12 },
      uExplosionFade: { value: 0.0 },
      uContactFootprint: { value: contactFootprint }
    },
    vertexShader: `
      uniform mat4 uTextureMatrix;
      varying vec4 vReflectUv;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv * 18.0;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vReflectUv = uTextureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D tReflection;
      uniform sampler2D tNormalRough;
      uniform vec3 uBaseColor;
      uniform vec3 uHorizonColor;
      uniform float uReflectIntensity;
      uniform float uWetness;
      uniform vec3 uSeamGlowColor;
      uniform float uSeamGlowStrength;
      uniform float uExplosionFade;
      uniform vec4 uContactFootprint;
      varying vec4 vReflectUv;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec4 nr = texture2D(tNormalRough, vUv);
        vec2 microGrain = (nr.rg - 0.5) * mix(0.024, 0.008, uWetness);
        float surfaceRoughness = mix(clamp(nr.b, 0.58, 0.84), 0.12, uWetness * 0.82);

        vec2 projUv = vReflectUv.xy / max(0.0001, vReflectUv.w);
        float radialDist = length(vWorldPos.xz);
        float horizonBlend = smoothstep(3.8, 16.5, radialDist);
        float reflFade = 1.0 - smoothstep(2.8, 9.8, radialDist);

        // Roughness-modulated 9-Tap Planar Reflection (sharp mirror streaks when wet, soft diffused sheen when matte!)
        float blurRadius = (0.003 + surfaceRoughness * 0.022) * (1.0 + radialDist * 0.16);
        vec2 p0 = clamp(projUv + microGrain, 0.003, 0.997);
        vec2 p1 = clamp(projUv + microGrain + vec2(-0.61, 0.42) * blurRadius, 0.003, 0.997);
        vec2 p2 = clamp(projUv + microGrain + vec2(0.58, 0.39) * blurRadius, 0.003, 0.997);
        vec2 p3 = clamp(projUv + microGrain + vec2(-0.44, -0.63) * blurRadius, 0.003, 0.997);
        vec2 p4 = clamp(projUv + microGrain + vec2(0.67, -0.48) * blurRadius, 0.003, 0.997);
        vec2 p5 = clamp(projUv + microGrain + vec2(0.12, 0.86) * blurRadius, 0.003, 0.997);
        vec2 p6 = clamp(projUv + microGrain + vec2(-0.88, -0.09) * blurRadius, 0.003, 0.997);
        vec2 p7 = clamp(projUv + microGrain + vec2(0.84, 0.14) * blurRadius, 0.003, 0.997);
        vec2 p8 = clamp(projUv + microGrain + vec2(-0.14, -0.89) * blurRadius, 0.003, 0.997);

        vec3 reflCol = (
          texture2D(tReflection, p0).rgb +
          texture2D(tReflection, p1).rgb +
          texture2D(tReflection, p2).rgb +
          texture2D(tReflection, p3).rgb +
          texture2D(tReflection, p4).rgb +
          texture2D(tReflection, p5).rgb +
          texture2D(tReflection, p6).rgb +
          texture2D(tReflection, p7).rgb +
          texture2D(tReflection, p8).rgb
        ) / 9.0;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float NoV = clamp(viewDir.y, 0.0, 1.0);
        float fresnel = 0.06 + 0.64 * pow(1.0 - NoV, 3.6);

        // Industrial self-leveling epoxy + brushed-metal expansion seams + precision coordinate reticle ring
        float stageFalloff = exp(-radialDist * radialDist * 0.055);
        vec2 metricCell = abs(fract(vWorldPos.xz * 0.5) - 0.5);
        float metalSeam = (1.0 - smoothstep(0.0, 0.009, min(metricCell.x, metricCell.y))) * (1.0 - smoothstep(2.2, 7.8, radialDist));
        float coordRing = (1.0 - smoothstep(0.0, 0.014, abs(radialDist - 1.65))) + (1.0 - smoothstep(0.0, 0.014, abs(radialDist - 2.85))) * 0.6;
        vec3 floorAlbedo = mix(uHorizonColor, uBaseColor + vec3(0.018, 0.022, 0.030) * stageFalloff, 1.0 - horizonBlend);
        floorAlbedo = mix(floorAlbedo, vec3(0.16, 0.20, 0.26), metalSeam * 0.34);
        floorAlbedo += uSeamGlowColor * (metalSeam * 0.32 + coordRing * 0.45) * uSeamGlowStrength * (1.0 - horizonBlend);

        // Multi-Layered Soft Contact Shadow directly beneath footprint, fading smoothly as exploded parts lift!
        vec2 relFoot = (vWorldPos.xz - uContactFootprint.xy) / max(vec2(0.18), uContactFootprint.zw * (1.0 + uExplosionFade * 0.38));
        float ellipDistSq = dot(relFoot, relFoot);
        float tightCoreAo = exp(-ellipDistSq * 2.35) * 0.66;
        float softPenumbraAo = exp(-ellipDistSq * 0.72) * 0.30;
        float contactShadow = clamp(tightCoreAo + softPenumbraAo, 0.0, 0.80) * (1.0 - uExplosionFade * 0.55);

        floorAlbedo *= (1.0 - contactShadow);

        float maxReflClamp = mix(0.26, 0.68, uWetness);
        float reflWeight = uReflectIntensity * reflFade * (0.42 + 0.58 * fresnel) * (1.0 - contactShadow * 0.52);
        vec3 composed = mix(floorAlbedo, reflCol * mix(0.68, 0.92, uWetness) + floorAlbedo * mix(0.52, 0.25, uWetness), clamp(reflWeight, 0.0, maxReflClamp));
        vec3 finalCol = mix(composed, uHorizonColor, horizonBlend);

        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(deckGeo, deckMat);
  mesh.name = 'infinite_matte_industrial_deck';
  mesh.position.y = initialFloorY;
  mesh.renderOrder = -2;

  const normal = new THREE.Vector3(0, 1, 0);
  const reflectorWorldPos = new THREE.Vector3();
  const cameraWorldPos = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const lookAtPosition = new THREE.Vector3(0, 0, -1);
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();

  let swFrameCounter = 0;

  return {
    mesh,
    setFloorY(y: number) {
      mesh.position.y = y;
      reflectClipPlane.constant = -y - 0.004;
      swFrameCounter = 0;
    },
    setContactFootprint(centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
      contactFootprint.set(
        centerX,
        centerZ,
        Math.max(0.28, radiusX),
        Math.max(0.28, radiusZ)
      );
      swFrameCounter = 0;
    },
    setExplosionFade(explosion01: number) {
      deckMat.uniforms.uExplosionFade.value = Math.max(0, Math.min(1, explosion01));
    },
    setDeckStyle(params) {
      deckMat.uniforms.uBaseColor.value.setHex(params.baseHex);
      deckMat.uniforms.uHorizonColor.value.setHex(params.horizonHex);
      deckMat.uniforms.uReflectIntensity.value = params.reflectIntensity;
      deckMat.uniforms.uWetness.value = params.wetness;
      deckMat.uniforms.uSeamGlowColor.value.setHex(params.seamGlowHex);
      deckMat.uniforms.uSeamGlowStrength.value = params.seamGlowStrength;
    },
    updateReflection(renderer, scene, camera) {
      const stride = isSoftwareGl ? 4 : 2;
      const shouldRender = swFrameCounter % stride === 0;
      swFrameCounter++;
      if (!shouldRender) return;

      mesh.updateMatrixWorld();
      reflectorWorldPos.setFromMatrixPosition(mesh.matrixWorld);
      cameraWorldPos.setFromMatrixPosition(camera.matrixWorld);

      if (cameraWorldPos.y <= reflectorWorldPos.y + 0.04) return;

      rotationMatrix.extractRotation(camera.matrixWorld);

      view.subVectors(reflectorWorldPos, cameraWorldPos);
      view.reflect(normal).negate();
      view.add(reflectorWorldPos);

      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPos);
      target.subVectors(reflectorWorldPos, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPos);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.near = camera.near;
      virtualCamera.far = camera.far;
      virtualCamera.fov = camera.fov;
      virtualCamera.aspect = camera.aspect;
      virtualCamera.updateMatrixWorld();
      virtualCamera.updateProjectionMatrix();

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(mesh.matrixWorld);

      const prevVisible = mesh.visible;
      const prevTarget = renderer.getRenderTarget();
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      const prevClipping = renderer.clippingPlanes;

      mesh.visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.clippingPlanes = [reflectClipPlane];

      renderer.setRenderTarget(reflectRT);
      renderer.clear();
      renderer.render(scene, virtualCamera);

      renderer.clippingPlanes = prevClipping;
      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.setRenderTarget(prevTarget);
      mesh.visible = prevVisible;
    },
    dispose() {
      reflectRT.dispose();
      normalRoughTex.dispose();
      deckGeo.dispose();
      deckMat.dispose();
    }
  };
}

// ============================================================================
// GEAR 1 (MULTI-SCALE GTAO + REALTIME SSR + RESTRAINED BLOOM) + GEAR 2 (256-SPP)
// ============================================================================

export interface DynamicEmissivePoint {
  pos: THREE.Vector3;
  color: THREE.Color;
  radiance: number;
}

export interface DualGearRayTracingController {
  renderFrame: (params: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    keyLight?: THREE.DirectionalLight | null;
    rimLight?: THREE.DirectionalLight | null;
    pathTracingEnabled: boolean;
    explosionProgress: number;
    clipRatio: number;
    poseChecksum: number;
    emissiveSources: EmissiveAreaLightSource[];
    dynamicEmissives?: DynamicEmissivePoint[];
    schlierenMode?: boolean;
    simTime?: number;
    cinemaOptics?: CinemaOpticsConfig;
    focusDistanceMeters?: number;
    bulletTimeScale?: number;
    impulseVignette01?: number;
    rawDt?: number;
  }) => { spp: number; converged: boolean };
  setSize: (width: number, height: number) => void;
  resetAccumulation: () => void;
  export4KFrame: (
    filename: string,
    renderCallback: () => void
  ) => Promise<void>;
  dispose: () => void;
}

export function createDualGearRayTracingPipeline(
  renderer: THREE.WebGLRenderer,
  initialWidth: number,
  initialHeight: number,
  isSoftwareGl: boolean
): DualGearRayTracingController {
  let width = Math.max(64, Math.floor(initialWidth));
  let height = Math.max(64, Math.floor(initialHeight));
  const computeEffectiveScale = () => (isSoftwareGl ? 0.8 : 1.0);
  let rtScale = computeEffectiveScale();

  const rtType = THREE.UnsignedByteType;

  const createSceneTarget = (w: number, h: number) => {
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: rtType,
      depthTexture: depthTex,
      depthBuffer: true
    });
  };

  const createAccumTarget = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: rtType,
      depthBuffer: false
    });

  let effW = Math.max(64, Math.floor(width * rtScale));
  let effH = Math.max(64, Math.floor(height * rtScale));

  let sceneRT = createSceneTarget(effW, effH);
  let accumRTA = createAccumTarget(effW, effH);
  let accumRTB = createAccumTarget(effW, effH);
  let pingPong = 0;

  let accumState: PathTracerAccumulatorState = createPathTracerAccumulatorState(256);

  const fsQuadGeo = createCustomQuadGeometry(2, 2, false);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postScene = new THREE.Scene();
  const blitScene = new THREE.Scene();

  const maxEmissives = 6;
  const emissivePosArr: THREE.Vector3[] = [];
  const emissiveColArr: THREE.Vector3[] = [];
  for (let i = 0; i < maxEmissives; i++) {
    emissivePosArr.push(new THREE.Vector3(0, -999, 0));
    emissiveColArr.push(new THREE.Vector3(0, 0, 0));
  }

  const invProj = new THREE.Matrix4();
  const viewProj = new THREE.Matrix4();
  const invView = new THREE.Matrix4();
  const lightDirView = new THREE.Vector3(0.48, 0.72, 0.5).normalize();

  const blitMat = new THREE.ShaderMaterial({
    uniforms: {
      tAccum: { value: accumRTA.texture }
    },
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tAccum;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(tAccum, vUv).rgb, 1.0);
      }
    `
  });
  const blitQuadMesh = new THREE.Mesh(fsQuadGeo, blitMat);
  blitQuadMesh.frustumCulled = false;
  blitScene.add(blitQuadMesh);

  // Straight-line HLSL-safe CAD Post-Processing & Progressive Path-Tracing Shader:
  // - Multi-Scale Ground-Truth Horizon Ambient Occlusion (GTAO: tight joint crevices + structural cavities + chassis grounding)
  // - Real-Time Screen-Space Reflections (SSR) on machined kinematic links & actuators
  // - Restrained High-Threshold Selective Bloom (Threshold = 0.88, Strength = 0.18 — zero white-shell blowout!)
  const hybridPostMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: sceneRT.texture },
      tDepth: { value: sceneRT.depthTexture },
      tPrevAccum: { value: accumRTA.texture },
      uResolution: { value: new THREE.Vector2(effW, effH) },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: invProj },
      uInvView: { value: invView },
      uViewProj: { value: viewProj },
      uLightDirView: { value: lightDirView },
      uMode: { value: 0 },
      uSubpixelJitter: { value: new THREE.Vector2(0, 0) },
      uBlendWeight: { value: 1.0 },
      uSampleSeed: { value: 1.0 },
      uEmissiveCount: { value: 0 },
      uEmissivePos: { value: emissivePosArr },
      uEmissiveCol: { value: emissiveColArr },
      uExposure: { value: 1.06 },
      uBloomThreshold: { value: RESTRAINED_BLOOM_CONFIG.threshold },
      uBloomStrength: { value: RESTRAINED_BLOOM_CONFIG.strength },
      uGtaoIntensity: { value: GTAO_CONFIG.intensity },
      uSchlierenMode: { value: 0 },
      uSimTime: { value: 0.0 },
      uAnamorphicStreak: { value: 0.0 },
      uSmartBokeh: { value: 0.0 },
      uFocusDepth: { value: 2.5 },
      uFilmGrain: { value: 0.0 },
      uChromaticVignette: { value: 0.0 },
      uBulletTimeActive: { value: 0.0 },
      uImpulseVignette: { value: 0.0 }
    },
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform sampler2D tPrevAccum;
      uniform vec2 uResolution;
      uniform mat4 uProj;
      uniform mat4 uInvProj;
      uniform mat4 uInvView;
      uniform mat4 uViewProj;
      uniform vec3 uLightDirView;
      uniform int uMode;
      uniform vec2 uSubpixelJitter;
      uniform float uBlendWeight;
      uniform float uSampleSeed;
      uniform int uEmissiveCount;
      uniform vec3 uEmissivePos[6];
      uniform vec3 uEmissiveCol[6];
      uniform float uExposure;
      uniform float uBloomThreshold;
      uniform float uBloomStrength;
      uniform float uGtaoIntensity;
      uniform int uSchlierenMode;
      uniform float uSimTime;
      uniform float uAnamorphicStreak;
      uniform float uSmartBokeh;
      uniform float uFocusDepth;
      uniform float uFilmGrain;
      uniform float uChromaticVignette;
      uniform float uBulletTimeActive;
      uniform float uImpulseVignette;
      varying vec2 vUv;

      vec3 acesFilmicAndSrgb(vec3 linearHdr) {
        vec3 x = max(vec3(0.0), linearHdr * uExposure);
        vec3 mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        return pow(mapped, vec3(1.0 / 2.2));
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float interleavedGradientNoise(vec2 screenPos) {
        return fract(52.9829189 * fract(0.06711056 * screenPos.x + 0.00583715 * screenPos.y));
      }

      vec3 extractSelectiveHighPass(vec3 c) {
        float peak = max(max(c.r, c.g), c.b);
        float knee = max(0.0, peak - uBloomThreshold) / max(0.02, 1.0 - uBloomThreshold);
        return c * (knee * knee);
      }

      vec3 getViewPos(vec2 uv, float depth) {
        vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 vp = uInvProj * clip;
        return vp.xyz / max(1e-5, vp.w);
      }

      vec2 viewToUv(vec3 vp) {
        vec4 clip = uProj * vec4(vp, 1.0);
        return clamp((clip.xy / max(1e-5, clip.w)) * 0.5 + 0.5, vec2(0.003), vec2(0.997));
      }

      float evalHorizonOcclusion(vec3 vp, vec3 nView, vec3 sampleVp, float sampleDepth, float maxRange) {
        float valid = step(sampleDepth, 0.9995);
        vec3 occluderVp = getViewPos(viewToUv(sampleVp), sampleDepth);
        vec3 horizonVec = occluderVp - vp;
        float dist = length(horizonVec);
        float nDotH = dot(nView, horizonVec / max(1e-4, dist));
        float rangeFalloff = 1.0 - smoothstep(maxRange * 0.35, maxRange, dist);
        float frontCheck = step(0.0018, occluderVp.z - sampleVp.z + maxRange * 0.32);
        return valid * frontCheck * clamp(nDotH - 0.12, 0.0, 1.0) * rangeFalloff;
      }

      void main() {
        vec2 texel = 1.0 / max(vec2(64.0), uResolution);
        vec2 sampleUv = clamp(vUv + uSubpixelJitter * texel, vec2(0.001), vec2(0.999));

        // 1. Uniform control-flow texture reads at top level (100% HLSL fxc gradient-safe)
        vec4 baseSample = texture2D(tColor, sampleUv);
        float depth = texture2D(tDepth, vUv).r;
        float dR = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).r;
        float dL = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).r;
        float dU = texture2D(tDepth, vUv + vec2(0.0, texel.y)).r;
        float dD = texture2D(tDepth, vUv - vec2(0.0, texel.y)).r;

        // 4-Tap Cross-Diagonal High-Threshold Selective Bloom Reads
        vec2 bOff = texel * 2.8;
        vec3 bC1 = texture2D(tColor, clamp(vUv + vec2(bOff.x, bOff.y), vec2(0.002), vec2(0.998))).rgb;
        vec3 bC2 = texture2D(tColor, clamp(vUv + vec2(-bOff.x, bOff.y), vec2(0.002), vec2(0.998))).rgb;
        vec3 bC3 = texture2D(tColor, clamp(vUv + vec2(bOff.x, -bOff.y), vec2(0.002), vec2(0.998))).rgb;
        vec3 bC4 = texture2D(tColor, clamp(vUv + vec2(-bOff.x, -bOff.y), vec2(0.002), vec2(0.998))).rgb;
        vec3 selectiveBloom = (
          extractSelectiveHighPass(baseSample.rgb) * 0.28 +
          (extractSelectiveHighPass(bC1) + extractSelectiveHighPass(bC2) + extractSelectiveHighPass(bC3) + extractSelectiveHighPass(bC4)) * 0.18
        ) * uBloomStrength;

        // Panavision Horizontal Anamorphic Flare Streaks (6-Tap Wide Horizontal High-Pass)
        vec3 anamorphicFlare = vec3(0.0);
        if (uAnamorphicStreak > 0.005) {
          vec3 aL1 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv - vec2(texel.x * 7.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 aR1 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv + vec2(texel.x * 7.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 aL2 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv - vec2(texel.x * 19.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 aR2 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv + vec2(texel.x * 19.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 aL3 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv - vec2(texel.x * 38.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 aR3 = extractSelectiveHighPass(texture2D(tColor, clamp(vUv + vec2(texel.x * 38.0, 0.0), vec2(0.002), vec2(0.998))).rgb);
          vec3 rawStreak = (aL1 + aR1) * 0.25 + (aL2 + aR2) * 0.16 + (aL3 + aR3) * 0.09;
          vec3 panavisionTint = vec3(0.28, 0.84, 1.0) * max(rawStreak.b, rawStreak.g * 0.8) + vec3(1.0, 0.62, 0.24) * rawStreak.r * 0.55;
          anamorphicFlare = (rawStreak * 0.35 + panavisionTint * 0.72) * uAnamorphicStreak;
        }
        selectiveBloom += anamorphicFlare;

        if (uSchlierenMode == 1) {
          float edgeGradX = clamp((dR - dL) * 42.0, -1.0, 1.0);
          float edgeGradY = clamp((dU - dD) * 42.0, -1.0, 1.0);
          float silRim = clamp(length(vec2(edgeGradX, edgeGradY)), 0.0, 1.0);
          vec2 p = (vUv - vec2(0.5, 0.5)) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
          float noseX = -0.27;
          float dxNose = p.x - noseX;
          float bowCurve = sqrt(max(0.002, 0.016 + max(0.0, dxNose) * 0.30));
          float bowDist = abs(abs(p.y) - bowCurve);
          float bowMask = smoothstep(-0.02, 0.04, dxNose) * (1.0 - smoothstep(0.32, 0.78, dxNose));
          float bowArc = exp(-bowDist * 68.0) * bowMask;
          float bowDarkEdge = exp(-abs(abs(p.y) - (bowCurve + 0.012)) * 85.0) * bowMask;
          float obCurve = sqrt(max(0.002, 0.006 + max(0.0, p.x + 0.04) * 0.19));
          float obDist = abs(abs(p.y) - obCurve);
          float obMask = smoothstep(-0.04, 0.03, p.x) * (1.0 - smoothstep(0.30, 0.72, p.x));
          float obliqueArc = exp(-obDist * 76.0) * obMask * 0.75;
          float wakeMask = smoothstep(0.08, 0.24, p.x) * (1.0 - smoothstep(0.45, 0.85, p.x)) * exp(-abs(p.y) * 9.5);
          float wakeShear = wakeMask * sin(p.y * 52.0 + sin(p.x * 24.0 - uSimTime * 14.0) * 1.4) * 0.14;

          vec3 mappedBody = acesFilmicAndSrgb(baseSample.rgb);
          float luma = dot(mappedBody, vec3(0.299, 0.587, 0.114));
          float knifeShade = clamp(0.10 + pow(luma, 0.88) * 0.82 + (edgeGradX - edgeGradY) * 0.24, 0.03, 0.98);
          vec3 chromeBody = mix(vec3(0.05, 0.07, 0.10), vec3(0.88, 0.93, 0.98), knifeShade);

          float radialMirror = clamp(1.0 - dot(p * 0.85, p * 0.85), 0.0, 1.0);
          vec3 darkOpticalBg = vec3(0.028, 0.042, 0.068) + vec3(0.018, 0.028, 0.044) * radialMirror;
          float shockBright = clamp(bowArc * 0.88 + obliqueArc * 0.62 + max(0.0, wakeShear) + silRim * 0.45, 0.0, 1.0);
          float shockShadow = clamp(bowDarkEdge * 0.55 + max(0.0, -wakeShear), 0.0, 0.65);
          vec3 skyCol = clamp(darkOpticalBg * (1.0 - shockShadow) + vec3(0.72, 0.88, 1.0) * shockBright, 0.0, 1.0);
          gl_FragColor = vec4(mix(skyCol, chromeBody, step(depth, 0.9996)), 1.0);
          return;
        }

        float isSurface = step(depth, 0.9996);
        float ign = interleavedGradientNoise(gl_FragCoord.xy);
        float noiseA = hash12(gl_FragCoord.xy + vec2(uSampleSeed * 17.3, uSampleSeed * 31.7));
        float noiseB = hash12(gl_FragCoord.yx * 1.37 + vec2(uSampleSeed * 53.1, uSampleSeed * 11.9));

        vec3 vp = getViewPos(vUv, min(depth, 0.999));
        vec3 dx = abs(dR - depth) < abs(dL - depth)
          ? getViewPos(vUv + vec2(texel.x, 0.0), dR) - vp
          : vp - getViewPos(vUv - vec2(texel.x, 0.0), dL);
        vec3 dy = abs(dU - depth) < abs(dD - depth)
          ? getViewPos(vUv + vec2(0.0, texel.y), dU) - vp
          : vp - getViewPos(vUv - vec2(0.0, texel.y), dD);
        vec3 nCross = cross(dx, dy);
        float nLenSq = dot(nCross, nCross);
        vec3 nView = nLenSq > 1e-10 ? nCross * inversesqrt(nLenSq) : vec3(0.0, 0.0, 1.0);

        float isPt = uMode == 1 ? 1.0 : 0.0;
        vec3 softLightDir = normalize(
          uLightDirView + vec3((noiseA - 0.5) * 0.22, (noiseB - 0.5) * 0.22, (noiseA - noiseB) * 0.10) * isPt
        );

        // 2-Tap Directional Contact Shadow (flange & joint lip self-shadowing)
        float j1 = mix(ign * 0.55 + 0.2, noiseA, isPt);
        vec3 shVp1 = vp + nView * 0.004 + softLightDir * (0.032 + j1 * 0.028);
        vec3 shVp2 = vp + nView * 0.005 + softLightDir * (0.095 + j1 * 0.045);
        vec2 shUv1 = viewToUv(shVp1);
        vec2 shUv2 = viewToUv(shVp2);
        float shD1 = texture2D(tDepth, shUv1).r;
        float shD2 = texture2D(tDepth, shUv2).r;
        float shDz1 = getViewPos(shUv1, shD1).z - shVp1.z;
        float shDz2 = getViewPos(shUv2, shD2).z - shVp2.z;
        float contactShadow = max(
          step(shD1, 0.9995) * step(0.002, shDz1) * step(shDz1, 0.14) * 0.82,
          step(shD2, 0.9995) * step(0.0025, shDz2) * step(shDz2, 0.22) * 0.62
        );

        // 6-Tap Multi-Scale Ground-Truth Horizon Ambient Occlusion (GTAO: tight crevices + structural cavities + exploded depth!)
        float baseAng = mix(ign * 6.2831853, noiseB * 6.2831853, isPt);
        vec3 upOrtho = abs(nView.z) < 0.92 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        vec3 tPlane = normalize(cross(upOrtho, nView));
        vec3 bPlane = cross(nView, tPlane);

        vec3 hDir0 = normalize(tPlane * cos(baseAng) + bPlane * sin(baseAng) + nView * 0.34);
        vec3 hDir1 = normalize(-tPlane * cos(baseAng) - bPlane * sin(baseAng) + nView * 0.34);
        vec3 hDir2 = normalize(tPlane * cos(baseAng + 2.0944) + bPlane * sin(baseAng + 2.0944) + nView * 0.38);
        vec3 hDir3 = normalize(-tPlane * cos(baseAng + 2.0944) - bPlane * sin(baseAng + 2.0944) + nView * 0.38);
        vec3 hDir4 = normalize(tPlane * cos(baseAng + 4.1888) + bPlane * sin(baseAng + 4.1888) + nView * 0.44);
        vec3 hDir5 = normalize(-tPlane * cos(baseAng + 4.1888) - bPlane * sin(baseAng + 4.1888) + nView * 0.44);

        vec3 gVp0 = vp + hDir0 * 0.032;
        vec3 gVp1 = vp + hDir1 * 0.052;
        vec3 gVp2 = vp + hDir2 * 0.105;
        vec3 gVp3 = vp + hDir3 * 0.155;
        vec3 gVp4 = vp + hDir4 * 0.250;
        vec3 gVp5 = vp + hDir5 * 0.340;

        float gD0 = texture2D(tDepth, viewToUv(gVp0)).r;
        float gD1 = texture2D(tDepth, viewToUv(gVp1)).r;
        float gD2 = texture2D(tDepth, viewToUv(gVp2)).r;
        float gD3 = texture2D(tDepth, viewToUv(gVp3)).r;
        float gD4 = texture2D(tDepth, viewToUv(gVp4)).r;
        float gD5 = texture2D(tDepth, viewToUv(gVp5)).r;

        float occCrevice = (
          evalHorizonOcclusion(vp, nView, gVp0, gD0, 0.09) +
          evalHorizonOcclusion(vp, nView, gVp1, gD1, 0.12)
        ) * 0.5;
        float occCavity = (
          evalHorizonOcclusion(vp, nView, gVp2, gD2, 0.24) +
          evalHorizonOcclusion(vp, nView, gVp3, gD3, 0.32)
        ) * 0.5;
        float occChassis = (
          evalHorizonOcclusion(vp, nView, gVp4, gD4, 0.48) +
          evalHorizonOcclusion(vp, nView, gVp5, gD5, 0.62)
        ) * 0.5;

        float gtaoCombined = clamp(occCrevice * 0.52 + occCavity * 0.34 + occChassis * 0.24, 0.0, 1.0);
        float aoFactor = clamp(1.0 - gtaoCombined * uGtaoIntensity, 0.16, 1.0);
        float shadowAtten = (1.0 - contactShadow * 0.44) * aoFactor;

        // Real-Time 3-Step Screen-Space Reflections (SSR) for adjacent mechanical links, calipers & holographic point clouds!
        vec3 viewInc = normalize(vp);
        vec3 ssrDir = normalize(reflect(viewInc, nView));
        float fresnelSsr = 0.06 + 0.94 * pow(1.0 - clamp(abs(dot(nView, -viewInc)), 0.0, 1.0), 3.2);

        vec3 ssrVp1 = vp + nView * 0.008 + ssrDir * 0.095;
        vec3 ssrVp2 = vp + nView * 0.008 + ssrDir * 0.235;
        vec3 ssrVp3 = vp + nView * 0.008 + ssrDir * 0.480;
        vec2 ssrUv1 = viewToUv(ssrVp1);
        vec2 ssrUv2 = viewToUv(ssrVp2);
        vec2 ssrUv3 = viewToUv(ssrVp3);

        float ssrD1 = texture2D(tDepth, ssrUv1).r;
        float ssrD2 = texture2D(tDepth, ssrUv2).r;
        float ssrD3 = texture2D(tDepth, ssrUv3).r;
        vec3 ssrC1 = texture2D(tColor, ssrUv1).rgb;
        vec3 ssrC2 = texture2D(tColor, ssrUv2).rgb;
        vec3 ssrC3 = texture2D(tColor, ssrUv3).rgb;

        float ssrDz1 = getViewPos(ssrUv1, ssrD1).z - ssrVp1.z;
        float ssrDz2 = getViewPos(ssrUv2, ssrD2).z - ssrVp2.z;
        float ssrDz3 = getViewPos(ssrUv3, ssrD3).z - ssrVp3.z;

        float ssrHit1 = step(ssrD1, 0.9993) * step(0.0018, ssrDz1) * step(ssrDz1, 0.14);
        float ssrHit2 = (1.0 - ssrHit1) * step(ssrD2, 0.9993) * step(0.002, ssrDz2) * step(ssrDz2, 0.24);
        float ssrHit3 = (1.0 - ssrHit1) * (1.0 - ssrHit2) * step(ssrD3, 0.9993) * step(0.003, ssrDz3) * step(ssrDz3, 0.38);

        vec2 edgeVig = smoothstep(vec2(0.0), vec2(0.07), ssrUv2) * (1.0 - smoothstep(vec2(0.93), vec2(1.0), ssrUv2));
        float ssrScreenFade = edgeVig.x * edgeVig.y;
        // Favor SSR on darker/metallic machined actuators & grazing rims while preventing bright white diffuse shells from washing out
        float baseLuma = dot(baseSample.rgb, vec3(0.299, 0.587, 0.114));
        float metallicReceptivity = clamp(1.12 - baseLuma * 0.95, 0.22, 1.0);
        vec3 realtimeSsr = (ssrC1 * ssrHit1 + ssrC2 * ssrHit2 * 0.85 + ssrC3 * ssrHit3 * 0.65)
          * fresnelSsr * metallicReceptivity * ssrScreenFade * 0.34;

        if (uMode == 0) {
          vec3 baseLinear = baseSample.rgb;
          // Smart Focus Macro Bokeh Depth of Field (blurs out-of-focus foreground/background around focused CAD part)
          if (uSmartBokeh > 0.5) {
            float viewDist = abs(vp.z);
            float coc = clamp(abs(viewDist - uFocusDepth) / max(0.55, uFocusDepth * 0.55) - 0.14, 0.0, 1.0);
            if (coc > 0.02) {
              vec2 dofR = texel * (2.0 + coc * 6.5);
              vec3 d1 = texture2D(tColor, clamp(vUv + vec2(dofR.x, 0.35 * dofR.y), vec2(0.002), vec2(0.998))).rgb;
              vec3 d2 = texture2D(tColor, clamp(vUv + vec2(-dofR.x, -0.35 * dofR.y), vec2(0.002), vec2(0.998))).rgb;
              vec3 d3 = texture2D(tColor, clamp(vUv + vec2(-0.35 * dofR.x, dofR.y), vec2(0.002), vec2(0.998))).rgb;
              vec3 d4 = texture2D(tColor, clamp(vUv + vec2(0.35 * dofR.x, -dofR.y), vec2(0.002), vec2(0.998))).rgb;
              baseLinear = mix(baseLinear, (d1 + d2 + d3 + d4) * 0.25, coc * 0.85);
            }
          }

          vec3 bgOut = acesFilmicAndSrgb(baseLinear + selectiveBloom * 0.65);
          vec3 surfLinear = baseLinear * shadowAtten + realtimeSsr + selectiveBloom;
          vec3 surfOut = acesFilmicAndSrgb(surfLinear);
          vec3 outCol = mix(bgOut, surfOut, isSurface);

          // Peripheral Chromatic Dispersion, Cinema Vignette, Bullet-Time Grade & Organic 35mm Film Grain
          vec2 cDir = vUv - 0.5;
          float cDist = length(cDir);
          if (uChromaticVignette > 0.5 || uImpulseVignette > 0.01) {
            float caShift = (uChromaticVignette * 0.0012 + uImpulseVignette * 0.0048) * cDist;
            float caR = acesFilmicAndSrgb(texture2D(tColor, clamp(vUv - cDir * caShift, vec2(0.002), vec2(0.998))).rgb).r;
            float caB = acesFilmicAndSrgb(texture2D(tColor, clamp(vUv + cDir * caShift, vec2(0.002), vec2(0.998))).rgb).b;
            outCol.r = mix(outCol.r, caR, 0.55);
            outCol.b = mix(outCol.b, caB, 0.55);
            float vig = 1.0 - smoothstep(0.42, 0.96, cDist) * (uChromaticVignette * 0.16 + uImpulseVignette * 0.18);
            outCol *= vig;
          }
          if (uBulletTimeActive > 0.5) {
            float lumaBt = dot(outCol, vec3(0.299, 0.587, 0.114));
            outCol = mix(vec3(lumaBt) * vec3(0.88, 0.98, 1.08), outCol, 0.76);
          }
          if (uFilmGrain > 0.002) {
            float gr = hash12(gl_FragCoord.xy + vec2(uSimTime * 47.0, uSimTime * 19.0)) - 0.5;
            outCol = clamp(outCol + gr * uFilmGrain * 0.18, 0.0, 1.0);
          }

          gl_FragColor = vec4(outCol, 1.0);
          return;
        }

        // Gear 2: Progressive 256-SPP Monte Carlo GI + Rough Metallic Inter-Reflections + Emissive Area Lights
        vec3 prevAccum = texture2D(tPrevAccum, vUv).rgb;

        float phi = noiseA * 6.2831853;
        float cosTheta = sqrt(1.0 - noiseB * 0.82);
        float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
        vec3 randLocal = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        vec3 giRayView = normalize(tPlane * randLocal.x + bPlane * randLocal.y + nView * randLocal.z);

        vec3 giVp1 = vp + nView * 0.01 + giRayView * (0.18 + noiseA * 0.24);
        vec3 giVp2 = vp + nView * 0.01 + giRayView * (0.48 + noiseB * 0.36);
        vec2 giUv1 = viewToUv(giVp1);
        vec2 giUv2 = viewToUv(giVp2);
        float gd1 = texture2D(tDepth, giUv1).r;
        float gd2 = texture2D(tDepth, giUv2).r;
        vec3 gCol1 = texture2D(tColor, giUv1).rgb;
        vec3 gCol2 = texture2D(tColor, giUv2).rgb;
        float gDz1 = getViewPos(giUv1, gd1).z - giVp1.z;
        float gDz2 = getViewPos(giUv2, gd2).z - giVp2.z;
        float gHit1 = step(gd1, 0.9994) * step(0.002, gDz1) * step(gDz1, 0.38);
        float gHit2 = (1.0 - gHit1) * step(gd2, 0.9994) * step(0.002, gDz2) * step(gDz2, 0.52);
        vec3 indirectBounce = (gCol1 * gHit1 + gCol2 * gHit2) * 0.42;

        vec3 reflDirJit = normalize(ssrDir + (giRayView - nView) * 0.068);
        vec3 rVp1 = vp + nView * 0.01 + reflDirJit * (0.22 + noiseB * 0.28);
        vec2 rUv1 = viewToUv(rVp1);
        float rd1 = texture2D(tDepth, rUv1).r;
        vec3 rCol1 = texture2D(tColor, rUv1).rgb;
        float rDz1 = getViewPos(rUv1, rd1).z - rVp1.z;
        float rMask = step(rd1, 0.9994) * step(0.002, rDz1) * step(rDz1, 0.42);
        vec3 specInterRefl = rCol1 * (0.18 + 0.42 * fresnelSsr) * metallicReceptivity * rMask + realtimeSsr * 0.55;

        vec3 worldPos = (uInvView * vec4(vp, 1.0)).xyz;
        vec3 worldNorm = normalize(mat3(uInvView) * nView);

        vec3 studioRimGi =
          vec3(0.07, 0.16, 0.26) * fresnelSsr * (0.5 + 0.5 * max(0.0, worldNorm.y)) +
          vec3(0.12, 0.09, 0.05) * max(0.0, dot(nView, softLightDir)) * 0.28;

        // Pure ALU Emissive Area Light Radiance (zero texture reads inside loop)
        vec3 emissiveBounce = vec3(0.0);
        vec3 areaJitter = vec3(noiseA - 0.5, noiseB - 0.5, (noiseA + noiseB) * 0.5 - 0.5) * 0.24;
        for (int e = 0; e < 6; e++) {
          float activeE = step(float(e) + 0.5, float(uEmissiveCount));
          vec3 lVec = (uEmissivePos[e] + areaJitter) - worldPos;
          float distSq = dot(lVec, lVec);
          float dist = sqrt(max(0.025, distSq));
          float NoL = max(0.0, dot(worldNorm, lVec / dist));
          float atten = 1.0 / (1.0 + distSq * 2.4);
          emissiveBounce += activeE * uEmissiveCol[e] * NoL * atten * 0.44;
        }

        vec2 vig = vUv - vec2(0.5, 0.54);
        vec3 ptStudioBg = acesFilmicAndSrgb(baseSample.rgb + selectiveBloom * 0.6) + vec3(0.008, 0.014, 0.022) * exp(-dot(vig, vig) * 5.2);
        vec3 ptSurface = acesFilmicAndSrgb(
          baseSample.rgb * shadowAtten * 1.04 +
            (indirectBounce + emissiveBounce) * baseSample.rgb +
            emissiveBounce * 0.30 +
            specInterRefl +
            studioRimGi +
            selectiveBloom
        );

        vec3 targetSample = mix(ptStudioBg, ptSurface, isSurface);
        vec3 nextAccum =
          mix(prevAccum, targetSample, clamp(uBlendWeight, 0.0, 1.0)) +
          (noiseB - 0.5) * (0.75 / 255.0);
        gl_FragColor = vec4(clamp(nextAccum, 0.0, 1.0), 1.0);
      }
    `
  });

  const fsQuadMesh = new THREE.Mesh(fsQuadGeo, hybridPostMat);
  fsQuadMesh.frustumCulled = false;
  postScene.add(fsQuadMesh);

  try {
    const prevTargetInit = renderer.getRenderTarget();
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.setRenderTarget(accumRTA);
    renderer.clear();
    if (!isSoftwareGl) {
      hybridPostMat.uniforms.uMode.value = 1;
      hybridPostMat.uniforms.tPrevAccum.value = accumRTA.texture;
      renderer.setRenderTarget(accumRTB);
      renderer.render(postScene, orthoCam);
      renderer.clear();
      hybridPostMat.uniforms.uMode.value = 0;
      renderer.compile(blitScene, orthoCam);
    } else {
      renderer.setRenderTarget(accumRTB);
      renderer.clear();
    }
    renderer.setRenderTarget(prevTargetInit);
  } catch {
    // Ignore optional pre-warm failure
  }

  const _tmpWorldPos = new THREE.Vector3();
  let rollingFrameMs = 14.0;

  return {
    renderFrame({
      scene,
      camera,
      keyLight,
      pathTracingEnabled,
      explosionProgress,
      clipRatio,
      poseChecksum,
      emissiveSources,
      dynamicEmissives,
      schlierenMode,
      simTime,
      cinemaOptics,
      focusDistanceMeters,
      bulletTimeScale,
      impulseVignette01,
      rawDt
    }) {
      const budget = stepFrameBudgetGuard(
        rollingFrameMs,
        rawDt ?? 0.016,
        cinemaOptics ? cinemaOptics.frameBudgetGuard : true,
        isSoftwareGl
      );
      rollingFrameMs = budget.rollingMs;

      if (cinemaOptics) {
        hybridPostMat.uniforms.uExposure.value =
          1.06 * evToLinearExposureMultiplier(cinemaOptics.exposureEv);
        hybridPostMat.uniforms.uBloomThreshold.value = cinemaOptics.bloomThreshold;
        hybridPostMat.uniforms.uBloomStrength.value = cinemaOptics.bloomStrength;
        hybridPostMat.uniforms.uAnamorphicStreak.value =
          cinemaOptics.anamorphicStreak * budget.anamorphicTapScale;
        hybridPostMat.uniforms.uSmartBokeh.value =
          cinemaOptics.smartBokehEnabled && !budget.isThrottled ? 1.0 : 0.0;
        hybridPostMat.uniforms.uFilmGrain.value = cinemaOptics.filmGrain;
        hybridPostMat.uniforms.uChromaticVignette.value = cinemaOptics.chromaticVignette ? 1.0 : 0.0;
      }
      hybridPostMat.uniforms.uFocusDepth.value = focusDistanceMeters ?? 2.4;
      hybridPostMat.uniforms.uBulletTimeActive.value =
        bulletTimeScale !== undefined && bulletTimeScale < 0.9 ? 1.0 : 0.0;
      hybridPostMat.uniforms.uImpulseVignette.value = impulseVignette01 ?? 0.0;

      camera.updateMatrixWorld();
      const sig = computeSceneStateSignature(
        camera.matrixWorld.elements,
        explosionProgress,
        clipRatio,
        poseChecksum
      );

      const samplesPerFrame = budget.isThrottled ? 4 : 8;
      const stepped = stepPathTracerAccumulatorState(
        accumState,
        pathTracingEnabled,
        sig,
        samplesPerFrame
      );
      accumState = stepped.next;

      hybridPostMat.uniforms.uProj.value.copy(camera.projectionMatrix);
      invProj.copy(camera.projectionMatrixInverse);
      invView.copy(camera.matrixWorld);
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      if (keyLight) {
        lightDirView
          .copy(keyLight.position)
          .normalize()
          .transformDirection(camera.matrixWorldInverse);
      }

      let eCount = 0;
      if (dynamicEmissives) {
        for (let i = 0; i < dynamicEmissives.length && eCount < maxEmissives; i++) {
          const de = dynamicEmissives[i];
          emissivePosArr[eCount].copy(de.pos);
          emissiveColArr[eCount].set(
            de.color.r * de.radiance,
            de.color.g * de.radiance,
            de.color.b * de.radiance
          );
          eCount++;
        }
      }
      for (let i = 0; i < emissiveSources.length && eCount < maxEmissives; i++) {
        const es = emissiveSources[i];
        if (!es.node.visible) continue;
        es.node.getWorldPosition(_tmpWorldPos);
        emissivePosArr[eCount].copy(_tmpWorldPos);
        emissiveColArr[eCount].set(
          es.color.r * es.radiance,
          es.color.g * es.radiance,
          es.color.b * es.radiance
        );
        eCount++;
      }
      hybridPostMat.uniforms.uEmissiveCount.value = eCount;
      hybridPostMat.uniforms.uSchlierenMode.value = schlierenMode ? 1 : 0;
      hybridPostMat.uniforms.uSimTime.value = simTime || 0;

      if (!pathTracingEnabled || schlierenMode) {
        renderer.setRenderTarget(sceneRT);
        renderer.clear();
        renderer.render(scene, camera);

        hybridPostMat.uniforms.tColor.value = sceneRT.texture;
        hybridPostMat.uniforms.tDepth.value = sceneRT.depthTexture;
        hybridPostMat.uniforms.uSubpixelJitter.value.set(0, 0);
        hybridPostMat.uniforms.uMode.value = 0;
        renderer.setRenderTarget(null);
        renderer.render(postScene, orthoCam);

        return { spp: 0, converged: false };
      }

      if (!stepped.didReset && accumState.converged && stepped.blendWeight === 0) {
        const readAccum = pingPong === 0 ? accumRTA : accumRTB;
        blitMat.uniforms.tAccum.value = readAccum.texture;
        renderer.setRenderTarget(null);
        renderer.render(blitScene, orthoCam);
        return { spp: accumState.spp, converged: true };
      }

      if (stepped.didReset) {
        renderer.setRenderTarget(sceneRT);
        renderer.clear();
        renderer.render(scene, camera);
      }

      const [jx, jy] = computeHaltonJitter2D(accumState.spp);
      const prevTarget = pingPong === 0 ? accumRTA : accumRTB;
      const nextTarget = pingPong === 0 ? accumRTB : accumRTA;

      hybridPostMat.uniforms.tColor.value = sceneRT.texture;
      hybridPostMat.uniforms.tDepth.value = sceneRT.depthTexture;
      hybridPostMat.uniforms.tPrevAccum.value = prevTarget.texture;
      hybridPostMat.uniforms.uSubpixelJitter.value.set(
        stepped.didReset ? 0 : jx * 0.42,
        stepped.didReset ? 0 : jy * 0.42
      );
      hybridPostMat.uniforms.uBlendWeight.value = stepped.didReset ? 1.0 : stepped.blendWeight;
      hybridPostMat.uniforms.uSampleSeed.value = accumState.spp;
      // Use fast 60fps Gear-1 shader on camera-motion/reset frames to eliminate click/glide GPU stalls;
      // accumulate Monte Carlo GI (uMode=1) on stationary frames.
      hybridPostMat.uniforms.uMode.value = stepped.didReset ? 0 : 1;

      renderer.setRenderTarget(nextTarget);
      renderer.render(postScene, orthoCam);
      pingPong = 1 - pingPong;

      blitMat.uniforms.tAccum.value = nextTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(blitScene, orthoCam);

      return { spp: accumState.spp, converged: accumState.converged };
    },

    setSize(newW: number, newH: number) {
      width = Math.max(64, Math.floor(newW));
      height = Math.max(64, Math.floor(newH));
      rtScale = computeEffectiveScale();
      const nextEffW = Math.max(64, Math.floor(width * rtScale));
      const nextEffH = Math.max(64, Math.floor(height * rtScale));
      if (nextEffW === effW && nextEffH === effH) return;

      effW = nextEffW;
      effH = nextEffH;

      sceneRT.depthTexture?.dispose();
      sceneRT.dispose();
      accumRTA.dispose();
      accumRTB.dispose();

      sceneRT = createSceneTarget(effW, effH);
      accumRTA = createAccumTarget(effW, effH);
      accumRTB = createAccumTarget(effW, effH);
      hybridPostMat.uniforms.uResolution.value.set(effW, effH);
      accumState = createPathTracerAccumulatorState(256);
    },

    resetAccumulation() {
      accumState = {
        ...accumState,
        spp: 0,
        lastSignature: Number.NaN,
        converged: false
      };
    },

    async export4KFrame(filename: string, renderCallback: () => void) {
      renderCallback();

      const outCanvas = document.createElement('canvas');
      outCanvas.width = 3840;
      outCanvas.height = 2160;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#0d1017';
      ctx.fillRect(0, 0, 3840, 2160);

      const srcW = renderer.domElement.width || 1920;
      const srcH = renderer.domElement.height || 1080;
      const scale = Math.max(3840 / srcW, 2160 / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(
        renderer.domElement,
        (3840 - drawW) * 0.5,
        (2160 - drawH) * 0.5,
        drawW,
        drawH
      );

      ctx.fillStyle = 'rgba(18, 20, 26, 0.82)';
      ctx.fillRect(3040, 2088, 760, 52);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(3040, 2088, 760, 52);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 21px monospace';
      ctx.fillText(
        `MEGA-HANGAR DIGITAL TWIN · 3840x2160 UHD · SPP ${Math.max(1, accumState.spp || 64)}`,
        3064,
        2122
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        outCanvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    },

    dispose() {
      sceneRT.depthTexture?.dispose();
      sceneRT.dispose();
      accumRTA.dispose();
      accumRTB.dispose();
      fsQuadGeo.dispose();
      hybridPostMat.dispose();
      blitMat.dispose();
    }
  };
}
