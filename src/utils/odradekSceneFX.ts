import * as THREE from 'three';
import {
  ODRADEK_GRID_COUNT,
  ODRADEK_HOVER_DURATION,
  ODRADEK_TOTAL_DURATION,
  ODRADEK_WAVE_SPEED,
  OdradekBeaconTarget,
  OdradekSampledGrid
} from './odradekScannerEngine';

export interface TerrainWavefrontUniforms {
  uOdradekActive: { value: number };
  uOdradekOrigin: { value: THREE.Vector3 };
  uOdradekElapsed: { value: number };
  uCausticsEnabled: { value: number };
  uSimTime: { value: number };
}

/**
 * Injects the Death Stranding Topographic Contour Wavefront + 0.85m Ortho Survey Grid
 * (and optional animated Deep-Sea Caustic Light Web) directly into the real Land / Seabed
 * MeshStandardMaterial via onBeforeCompile! Zero geometry duplication; zero extra draw calls.
 */
export function attachTopographicWavefrontToTerrain(
  mat: THREE.MeshStandardMaterial,
  enableCaustics: boolean = false
): TerrainWavefrontUniforms {
  const uniforms: TerrainWavefrontUniforms = {
    uOdradekActive: { value: 0.0 },
    uOdradekOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uOdradekElapsed: { value: 0.0 },
    uCausticsEnabled: { value: enableCaustics ? 1.0 : 0.0 },
    uSimTime: { value: 0.0 }
  };

  mat.customProgramCacheKey = () =>
    enableCaustics ? 'mega_hangar_odradek_terrain_caustics_v2' : 'mega_hangar_odradek_terrain_wave_v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOdradekActive = uniforms.uOdradekActive;
    shader.uniforms.uOdradekOrigin = uniforms.uOdradekOrigin;
    shader.uniforms.uOdradekElapsed = uniforms.uOdradekElapsed;
    shader.uniforms.uCausticsEnabled = uniforms.uCausticsEnabled;
    shader.uniforms.uSimTime = uniforms.uSimTime;

    shader.vertexShader =
      `varying vec3 vOdradekWorldPos;\n` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vOdradekWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader =
      `uniform float uOdradekActive;
uniform vec3 uOdradekOrigin;
uniform float uOdradekElapsed;
uniform float uCausticsEnabled;
uniform float uSimTime;
varying vec3 vOdradekWorldPos;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uCausticsEnabled > 0.5) {
          vec2 uvA = vOdradekWorldPos.xz * 0.24 + vec2(uSimTime * 0.16, -uSimTime * 0.12);
          vec2 uvB = vOdradekWorldPos.xz * 0.31 + vec2(-uSimTime * 0.14, uSimTime * 0.19);
          float w1 = abs(sin(uvA.x + sin(uvA.y * 1.4)) + cos(uvA.y + cos(uvA.x * 1.3)));
          float w2 = abs(sin(uvB.x * 1.2 - cos(uvB.y)) + cos(uvB.y * 1.3 + sin(uvB.x)));
          float causticNet = pow(clamp(1.0 - min(w1, w2) * 0.55, 0.0, 1.0), 3.6);
          float distFade = exp(-length(vOdradekWorldPos.xz) * 0.018);
          totalEmissiveRadiance += vec3(0.04, 0.42, 0.68) * causticNet * distFade * 0.85;
        }
        if (uOdradekActive > 0.5 && uOdradekElapsed > 0.001) {
          float waveR = ${ODRADEK_WAVE_SPEED.toFixed(1)} * uOdradekElapsed;
          float dXZ = distance(vOdradekWorldPos.xz, uOdradekOrigin.xz);

          // 1) Crisp Cyan-White Leading Optical Wavefront Crest
          float crestDist = abs(dXZ - waveR);
          float crestGlow = 1.0 - smoothstep(0.0, 0.48, crestDist);
          float crestCore = 1.0 - smoothstep(0.0, 0.12, crestDist);

          // 2) Subtle 7.5m Trailing Wake of Topographic Elevation Iso-Contour Lines
          float behind = waveR - dXZ;
          float wakeEnv = (behind > 0.0 && behind < 7.5) ? (1.0 - behind / 7.5) : 0.0;
          float fadeOutTail = 1.0 - smoothstep(${(ODRADEK_TOTAL_DURATION - 1.2).toFixed(1)}, ${ODRADEK_TOTAL_DURATION.toFixed(1)}, uOdradekElapsed);
          wakeEnv *= fadeOutTail;
          crestGlow *= fadeOutTail;

          float isoFract = abs(fract(vOdradekWorldPos.y * 2.6) - 0.5);
          float isoLine = 1.0 - smoothstep(0.0, 0.045, isoFract);

          vec2 orthoCell = abs(fract(vOdradekWorldPos.xz / 0.85) - 0.5);
          float orthoLine = 1.0 - smoothstep(0.0, 0.022, min(orthoCell.x, orthoCell.y));

          vec3 wakeColor = vec3(0.0, 0.78, 0.95) * (isoLine * 0.75 + orthoLine * 0.28) * wakeEnv;
          vec3 crestColor = mix(vec3(0.0, 0.88, 1.0), vec3(1.0, 1.0, 1.0), crestCore) * crestGlow * 1.85;
          totalEmissiveRadiance += wakeColor + crestColor;
        }`
      );
  };

  return uniforms;
}

export interface OdradekScannerController {
  group: THREE.Group;
  uploadGridSnapshot: (grid: OdradekSampledGrid) => void;
  updateFrame: (params: {
    active: boolean;
    scanElapsed: number;
    domain?: 'land' | 'sea' | 'air';
    camera: THREE.Camera;
    sensorWorldPos: THREE.Vector3;
    flareIntensity: number;
    beacons: OdradekBeaconTarget[];
  }) => void;
  dispose: () => void;
}

/**
 * Builds the 60fps Single-DrawCall 2,500-Instance Death Stranding Odradek Traversability Matrix
 * (🟦 Safe + 0.22m stem | 🟨△ Steep Warning + 0.35m stem | 🟥✕ Danger + 0.48m stem),
 * plus Anamorphic Horizontal Sensor Streak Flare & Chiral Target Vertical Beacon Pillars!
 * Strictly ZERO Box/Cylinder/Sphere/Cone/Capsule primitive geometries.
 */
export function createOdradekScannerController(): OdradekScannerController {
  const group = new THREE.Group();
  group.name = 'death_stranding_odradek_scanner';

  // ===========================================================================
  // 1. CUSTOM 12-VERTEX COMBINED [VERTICAL STEM + SDF HOLOGRAPHIC ICON] GEOMETRY
  // ===========================================================================
  // Part 0 (6 vertices = 2 triangles): Thin vertical stem from y=[0..1], x=[-0.5..0.5]
  // Part 1 (6 vertices = 2 triangles): Camera-facing SDF icon quad uv=[-1..1]^2 at stem top
  const positions = new Float32Array([
    // Stem Quad (aPart = 0)
    -0.5, 0.0, 0.0,
     0.5, 0.0, 0.0,
     0.5, 1.0, 0.0,
    -0.5, 0.0, 0.0,
     0.5, 1.0, 0.0,
    -0.5, 1.0, 0.0,
    // Icon Quad (aPart = 1)
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
     1.0,  1.0, 0.0,
    -1.0, -1.0, 0.0,
     1.0,  1.0, 0.0,
    -1.0,  1.0, 0.0
  ]);

  const partAttr = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);

  const pinGeo = new THREE.BufferGeometry();
  pinGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pinGeo.setAttribute('aPart', new THREE.BufferAttribute(partAttr, 1));

  const aGroundPosArr = new Float32Array(ODRADEK_GRID_COUNT * 3);
  const aPinMetaArr = new Float32Array(ODRADEK_GRID_COUNT * 3); // [tier, stemHeight, radialDist]

  const groundPosAttr = new THREE.InstancedBufferAttribute(aGroundPosArr, 3);
  const pinMetaAttr = new THREE.InstancedBufferAttribute(aPinMetaArr, 3);
  groundPosAttr.setUsage(THREE.DynamicDrawUsage);
  pinMetaAttr.setUsage(THREE.DynamicDrawUsage);

  pinGeo.setAttribute('aGroundPos', groundPosAttr);
  pinGeo.setAttribute('aPinMeta', pinMetaAttr);

  const pinUniforms = {
    uScanElapsed: { value: 0.0 },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) }
  };

  const pinMat = new THREE.ShaderMaterial({
    uniforms: pinUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec3 aGroundPos;
      attribute vec3 aPinMeta;

      uniform float uScanElapsed;
      uniform vec3 uCamRight;
      uniform vec3 uCamUp;

      varying float vPart;
      varying float vTier;
      varying vec2 vQuadUv;
      varying float vStemT;
      varying float vCrestWhite;
      varying float vAlpha;
      varying float vLocalTau;

      void main() {
        vPart = aPart;
        vTier = aPinMeta.x;
        float stemH = aPinMeta.y;
        float radialDist = aPinMeta.z;

        float arrivalT = radialDist / ${ODRADEK_WAVE_SPEED.toFixed(1)};
        float tau = uScanElapsed - arrivalT;
        vLocalTau = tau;

        if (tau <= 0.0 || tau > ${(ODRADEK_HOVER_DURATION + 1.05).toFixed(2)}) {
          gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
          vAlpha = 0.0;
          return;
        }

        // Underdamped spring pop-up from 0m -> full height when R(t) crosses cell!
        float springPop = 1.0;
        if (tau < 0.30) {
          float u = tau / 0.30;
          springPop = 1.0 - exp(-8.5 * u) * cos(16.0 * u);
        }

        // White flash right as the optical wavefront passes
        vCrestWhite = exp(-tau * 7.5);

        // Gentle 4.0s hover + radial distance attenuation so pins never clutter the horizon!
        float hoverBob = sin(tau * 3.4 + radialDist * 0.55) * 0.008;
        float dissolveStart = ${ODRADEK_HOVER_DURATION.toFixed(2)};
        float dissolveU = clamp((tau - dissolveStart) / 0.95, 0.0, 1.0);
        float distFade = 1.0 - smoothstep(13.5, 21.5, radialDist);
        vAlpha = (1.0 - smoothstep(0.55, 1.0, dissolveU)) * distFade;

        float curTopY = aGroundPos.y + stemH * springPop + hoverBob;
        float curBotY = mix(aGroundPos.y, curTopY, clamp(dissolveU * 1.25, 0.0, 1.0));

        vec3 worldPos;
        if (aPart < 0.5) {
          // Hairline vertical holographic stem (0.011m thin)
          vStemT = position.y;
          vQuadUv = vec2(position.x * 2.0, position.y);
          float yVal = mix(curBotY, curTopY, position.y);
          worldPos = vec3(aGroundPos.x, yVal, aGroundPos.z) + uCamRight * (position.x * 0.011);
        } else {
          // ~65% smaller crisp Death Stranding micro-reticle (0.08m ~ 0.11m diameter)
          vStemT = 1.0;
          vQuadUv = position.xy;
          float iconHalfSize = (vTier > 1.5 ? 0.058 : (vTier > 0.5 ? 0.052 : 0.038)) * min(1.12, springPop);
          vec3 iconCenter = vec3(aGroundPos.x, curTopY + iconHalfSize * 0.95, aGroundPos.z);
          worldPos = iconCenter + uCamRight * (position.x * iconHalfSize) + uCamUp * (position.y * iconHalfSize);
        }

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vPart;
      varying float vTier;
      varying vec2 vQuadUv;
      varying float vStemT;
      varying float vCrestWhite;
      varying float vAlpha;
      varying float vLocalTau;

      // Inigo Quilez exact Equilateral Triangle SDF for Yellow Warning △
      float sdEquilateralTriangle(vec2 p, float r) {
        const float k = 1.7320508;
        p.x = abs(p.x) - r;
        p.y = p.y + r / k;
        if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
        p.x -= clamp(p.x, -2.0 * r, 0.0);
        return -length(p) * sign(p.y);
      }

      void main() {
        if (vAlpha <= 0.005) discard;

        vec3 colBlue = vec3(0.0, 0.898, 1.0);     // #00e5ff Safe Traversable
        vec3 colYellow = vec3(1.0, 0.745, 0.043); // #ffbe0b Steep Slope Warning △
        vec3 colRed = vec3(1.0, 0.165, 0.294);    // #ff2a4b Obstacle / Cliff Danger ✕

        vec3 baseCol = vTier < 0.5 ? colBlue : (vTier < 1.5 ? colYellow : colRed);
        float tierWeight = vTier < 0.5 ? 0.36 : (vTier < 1.5 ? 0.50 : 0.58);

        if (vPart < 0.5) {
          float coreX = 1.0 - smoothstep(0.0, 0.92, abs(vQuadUv.x));
          float stemGrad = 0.22 + 0.78 * vStemT;
          vec3 finalStem = mix(baseCol, vec3(1.0), vCrestWhite * 0.75);
          gl_FragColor = vec4(finalStem * 1.25, coreX * stemGrad * vAlpha * tierWeight * 0.75);
          return;
        }

        // Analytical Thin-Line Holographic Micro-Reticle SDF
        vec2 p = vQuadUv;
        float mask = 0.0;

        if (vTier < 0.5) {
          // Tier 0: Subtle Cyan Micro-Pip + Hairline Corner Frame
          vec2 dBox = abs(p) - vec2(0.52);
          float boxSdf = max(dBox.x, dBox.y);
          float frame = 1.0 - smoothstep(0.0, 0.095, abs(boxSdf));
          float pip = 1.0 - smoothstep(0.0, 0.18, length(p));
          mask = max(frame * 0.65, pip);
        } else if (vTier < 1.5) {
          // Tier 1: Thin Hollow Equilateral Warning Triangle △
          float triSdf = sdEquilateralTriangle(vec2(p.x, p.y - 0.06), 0.66);
          mask = 1.0 - smoothstep(0.0, 0.105, abs(triSdf));
        } else {
          // Tier 2: Crisp Thin Crimson Cross ✕
          vec2 rp = vec2((p.x - p.y) * 0.70710678, (p.x + p.y) * 0.70710678);
          float armA = max(abs(rp.x) - 0.11, abs(rp.y) - 0.72);
          float armB = max(abs(rp.y) - 0.11, abs(rp.x) - 0.72);
          float crossSdf = min(armA, armB);
          mask = 1.0 - smoothstep(0.0, 0.085, crossSdf);
        }

        if (mask < 0.04) discard;

        vec3 iconCol = mix(baseCol * 1.35, vec3(1.0, 1.0, 1.0), vCrestWhite * 0.85);
        gl_FragColor = vec4(iconCol, mask * vAlpha * tierWeight);
      }
    `
  });

  const instancedPins = new THREE.InstancedMesh(pinGeo, pinMat, ODRADEK_GRID_COUNT);
  instancedPins.frustumCulled = false;
  instancedPins.renderOrder = 8;
  instancedPins.visible = false;
  // Identity instance matrices (world placement is handled 100% via aGroundPos in vertex shader!)
  const ident = new THREE.Matrix4();
  for (let i = 0; i < ODRADEK_GRID_COUNT; i++) {
    instancedPins.setMatrixAt(i, ident);
  }
  instancedPins.instanceMatrix.needsUpdate = true;
  group.add(instancedPins);

  // ===========================================================================
  // 2. ANAMORPHIC HORIZONTAL SENSOR LENS STREAK FLARE (CUSTOM QUAD GEOMETRY)
  // ===========================================================================
  const flarePos = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1, -1, 0,
     1,  1, 0,
    -1,  1, 0
  ]);
  const flareGeo = new THREE.BufferGeometry();
  flareGeo.setAttribute('position', new THREE.BufferAttribute(flarePos, 3));

  const flareUniforms = {
    uFlareIntensity: { value: 0.0 },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) }
  };

  const flareMat = new THREE.ShaderMaterial({
    uniforms: flareUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uFlareIntensity;
      uniform vec3 uCamRight;
      uniform vec3 uCamUp;
      varying vec2 vUv;
      void main() {
        vUv = position.xy;
        float w = 2.65 * (0.55 + 0.45 * uFlareIntensity);
        float h = 0.24 * (0.45 + 0.55 * uFlareIntensity);
        vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 worldP = center + uCamRight * (position.x * w) + uCamUp * (position.y * h);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldP, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFlareIntensity;
      varying vec2 vUv;
      void main() {
        float horizStreak = exp(-abs(vUv.y) * 9.5) * exp(-abs(vUv.x) * 2.1);
        float coreStar = exp(-length(vUv * vec2(3.5, 1.8)) * 3.8);
        float glow = (horizStreak * 1.25 + coreStar * 1.4) * uFlareIntensity;
        if (glow < 0.01) discard;
        vec3 col = mix(vec3(0.0, 0.88, 1.0), vec3(1.0, 1.0, 1.0), clamp(coreStar * 1.3, 0.0, 1.0));
        gl_FragColor = vec4(col * 2.2, clamp(glow, 0.0, 1.0));
      }
    `
  });
  const anamorphicFlareMesh = new THREE.Mesh(flareGeo, flareMat);
  anamorphicFlareMesh.frustumCulled = false;
  anamorphicFlareMesh.renderOrder = 12;
  anamorphicFlareMesh.visible = false;
  group.add(anamorphicFlareMesh);

  // ===========================================================================
  // 3. CHIRAL VERTICAL TARGET BEACON PILLARS (POOL OF 8 CUSTOM CROSSED RIBBONS)
  // ===========================================================================
  const MAX_BEACONS = 8;
  const beaconPillars: {
    root: THREE.Group;
    mat: THREE.ShaderMaterial;
    ringLoop: THREE.LineLoop;
    ringMat: THREE.LineBasicMaterial;
  }[] = [];

  // Crossed vertical ribbon quad geometry (2 orthogonal vertical planes from y=0..1, 100% custom BufferGeometry!)
  const pillarVerts = new Float32Array([
    // Plane X
    -0.22, 0.0, 0.0,  0.22, 0.0, 0.0,  0.22, 1.0, 0.0,
    -0.22, 0.0, 0.0,  0.22, 1.0, 0.0, -0.22, 1.0, 0.0,
    // Plane Z
     0.0, 0.0, -0.22, 0.0, 0.0,  0.22, 0.0, 1.0,  0.22,
     0.0, 0.0, -0.22, 0.0, 1.0,  0.22, 0.0, 1.0, -0.22
  ]);
  const pillarUvs = new Float32Array([
    -1, 0,  1, 0,  1, 1,  -1, 0,  1, 1, -1, 1,
    -1, 0,  1, 0,  1, 1,  -1, 0,  1, 1, -1, 1
  ]);
  const sharedPillarGeo = new THREE.BufferGeometry();
  sharedPillarGeo.setAttribute('position', new THREE.BufferAttribute(pillarVerts, 3));
  sharedPillarGeo.setAttribute('uv', new THREE.BufferAttribute(pillarUvs, 2));

  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.85, 0.08, Math.sin(a) * 0.85));
  }
  const sharedBeaconRingGeo = new THREE.BufferGeometry().setFromPoints(ringPts);

  for (let i = 0; i < MAX_BEACONS; i++) {
    const bRoot = new THREE.Group();
    bRoot.visible = false;

    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xfbbf24) },
        uOpacity: { value: 0.85 },
        uTime: { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUvP;
        void main() {
          vUvP = uv;
          vec3 p = position;
          p.y *= 11.5; // 11.5m tall Chiral sky beam!
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUvP;
        void main() {
          float core = exp(-abs(vUvP.x) * 3.6);
          float vertFade = (1.0 - smoothstep(0.15, 1.0, vUvP.y)) * smoothstep(0.0, 0.04, vUvP.y);
          float scanStream = 0.72 + 0.28 * sin(vUvP.y * 28.0 - uTime * 7.5);
          float alpha = core * vertFade * scanStream * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.45) * 1.8, alpha);
        }
      `
    });
    const pMesh = new THREE.Mesh(sharedPillarGeo, pMat);
    pMesh.frustumCulled = false;
    bRoot.add(pMesh);

    const rMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const rLoop = new THREE.LineLoop(sharedBeaconRingGeo, rMat);
    bRoot.add(rLoop);

    group.add(bRoot);
    beaconPillars.push({ root: bRoot, mat: pMat, ringLoop: rLoop, ringMat: rMat });
  }

  // 4. 3D Spherical Atmospheric Radar Wave Rings for Air Domain (3 orthogonal expanding LineLoops)
  const airWaveGroup = new THREE.Group();
  airWaveGroup.visible = false;
  const airWavePts: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    airWavePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const airWaveGeo = new THREE.BufferGeometry().setFromPoints(airWavePts);
  const airWaveMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const airLoopXZ = new THREE.LineLoop(airWaveGeo, airWaveMat);
  const airLoopXY = new THREE.LineLoop(airWaveGeo, airWaveMat);
  airLoopXY.rotation.x = Math.PI * 0.5;
  const airLoopYZ = new THREE.LineLoop(airWaveGeo, airWaveMat);
  airLoopYZ.rotation.z = Math.PI * 0.5;
  airWaveGroup.add(airLoopXZ, airLoopXY, airLoopYZ);
  group.add(airWaveGroup);

  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();

  const uploadGridSnapshot = (grid: OdradekSampledGrid) => {
    aGroundPosArr.set(grid.worldPositions);
    for (let i = 0; i < ODRADEK_GRID_COUNT; i++) {
      const m3 = i * 3;
      aPinMetaArr[m3] = grid.tiers[i];
      aPinMetaArr[m3 + 1] = grid.stemHeights[i];
      aPinMetaArr[m3 + 2] = grid.radialDistances[i];
    }
    groundPosAttr.needsUpdate = true;
    pinMetaAttr.needsUpdate = true;
  };

  const updateFrame: OdradekScannerController['updateFrame'] = ({
    active,
    scanElapsed,
    domain = 'land',
    camera,
    sensorWorldPos,
    flareIntensity,
    beacons
  }) => {
    if (!active || scanElapsed <= 0 || scanElapsed > ODRADEK_TOTAL_DURATION) {
      instancedPins.visible = false;
      airWaveGroup.visible = false;
      anamorphicFlareMesh.visible = false;
      for (const bp of beaconPillars) bp.root.visible = false;
      return;
    }

    camera.updateMatrixWorld();
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    if (domain === 'air') {
      // Strict Airspace Isolation: ZERO ground pins in mid-air; expand clean 3D spherical radar wave!
      instancedPins.visible = false;
      if (scanElapsed < 1.8) {
        airWaveGroup.visible = true;
        airWaveGroup.position.copy(sensorWorldPos);
        const r = Math.max(0.5, scanElapsed * 28.0);
        airWaveGroup.scale.setScalar(r);
        airWaveGroup.rotation.y = scanElapsed * 0.8;
        airWaveMat.opacity = Math.max(0, (1.0 - scanElapsed / 1.8) * 0.48);
      } else {
        airWaveGroup.visible = false;
      }
    } else {
      airWaveGroup.visible = false;
      instancedPins.visible = true;
      pinUniforms.uScanElapsed.value = scanElapsed;
      pinUniforms.uCamRight.value.copy(_camRight);
      pinUniforms.uCamUp.value.copy(_camUp);
    }

    if (flareIntensity > 0.01) {
      anamorphicFlareMesh.visible = true;
      anamorphicFlareMesh.position.copy(sensorWorldPos);
      flareUniforms.uFlareIntensity.value = flareIntensity;
      flareUniforms.uCamRight.value.copy(_camRight);
      flareUniforms.uCamUp.value.copy(_camUp);
    } else {
      anamorphicFlareMesh.visible = false;
    }

    const tailFade =
      scanElapsed > ODRADEK_TOTAL_DURATION - 1.1
        ? Math.max(0, (ODRADEK_TOTAL_DURATION - scanElapsed) / 1.1)
        : 1.0;

    for (let i = 0; i < MAX_BEACONS; i++) {
      const bp = beaconPillars[i];
      if (i < beacons.length) {
        const tgt = beacons[i];
        bp.root.visible = true;
        bp.root.position.set(tgt.x, tgt.y, tgt.z);
        const colHex = tgt.category === 'wingman' || tgt.category === 'sonar_beacon' || domain === 'air' ? 0x38bdf8 : 0xfbbf24;
        bp.mat.uniforms.uColor.value.setHex(colHex);
        bp.mat.uniforms.uOpacity.value = 0.68 * tailFade;
        bp.mat.uniforms.uTime.value = scanElapsed;
        bp.ringMat.color.setHex(colHex);
        bp.ringMat.opacity = 0.65 * tailFade;
        const pulseScale = 0.85 + 0.25 * Math.sin(scanElapsed * 4.5 + i);
        bp.ringLoop.scale.set(pulseScale, 1, pulseScale);
      } else {
        bp.root.visible = false;
      }
    }
  };

  const dispose = () => {
    pinGeo.dispose();
    pinMat.dispose();
    flareGeo.dispose();
    flareMat.dispose();
    airWaveGeo.dispose();
    airWaveMat.dispose();
    sharedPillarGeo.dispose();
    sharedBeaconRingGeo.dispose();
    for (const bp of beaconPillars) {
      bp.mat.dispose();
      bp.ringMat.dispose();
    }
  };

  return { group, uploadGridSnapshot, updateFrame, dispose };
}
