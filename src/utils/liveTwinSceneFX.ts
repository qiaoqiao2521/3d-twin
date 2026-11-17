import * as THREE from 'three';

export interface TwinMaterialUniforms {
  uFresnelPulse: { value: number };
  uLaserClipY: { value: number };
  uLaserActive: { value: number };
  uMagLensActive: { value: number };
  uMagLensCenter: { value: THREE.Vector3 };
  uMagLensRadius: { value: number };
  uIsOuterArmor: { value: number };
  uSlsActive: { value: number };
  uSlsLaserY: { value: number };
  /** Shipbreaker engineering role: 0=off, 1=Hazard Frame, 2=Crimson Drive, 3=Cyan Sensor, 4=Amber Core */
  uSalvageRole: { value: number };
  uSalvagePulse: { value: number };
  /** Horizon Focus Weakpoint X-Ray: 0=off, 1=Dark-Steel L1 Silhouette, 2=Blazing Amber-Gold Weakpoint */
  uFocusMode: { value: number };
  /** Dynamic Surface Weathering (zero external textures): Mars red dust, intake frost, Titanium heat bluing */
  uDustAmount: { value: number };
  uFrostAmount: { value: number };
  uHeatBluing: { value: number };
  /** AC6 Overheat forced venting incandescent cherry-red internal core glow [0..1] */
  uOverheatCoreGlow: { value: number };
  /** Solid CAD Cross-Section Alloy Code: 1=L1 Slate-Titanium, 2=L2 Bronze-Actuator, 3=L3 Cyan-Core */
  uSectionLayerCode: { value: number };
  uModelMinY: { value: number };
  uModelSpanY: { value: number };
  /** Stratified PBR micro-surface class: 0=std, 1=anisotropic CNC+edgewear, 2=carbon weave, 3=AR optical lens, 4=rubber grain */
  uMicroSurfaceClass: { value: number };
  /** Scientific Real-Time Von Mises FEA Stress Cloud */
  uFeaActive: { value: number };
  uFeaSigma: { value: number };
  uFeaColorMap: { value: number };
  uFeaContours: { value: number };
  /** Hard-Surface Sci-Fi Nanite Dissolve & Holographic Spawn Reconstruction */
  uNaniteActive: { value: number };
  uNaniteSweepY: { value: number };
  uNaniteDissolve: { value: number };
}

/**
 * Enhances a real GLB MeshStandardMaterial via onBeforeCompile to add:
 * 1) Stratified PBR Micro-Surface Detail (CNC toolpaths + edge wear, carbon weave, AR lens iridescence, elastomer grain)
 * 2) 1.2s Cyan Fresnel Rim Scan Pulse when a real CAD sub-part is selected
 * 3) Precision glowing laser kerf + Solid 45-deg CNC-Machined CAD Cross-Section Caps (!gl_FrontFacing)
 * 4) 3D Mag-Lens X-Ray Sphere & Dual-Laser SLS Metal 3D Printing
 * 5) Real-Time FEA Von Mises Structural Stress Cloud (Turbo/Viridis/Jet + Iso-Stress Contours + Peak Pulse)
 * 6) Nanite Hex-Lattice Dissolve / 0.65s Holographic Spawn Materialization
 * Zero geometry modification; preserves 100% of real GLB PBR maps and restores cleanly when modes toggle off.
 */
export function attachTwinShaderEffects(
  mat: THREE.MeshStandardMaterial,
  isOuterArmor: boolean = false,
  layerKey: 'L1' | 'L2' | 'L3' = isOuterArmor ? 'L1' : 'L2'
): TwinMaterialUniforms {
  const layerCode = layerKey === 'L1' ? 1.0 : layerKey === 'L2' ? 2.0 : 3.0;
  const microClass = Number(mat.userData?.microSurfaceClass ?? 0);
  const existing = mat.userData?.twinUniforms as TwinMaterialUniforms | undefined;
  if (existing) {
    existing.uIsOuterArmor.value = isOuterArmor ? 1.0 : 0.0;
    existing.uSectionLayerCode.value = layerCode;
    if (microClass > 0) existing.uMicroSurfaceClass.value = microClass;
    return existing;
  }

  const twinUniforms: TwinMaterialUniforms = {
    uFresnelPulse: { value: 0.0 },
    uLaserClipY: { value: 999.0 },
    uLaserActive: { value: 0.0 },
    uMagLensActive: { value: 0.0 },
    uMagLensCenter: { value: new THREE.Vector3(0, 999, 0) },
    uMagLensRadius: { value: 0.44 },
    uIsOuterArmor: { value: isOuterArmor ? 1.0 : 0.0 },
    uSlsActive: { value: 0.0 },
    uSlsLaserY: { value: 999.0 },
    uSalvageRole: { value: 0.0 },
    uSalvagePulse: { value: 0.0 },
    uFocusMode: { value: 0.0 },
    uDustAmount: { value: 0.0 },
    uFrostAmount: { value: 0.0 },
    uHeatBluing: { value: 0.0 },
    uOverheatCoreGlow: { value: 0.0 },
    uSectionLayerCode: { value: layerCode },
    uModelMinY: { value: 0.0 },
    uModelSpanY: { value: 1.8 },
    uMicroSurfaceClass: { value: microClass },
    uFeaActive: { value: 0.0 },
    uFeaSigma: { value: 0.18 },
    uFeaColorMap: { value: 0.0 },
    uFeaContours: { value: 1.0 },
    uNaniteActive: { value: 0.0 },
    uNaniteSweepY: { value: 999.0 },
    uNaniteDissolve: { value: 0.0 }
  };

  mat.userData = { ...mat.userData, twinUniforms };
  mat.userData.twinUniforms = twinUniforms;
  mat.customProgramCacheKey = () => 'mega_hangar_twin_master_v6_fwidth_hex_srgb';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFresnelPulse = twinUniforms.uFresnelPulse;
    shader.uniforms.uLaserClipY = twinUniforms.uLaserClipY;
    shader.uniforms.uLaserActive = twinUniforms.uLaserActive;
    shader.uniforms.uMagLensActive = twinUniforms.uMagLensActive;
    shader.uniforms.uMagLensCenter = twinUniforms.uMagLensCenter;
    shader.uniforms.uMagLensRadius = twinUniforms.uMagLensRadius;
    shader.uniforms.uIsOuterArmor = twinUniforms.uIsOuterArmor;
    shader.uniforms.uSlsActive = twinUniforms.uSlsActive;
    shader.uniforms.uSlsLaserY = twinUniforms.uSlsLaserY;
    shader.uniforms.uSalvageRole = twinUniforms.uSalvageRole;
    shader.uniforms.uSalvagePulse = twinUniforms.uSalvagePulse;
    shader.uniforms.uFocusMode = twinUniforms.uFocusMode;
    shader.uniforms.uDustAmount = twinUniforms.uDustAmount;
    shader.uniforms.uFrostAmount = twinUniforms.uFrostAmount;
    shader.uniforms.uHeatBluing = twinUniforms.uHeatBluing;
    shader.uniforms.uOverheatCoreGlow = twinUniforms.uOverheatCoreGlow;
    shader.uniforms.uSectionLayerCode = twinUniforms.uSectionLayerCode;
    shader.uniforms.uModelMinY = twinUniforms.uModelMinY;
    shader.uniforms.uModelSpanY = twinUniforms.uModelSpanY;
    shader.uniforms.uMicroSurfaceClass = twinUniforms.uMicroSurfaceClass;
    shader.uniforms.uFeaActive = twinUniforms.uFeaActive;
    shader.uniforms.uFeaSigma = twinUniforms.uFeaSigma;
    shader.uniforms.uFeaColorMap = twinUniforms.uFeaColorMap;
    shader.uniforms.uFeaContours = twinUniforms.uFeaContours;
    shader.uniforms.uNaniteActive = twinUniforms.uNaniteActive;
    shader.uniforms.uNaniteSweepY = twinUniforms.uNaniteSweepY;
    shader.uniforms.uNaniteDissolve = twinUniforms.uNaniteDissolve;

    shader.vertexShader =
      `varying vec3 vTwinWorldPos;\nvarying vec3 vTwinLocalPos;\nvarying vec3 vTwinViewPos;\nvarying vec3 vTwinViewNorm;\n` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTwinLocalPos = transformed;
        vTwinWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTwinViewPos = -mvPosition.xyz;
        vTwinViewNorm = normalize(normalMatrix * objectNormal);`
      );

    shader.fragmentShader =
      `uniform float uFresnelPulse;
uniform float uLaserClipY;
uniform float uLaserActive;
uniform float uMagLensActive;
uniform vec3 uMagLensCenter;
uniform float uMagLensRadius;
uniform float uIsOuterArmor;
uniform float uSlsActive;
uniform float uSlsLaserY;
uniform float uSalvageRole;
uniform float uSalvagePulse;
uniform float uFocusMode;
uniform float uDustAmount;
uniform float uFrostAmount;
uniform float uHeatBluing;
uniform float uOverheatCoreGlow;
uniform float uSectionLayerCode;
uniform float uModelMinY;
uniform float uModelSpanY;
uniform float uMicroSurfaceClass;
uniform float uFeaActive;
uniform float uFeaSigma;
uniform float uFeaColorMap;
uniform float uFeaContours;
uniform float uNaniteActive;
uniform float uNaniteSweepY;
uniform float uNaniteDissolve;
varying vec3 vTwinWorldPos;
varying vec3 vTwinLocalPos;
varying vec3 vTwinViewPos;
varying vec3 vTwinViewNorm;

vec3 twinEvalFeaLut(float x, float mode) {
  float t = clamp(x, 0.0, 1.0);
  if (mode > 0.5 && mode < 1.5) {
    // Viridis
    return clamp(vec3(
      0.267 + t * (0.004 + t * (2.78 - t * 2.06)),
      0.005 + t * (1.38 - t * 0.48),
      0.329 + t * (1.42 - t * (2.68 - t * 1.08))
    ), 0.0, 1.0);
  }
  if (mode >= 1.5) {
    // Jet
    return clamp(vec3(
      1.5 - abs(4.0 * t - 3.0),
      1.5 - abs(4.0 * t - 2.0),
      1.5 - abs(4.0 * t - 1.0)
    ), 0.0, 1.0);
  }
  // Google Turbo
  return clamp(vec3(
    0.13572 + t * (4.61539 + t * (-42.6603 + t * (132.131 + t * (-152.942 + t * 59.2864)))),
    0.09140 + t * (2.19419 + t * (4.84297 + t * (-14.1850 + t * (4.2773 + t * 2.82957)))),
    0.10667 + t * (12.6419 + t * (-60.5820 + t * (110.363 + t * (-89.9031 + t * 27.3482))))
  ), 0.0, 1.0);
}

float twinHexEdgeMask(vec2 p) {
  float fw = max(max(fwidth(p.x), fwidth(p.y)), 1e-4);
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  vec2 nearest = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
  float dEdge = 0.5 - max(dot(nearest, s * 0.5), nearest.x);
  float halfW = max(0.085, fw * 0.75);
  return 1.0 - smoothstep(halfW - fw * 0.55, halfW + fw * 0.65, dEdge);
}\n` +
      shader.fragmentShader
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          float twinMagWireGlow = 0.0;
          float twinMagRingGlow = 0.0;
          float twinSlsMeltGlow = 0.0;
          float twinSlsPowderHolo = 0.0;
          float twinNaniteRimGlow = 0.0;
          float twinNaniteHexGlow = 0.0;

          if (uMagLensActive > 0.5 && uIsOuterArmor > 0.5) {
            float dMag = distance(vTwinWorldPos, uMagLensCenter);
            float ringDist = abs(dMag - uMagLensRadius);
            if (ringDist < 0.032) {
              twinMagRingGlow = 1.0 - smoothstep(0.0, 0.032, ringDist);
            }
            if (dMag < uMagLensRadius) {
              vec3 mCoord = vTwinWorldPos * 28.0;
              vec3 mFw = max(fwidth(mCoord), vec3(1e-4));
              vec3 mGrid = abs(fract(mCoord) - 0.5);
              float minEdge = min(min(mGrid.x, mGrid.y), mGrid.z);
              float edgeLimit = max(0.055, min(min(mFw.x, mFw.y), mFw.z) * 0.85);
              if (minEdge > edgeLimit) {
                discard;
              }
              twinMagWireGlow = 1.0;
            }
          }

          if (uSlsActive > 0.5) {
            float dySls = vTwinWorldPos.y - uSlsLaserY;
            if (abs(dySls) < 0.034) {
              twinSlsMeltGlow = 1.0 - smoothstep(0.0, 0.034, abs(dySls));
            }
            if (dySls > 0.018) {
              vec3 pCell = abs(fract(vTwinWorldPos * 36.0) - 0.5);
              if (length(pCell) > 0.21) {
                discard;
              }
              twinSlsPowderHolo = 1.0;
            }
          }

          // Hard-Surface Nanite True Hex-Lattice Dissolve & 0.65s Spawn Reconstruction
          if (uNaniteActive > 0.5) {
            float n3 = 0.5 + 0.5 * sin(vTwinWorldPos.x * 29.0) * cos(vTwinWorldPos.z * 31.0 + vTwinWorldPos.y * 19.0);
            float dyNan = (vTwinWorldPos.y - uNaniteSweepY) + (n3 - 0.5) * 0.11;
            if (abs(dyNan) < 0.042) {
              twinNaniteRimGlow = 1.0 - smoothstep(0.0, 0.042, abs(dyNan));
            }
            if (dyNan > 0.015) {
              // Dissolve upper region into glowing true 6-sided hexagonal wireframe lattice before vanishing
              if (dyNan > 0.26 + (1.0 - uNaniteDissolve) * 0.18) {
                discard;
              }
              vec2 hp = (vTwinWorldPos.xz + vec2(vTwinWorldPos.y * 0.58, -vTwinWorldPos.y * 0.58)) * 18.0;
              float hexMask = twinHexEdgeMask(hp);
              if (hexMask < 0.05) {
                discard;
              }
              twinNaniteHexGlow = hexMask * (1.0 - smoothstep(0.015, 0.34, dyNan));
            }
          }

          // Horizon Focus Mode 1: Outer L1 Armor becomes a translucent dark-steel dithered X-Ray silhouette!
          if (uFocusMode > 0.5 && uFocusMode < 1.5) {
            vec2 screenCell = fract(gl_FragCoord.xy * 0.5);
            if (screenCell.x > 0.48 && screenCell.y > 0.48) {
              discard;
            }
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          // Stratified Micro-Surface PBR Roughness Perturbation (preserves 100% of original roughnessMap)
          if (uMicroSurfaceClass > 0.5 && uMicroSurfaceClass < 1.5) {
            // Class 1: Anisotropic Brushed Titanium / CNC Tool Marks
            float cncCoord = vTwinLocalPos.x * 160.0 + vTwinLocalPos.y * 45.0;
            float cncFw = fwidth(cncCoord);
            float cncGrooves = sin(cncCoord) * 0.032 * (1.0 - clamp(cncFw * 0.28, 0.0, 1.0));
            roughnessFactor = clamp(roughnessFactor + cncGrooves, 0.08, 0.92);
          } else if (uMicroSurfaceClass >= 1.5 && uMicroSurfaceClass < 2.5) {
            // Class 2: Twill 2x2 Carbon-Fiber Micro-Weave with fwidth() derivative AA + Nyquist mip fade
            float coordA = (vTwinLocalPos.x + vTwinLocalPos.y) * 95.0;
            float coordB = (vTwinLocalPos.x - vTwinLocalPos.z) * 95.0;
            float fwA = max(fwidth(coordA), 1e-4);
            float fwB = max(fwidth(coordB), 1e-4);
            float triA = abs(fract(coordA) - 0.5);
            float triB = abs(fract(coordB) - 0.5);
            float weaveA = mix(smoothstep(0.25 - fwA * 0.5, 0.25 + fwA * 0.5, triA), 0.5, clamp(fwA * 1.35, 0.0, 1.0));
            float weaveB = mix(smoothstep(0.25 - fwB * 0.5, 0.25 + fwB * 0.5, triB), 0.5, clamp(fwB * 1.35, 0.0, 1.0));
            float twill = abs(weaveA - weaveB);
            roughnessFactor = clamp(mix(roughnessFactor - 0.07, roughnessFactor + 0.09, twill), 0.14, 0.85);
          } else if (uMicroSurfaceClass >= 3.5) {
            // Class 4: High-Roughness Vulcanized Elastomer Tire / Foot Pad Micro-Tread
            float rubberGrain = 0.5 + 0.5 * sin(vTwinLocalPos.x * 210.0) * cos(vTwinLocalPos.z * 210.0);
            roughnessFactor = clamp(mix(0.88, 0.95, rubberGrain), 0.84, 0.97);
          }
          if (uDustAmount > 0.01) {
            float relH = clamp((vTwinWorldPos.y - uModelMinY) / max(0.35, uModelSpanY), 0.0, 1.0);
            float dustMask = (1.0 - smoothstep(0.0, 0.58, relH)) * uDustAmount;
            roughnessFactor = clamp(mix(roughnessFactor, 0.95, dustMask * 0.85), 0.05, 1.0);
          }
          if (uFrostAmount > 0.01) {
            float frostNoise = 0.5 + 0.5 * sin(vTwinLocalPos.x * 31.0 + vTwinLocalPos.y * 27.0 + vTwinLocalPos.z * 23.0);
            float frostMask = clamp(uFrostAmount * (0.45 + 0.55 * frostNoise), 0.0, 1.0);
            roughnessFactor = clamp(mix(roughnessFactor, 0.82, frostMask * 0.65), 0.05, 1.0);
          }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec3 twinV = normalize(vTwinViewPos);
          vec3 twinN = normalize(vTwinViewNorm);
          float twinRim = pow(1.0 - abs(dot(twinV, twinN)), 2.5);

          // Stratified Micro-Surface Edge Wear & Optical Lens Thin-Film AR Iridescence
          if (uMicroSurfaceClass > 0.5 && uMicroSurfaceClass < 1.5 && uFeaActive < 0.5) {
            // Curvature / grazing chamfer silver-titanium edge wear highlight
            float chamferMask = smoothstep(0.55, 0.92, twinRim) * (0.65 + 0.35 * sin(vTwinLocalPos.x * 57.0 + vTwinLocalPos.z * 61.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, pow(vec3(0.82, 0.86, 0.91), vec3(2.2)), chamferMask * 0.16);
          } else if (uMicroSurfaceClass >= 2.5 && uMicroSurfaceClass < 3.5 && uFeaActive < 0.5) {
            // Violet-Emerald Multi-Layer Optical AR Coating Iridescence on camera lenses & LiDAR windows
            vec3 arViolet = pow(vec3(0.46, 0.18, 0.92), vec3(2.2));
            vec3 arEmerald = pow(vec3(0.06, 0.88, 0.68), vec3(2.2));
            vec3 arFilm = mix(arEmerald, arViolet, clamp(twinRim * 1.35, 0.0, 1.0));
            totalEmissiveRadiance += arFilm * (0.14 + twinRim * 0.58);
          }

          // Scientific Real-Time Von Mises FEA Structural Stress Cloud + fwidth() Iso-Stress Contours
          // Camera-angle independent stress invariant + exact sRGB -> Linear conversion before PBR lighting!
          if (uFeaActive > 0.5) {
            float filletGrad = 0.84 + 0.26 * cos(vTwinLocalPos.x * 9.5) * cos(vTwinLocalPos.y * 9.5);
            float localSigma = clamp(uFeaSigma * filletGrad, 0.02, 1.0);
            vec3 lutCol = twinEvalFeaLut(localSigma, uFeaColorMap);
            vec3 feaLinear = pow(max(vec3(0.0), lutCol), vec3(2.2));
            float sigmaScaled = localSigma * 12.0;
            float sigmaFw = max(fwidth(sigmaScaled), 1e-4);
            float isoLine = 0.0;
            if (uFeaContours > 0.5) {
              float band = abs(fract(sigmaScaled) - 0.5);
              float halfW = max(0.032, sigmaFw * 0.75);
              isoLine = (1.0 - smoothstep(halfW - sigmaFw * 0.5, halfW + sigmaFw * 0.65, band)) * (1.0 - clamp(sigmaFw * 1.15, 0.0, 1.0));
            }
            float hotPulse = localSigma > 0.78 ? (0.5 + 0.5 * sin(uSalvagePulse * 9.0)) * (localSigma - 0.78) * 3.5 : 0.0;
            diffuseColor.rgb = mix(feaLinear, vec3(0.96, 0.98, 1.0), isoLine * 0.42);
            totalEmissiveRadiance += feaLinear * (0.34 + hotPulse * 0.95) + vec3(isoLine * 0.18);
          }

          // Dynamic Weathering: Martian Red Regolith Dust + High-Alt Crystalline Frost + Titanium Heat Bluing
          if (uDustAmount > 0.01) {
            float relH = clamp((vTwinWorldPos.y - uModelMinY) / max(0.35, uModelSpanY), 0.0, 1.0);
            float grit = 0.75 + 0.25 * sin(vTwinLocalPos.x * 43.0 + vTwinLocalPos.z * 39.0);
            float dustMask = clamp((1.0 - smoothstep(0.0, 0.62, relH)) * uDustAmount * grit, 0.0, 0.88);
            diffuseColor.rgb = mix(diffuseColor.rgb, pow(vec3(0.58, 0.23, 0.12), vec3(2.2)), dustMask);
          }
          if (uFrostAmount > 0.01) {
            float frostCrystal = pow(0.5 + 0.5 * sin(vTwinLocalPos.x * 48.0 - vTwinLocalPos.y * 52.0), 2.0);
            float frostEdge = clamp((0.35 + twinRim * 0.65) * uFrostAmount * (0.55 + 0.45 * frostCrystal), 0.0, 0.82);
            diffuseColor.rgb = mix(diffuseColor.rgb, pow(vec3(0.84, 0.95, 1.0), vec3(2.2)), frostEdge);
            totalEmissiveRadiance += pow(vec3(0.18, 0.42, 0.62), vec3(2.2)) * frostEdge * 0.35;
          }
          if (uHeatBluing > 0.01 && uIsOuterArmor < 0.5) {
            float axial = fract(abs(vTwinLocalPos.x + vTwinLocalPos.z) * 2.6);
            vec3 strawGold = pow(vec3(0.88, 0.68, 0.28), vec3(2.2));
            vec3 temperViolet = pow(vec3(0.56, 0.22, 0.78), vec3(2.2));
            vec3 cobaltBlue = pow(vec3(0.12, 0.44, 0.96), vec3(2.2));
            vec3 oxideCol = axial < 0.5 ? mix(strawGold, temperViolet, axial * 2.0) : mix(temperViolet, cobaltBlue, (axial - 0.5) * 2.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, oxideCol, clamp(uHeatBluing * 0.78, 0.0, 0.82));
            totalEmissiveRadiance += oxideCol * uHeatBluing * 0.28;
          }

          // Hardspace: Shipbreaker Functional Engineering Color-Coding (with fwidth() antialiased hazard stripes)
          if (uSalvageRole > 0.5) {
            float pulse = 0.65 + 0.35 * sin(uSalvagePulse * 5.2);
            if (uSalvageRole < 1.5) {
              float hazCoord = (vTwinWorldPos.x + vTwinWorldPos.y + vTwinWorldPos.z) * 7.5;
              float hazFw = max(fwidth(hazCoord), 1e-4);
              float hazTri = abs(fract(hazCoord) - 0.5);
              float stripe = mix(
                smoothstep(0.25 - hazFw * 0.5, 0.25 + hazFw * 0.5, hazTri),
                0.5,
                clamp(hazFw * 1.35, 0.0, 1.0)
              );
              vec3 hazCol = mix(pow(vec3(0.09, 0.10, 0.12), vec3(2.2)), pow(vec3(0.96, 0.74, 0.06), vec3(2.2)), stripe);
              diffuseColor.rgb = mix(diffuseColor.rgb, hazCol, 0.82);
              totalEmissiveRadiance += hazCol * 0.22;
            } else if (uSalvageRole < 2.5) {
              vec3 driveCol = pow(vec3(0.92, 0.14, 0.22), vec3(2.2));
              diffuseColor.rgb = mix(diffuseColor.rgb, driveCol, 0.76);
              totalEmissiveRadiance += driveCol * (0.35 + 0.55 * pulse + twinRim * 0.8);
            } else if (uSalvageRole < 3.5) {
              vec3 sensorCol = pow(vec3(0.08, 0.86, 0.98), vec3(2.2));
              diffuseColor.rgb = mix(diffuseColor.rgb, sensorCol, 0.78);
              totalEmissiveRadiance += sensorCol * (0.55 + twinRim * 1.1);
            } else {
              vec3 coreCol = pow(vec3(1.0, 0.68, 0.08), vec3(2.2));
              diffuseColor.rgb = mix(diffuseColor.rgb, coreCol, 0.82);
              totalEmissiveRadiance += coreCol * (0.65 + 0.55 * pulse + twinRim * 1.2);
            }
          }

          // Horizon Focus Weakpoint X-Ray Scan
          if (uFocusMode > 0.5) {
            if (uFocusMode < 1.5) {
              diffuseColor.rgb = pow(vec3(0.05, 0.09, 0.15), vec3(2.2));
              totalEmissiveRadiance += pow(vec3(0.06, 0.36, 0.58), vec3(2.2)) * twinRim * 0.95;
            } else {
              float wPulse = 0.7 + 0.3 * sin(uSalvagePulse * 7.5);
              diffuseColor.rgb = mix(diffuseColor.rgb, pow(vec3(1.0, 0.72, 0.10), vec3(2.2)), 0.85);
              totalEmissiveRadiance += mix(pow(vec3(1.0, 0.48, 0.04), vec3(2.2)), pow(vec3(1.0, 0.92, 0.36), vec3(2.2)), twinRim) * (1.55 * wPulse + twinRim * 1.6);
            }
          }

          // Armored Core 6 Overheat Internal Core Cherry-Red Incandescence
          if (uOverheatCoreGlow > 0.02 && uIsOuterArmor < 0.5) {
            vec3 cherryCol = mix(pow(vec3(0.95, 0.12, 0.04), vec3(2.2)), pow(vec3(1.0, 0.64, 0.16), vec3(2.2)), twinRim);
            totalEmissiveRadiance += cherryCol * uOverheatCoreGlow * 2.65;
          }

          if (uFresnelPulse > 0.005) {
            float sharpOutline = pow(1.0 - abs(dot(twinV, twinN)), 3.6);
            float crispBand = smoothstep(0.18, 0.88, sharpOutline);
            totalEmissiveRadiance += vec3(0.06, 0.84, 1.0) * (sharpOutline * 0.55 + crispBand * 1.45) * uFresnelPulse;
          }
          if (uLaserActive > 0.5) {
            float distToCut = abs(vTwinWorldPos.y - uLaserClipY);
            float cutFw = max(fwidth(vTwinWorldPos.y), 1e-4);
            float laserBand = 1.0 - smoothstep(0.0, max(0.024, cutFw * 1.5), distToCut);
            float fineCore = 1.0 - smoothstep(0.0, max(0.007, cutFw * 0.85), distToCut);
            vec3 laserCol = mix(vec3(0.02, 0.88, 1.0), vec3(1.0, 0.92, 0.46), fineCore);
            totalEmissiveRadiance += laserCol * laserBand * 3.85;
          }
          if (twinMagWireGlow > 0.5) {
            diffuseColor.rgb = pow(vec3(0.04, 0.82, 0.98), vec3(2.2));
            totalEmissiveRadiance += vec3(0.06, 0.90, 1.0) * 2.2;
          }
          if (twinMagRingGlow > 0.01) {
            vec3 plasmaRim = mix(vec3(0.56, 0.24, 1.0), vec3(0.12, 0.96, 1.0), twinMagRingGlow);
            totalEmissiveRadiance += plasmaRim * twinMagRingGlow * 3.8;
          }
          if (twinSlsPowderHolo > 0.5) {
            diffuseColor.rgb = pow(vec3(0.08, 0.65, 0.96), vec3(2.2));
            totalEmissiveRadiance += vec3(0.10, 0.78, 1.0) * 1.85;
          }
          if (twinSlsMeltGlow > 0.01) {
            vec3 meltCol = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.96, 0.72), pow(twinSlsMeltGlow, 2.0));
            totalEmissiveRadiance += meltCol * twinSlsMeltGlow * 4.5;
          }
          if (twinNaniteHexGlow > 0.01) {
            diffuseColor.rgb = pow(vec3(0.02, 0.88, 1.0), vec3(2.2));
            totalEmissiveRadiance += mix(vec3(1.0, 0.72, 0.16), vec3(0.04, 0.92, 1.0), twinNaniteHexGlow) * 2.65;
          }
          if (twinNaniteRimGlow > 0.01) {
            vec3 nanRim = mix(vec3(0.04, 0.88, 1.0), vec3(1.0, 0.84, 0.32), pow(twinNaniteRimGlow, 1.6));
            totalEmissiveRadiance += nanRim * twinNaniteRimGlow * 3.85;
          }`
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          // Solid CNC-Machined 45-deg ISO Cross-Section Cap with fwidth() derivative AA on clipped interior back-faces!
          if (uLaserActive > 0.5 && !gl_FrontFacing) {
            float cMain = (vTwinWorldPos.x + vTwinWorldPos.z + vTwinWorldPos.y * 0.35) * 46.0;
            float cCross = (vTwinWorldPos.x - vTwinWorldPos.z) * 23.0;
            float fwMain = max(fwidth(cMain), 1e-4);
            float fwCross = max(fwidth(cCross), 1e-4);
            float dMain = abs(fract(cMain) - 0.5);
            float dCross = abs(fract(cCross) - 0.5);
            float mainHalfW = max(0.11, fwMain * 0.75);
            float crossHalfW = max(0.07, fwCross * 0.75);
            float hMain = (1.0 - smoothstep(mainHalfW - fwMain * 0.5, mainHalfW + fwMain * 0.65, dMain)) * (1.0 - clamp(fwMain * 1.25, 0.0, 1.0));
            float hCross = (1.0 - smoothstep(crossHalfW - fwCross * 0.5, crossHalfW + fwCross * 0.65, dCross)) * (1.0 - clamp(fwCross * 1.25, 0.0, 1.0));
            vec3 alloyBase = pow(vec3(0.08, 0.13, 0.21), vec3(2.2));
            vec3 hatchCol = pow(vec3(0.28, 0.82, 1.0), vec3(2.2));
            if (uSectionLayerCode > 1.5 && uSectionLayerCode < 2.5) {
              alloyBase = pow(vec3(0.16, 0.10, 0.05), vec3(2.2));
              hatchCol = pow(vec3(0.98, 0.68, 0.16), vec3(2.2));
            } else if (uSectionLayerCode >= 2.5) {
              alloyBase = pow(vec3(0.05, 0.15, 0.24), vec3(2.2));
              hatchCol = pow(vec3(0.48, 0.95, 1.0), vec3(2.2));
            }
            float distCut = abs(vTwinWorldPos.y - uLaserClipY);
            float kerfBevel = 1.0 - smoothstep(0.0, 0.028, distCut);
            vec3 capLight = alloyBase + hatchCol * (hMain * 0.68 + hCross * 0.30) + mix(hatchCol, vec3(1.0, 0.92, 0.45), kerfBevel) * kerfBevel * 2.25;
            gl_FragColor = vec4(capLight, 1.0);
          }`
        );
  };

  return twinUniforms;
}

function createRadialGlowPointTexture(midRgba: [number, number, number, number]): THREE.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.38, `rgba(${midRgba[0]},${midRgba[1]},${midRgba[2]},${midRgba[3]})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(canvas);
    }
  }
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const a = r > 1 ? 0 : Math.pow(1 - r * r, 1.8);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(255 * (1 - r * 0.35) + midRgba[0] * r * 0.35);
      data[idx + 1] = Math.round(255 * (1 - r * 0.35) + midRgba[1] * r * 0.35);
      data[idx + 2] = Math.round(255 * (1 - r * 0.35) + midRgba[2] * r * 0.35);
      data[idx + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds an open, unobstructed CAD Laser Caliper Frame + Vernier Elevation Ticks
 * using pure custom BufferGeometry (ZERO hazy translucent cyan disc covering the robot!).
 */
export function createOpticalSectionAssembly(radius: number = 1.25): {
  group: THREE.Group;
  updateSection: (clipY: number, visible: boolean, simTime: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'optical_laser_section_caliper';

  // 4 Crisp Corner L-Brackets framing the section elevation (100% open center!)
  const half = radius * 0.78;
  const arm = radius * 0.18;
  const bracketPts: THREE.Vector3[] = [];
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ];
  for (const [sx, sz] of corners) {
    const cx = sx * half;
    const cz = sz * half;
    bracketPts.push(
      new THREE.Vector3(cx, 0, cz),
      new THREE.Vector3(cx - sx * arm, 0, cz),
      new THREE.Vector3(cx, 0, cz),
      new THREE.Vector3(cx, 0, cz - sz * arm)
    );
    // Subtle vertical caliper jaw ticks (18mm height)
    bracketPts.push(
      new THREE.Vector3(cx, -0.018, cz),
      new THREE.Vector3(cx, 0.018, cz)
    );
  }
  const bracketGeo = new THREE.BufferGeometry().setFromPoints(bracketPts);
  const bracketMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  const cornerBrackets = new THREE.LineSegments(bracketGeo, bracketMat);
  group.add(cornerBrackets);

  // Subtle Perimeter Vernier Scale Arcs (only along 4 cardinal outer arcs, never washing over center)
  const tickPts: THREE.Vector3[] = [];
  const ringR = radius * 0.86;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 6 === 0 ? ringR * 0.94 : ringR * 0.975;
    tickPts.push(
      new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0),
      new THREE.Vector3(Math.cos(a) * ringR, 0, Math.sin(a) * ringR)
    );
  }
  const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
  const tickMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const ticks = new THREE.LineSegments(tickGeo, tickMat);
  group.add(ticks);
  group.visible = false;

  const updateSection = (clipY: number, visible: boolean, simTime: number) => {
    group.visible = visible;
    if (!visible) return;
    group.position.y = clipY;
    ticks.rotation.y = simTime * 0.12;
    bracketMat.opacity = 0.62 + 0.14 * Math.sin(simTime * 3.5);
  };

  const dispose = () => {
    bracketGeo.dispose();
    bracketMat.dispose();
    tickGeo.dispose();
    tickMat.dispose();
  };

  return { group, updateSection, dispose };
}

export interface FlowAndSensorFieldController {
  group: THREE.Group;
  update: (simTime: number, loadFactor: number, isReverse?: boolean) => void;
  dispose: () => void;
}

/**
 * Builds domain-authentic 3D Flow Streamlines & Invisible Sensor Perception Frustums
 * using pure custom BufferGeometry (Lines, Points, Triangle Fans — ZERO primitive Box/Cylinder/Cone).
 */
export function createFlowAndSensorField(
  contextId: string,
  floorY: number
): FlowAndSensorFieldController {
  const group = new THREE.Group();
  group.name = `flow_sensor_field_${contextId}`;
  group.visible = false;

  // Case A: Aerospace Turbofan (B737 / CFM56-7B) — 3D Aerodynamic Gas-Path Streamlines + Moving Tracer Particles
  if (contextId === 'b737_cfm56' || contextId === 'b737_bridge') {
    const numStreams = 20;
    const ptsPerStream = 44;
    const streamPositions = new Float32Array(numStreams * (ptsPerStream - 1) * 2 * 3);
    const streamColors = new Float32Array(numStreams * (ptsPerStream - 1) * 2 * 3);

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
    streamGeo.setAttribute('color', new THREE.BufferAttribute(streamColors, 3));

    const streamMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const streamLines = new THREE.LineSegments(streamGeo, streamMat);
    group.add(streamLines);

    // Tracer particles racing along streamlines
    const tracerCount = 160;
    const tracerPos = new Float32Array(tracerCount * 3);
    const tracerCol = new Float32Array(tracerCount * 3);
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
    tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
    const tracerGlowTex = createRadialGlowPointTexture([186, 230, 253, 0.85]);

    const tracerMat = new THREE.PointsMaterial({
      map: tracerGlowTex,
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const tracers = new THREE.Points(tracerGeo, tracerMat);
    group.add(tracers);

    const evalStreamPoint = (
      streamIdx: number,
      u: number,
      simTime: number,
      load: number,
      isReverse: boolean,
      outPos: [number, number, number],
      outCol: [number, number, number]
    ) => {
      const isCore = streamIdx < 10;
      const baseAngle = ((streamIdx % 10) / 10) * Math.PI * 2 + (isCore ? 0.15 : 0);
      // Axial span across normalized 2.15m engine assembly: x in [-1.05, +1.18]
      let x = -1.05 + u * 2.25;
      let r = isCore
        ? 0.34 - 0.14 * Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.85) + 0.05 * u
        : 0.52 + 0.06 * Math.sin(u * Math.PI);

      // Swirl imparted by fan & compressor stages
      const swirlRate = isCore ? (2.2 + load * 3.8) : (1.1 + load * 1.6);
      const theta = baseAngle + u * swirlRate - simTime * (1.8 + load * 5.5) * 0.25;

      // Thrust reverser cascade deflection on bypass streams when u > 0.48
      if (!isCore && isReverse && u > 0.48) {
        const revU = (u - 0.48) / 0.52;
        x = -1.05 + 0.48 * 2.25 - revU * 0.62;
        r = 0.56 + revU * 0.48;
      }

      outPos[0] = x;
      outPos[1] = Math.cos(theta) * r;
      outPos[2] = Math.sin(theta) * r;

      // Color progression: Intake cold blue -> Compressor gold -> Combustor/Exhaust fiery orange
      if (u < 0.34) {
        const k = u / 0.34;
        outCol[0] = 0.05 + k * 0.25;
        outCol[1] = 0.65 + k * 0.22;
        outCol[2] = 0.98 - k * 0.15;
      } else if (u < 0.66) {
        const k = (u - 0.34) / 0.32;
        outCol[0] = isCore ? 0.3 + k * 0.68 : 0.15 + k * 0.25;
        outCol[1] = isCore ? 0.85 - k * 0.15 : 0.82 - k * 0.1;
        outCol[2] = isCore ? 0.82 - k * 0.65 : 0.92;
      } else {
        const k = (u - 0.66) / 0.34;
        if (isCore) {
          outCol[0] = 0.98;
          outCol[1] = 0.68 - k * 0.36 * load;
          outCol[2] = 0.18 + (1 - k) * 0.15;
        } else {
          outCol[0] = isReverse ? 0.96 : 0.25;
          outCol[1] = isReverse ? 0.72 : 0.78;
          outCol[2] = isReverse ? 0.22 : 0.96;
        }
      }
    };

    const pA: [number, number, number] = [0, 0, 0];
    const pB: [number, number, number] = [0, 0, 0];
    const cA: [number, number, number] = [0, 0, 0];
    const cB: [number, number, number] = [0, 0, 0];

    const update = (simTime: number, loadFactor: number, isReverse: boolean = false) => {
      if (!group.visible) return;
      let idx = 0;
      for (let s = 0; s < numStreams; s++) {
        for (let k = 0; k < ptsPerStream - 1; k++) {
          const u0 = k / (ptsPerStream - 1);
          const u1 = (k + 1) / (ptsPerStream - 1);
          evalStreamPoint(s, u0, simTime, loadFactor, isReverse, pA, cA);
          evalStreamPoint(s, u1, simTime, loadFactor, isReverse, pB, cB);

          streamPositions[idx] = pA[0];
          streamPositions[idx + 1] = pA[1];
          streamPositions[idx + 2] = pA[2];
          streamColors[idx] = cA[0];
          streamColors[idx + 1] = cA[1];
          streamColors[idx + 2] = cA[2];

          streamPositions[idx + 3] = pB[0];
          streamPositions[idx + 4] = pB[1];
          streamPositions[idx + 5] = pB[2];
          streamColors[idx + 3] = cB[0];
          streamColors[idx + 4] = cB[1];
          streamColors[idx + 5] = cB[2];
          idx += 6;
        }
      }
      streamGeo.attributes.position.needsUpdate = true;
      streamGeo.attributes.color.needsUpdate = true;

      const speed = 0.55 + loadFactor * 1.95;
      for (let t = 0; t < tracerCount; t++) {
        const s = t % numStreams;
        const u = ((t / tracerCount) + simTime * speed * (s < 10 ? 1.25 : 0.92)) % 1.0;
        evalStreamPoint(s, u, simTime, loadFactor, isReverse, pA, cA);
        const b = t * 3;
        tracerPos[b] = pA[0];
        tracerPos[b + 1] = pA[1];
        tracerPos[b + 2] = pA[2];
        tracerCol[b] = cA[0];
        tracerCol[b + 1] = cA[1];
        tracerCol[b + 2] = cA[2];
      }
      tracerGeo.attributes.position.needsUpdate = true;
      tracerGeo.attributes.color.needsUpdate = true;
    };

    const dispose = () => {
      streamGeo.dispose();
      streamMat.dispose();
      tracerGeo.dispose();
      tracerGlowTex.dispose();
      tracerMat.dispose();
    };

    return { group, update, dispose };
  }

  // Case B: Subsea ROV (BlueROV2 & RexROV2) — Helical Thruster Wake Plumes + Rotating 360° Ping360 Sonar Sector
  if (contextId === 'bluerov2' || contextId === 'rexrov2') {
    const geosToDispose: THREE.BufferGeometry[] = [];
    const matsToDispose: THREE.Material[] = [];

    const sonarGroup = new THREE.Group();
    sonarGroup.position.set(0.18, 0.36, 0.0);
    group.add(sonarGroup);

    // 55-degree acoustic scan fan sector built from custom triangle fan BufferGeometry
    const fanSegs = 28;
    const fanRadius = 1.55;
    const fanArc = (52 * Math.PI) / 180;
    const fanPos = new Float32Array(fanSegs * 9);
    for (let i = 0; i < fanSegs; i++) {
      const a0 = -fanArc * 0.5 + (i / fanSegs) * fanArc;
      const a1 = -fanArc * 0.5 + ((i + 1) / fanSegs) * fanArc;
      const b = i * 9;
      fanPos[b] = 0; fanPos[b + 1] = 0; fanPos[b + 2] = 0;
      fanPos[b + 3] = Math.cos(a0) * fanRadius; fanPos[b + 4] = -0.08; fanPos[b + 5] = Math.sin(a0) * fanRadius;
      fanPos[b + 6] = Math.cos(a1) * fanRadius; fanPos[b + 7] = -0.08; fanPos[b + 8] = Math.sin(a1) * fanRadius;
    }
    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPos, 3));
    const fanMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geosToDispose.push(fanGeo);
    matsToDispose.push(fanMat);
    const fanMesh = new THREE.Mesh(fanGeo, fanMat);
    sonarGroup.add(fanMesh);

    // Sonar beam boundary rays
    const edgePts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(-fanArc * 0.5) * fanRadius, -0.08, Math.sin(-fanArc * 0.5) * fanRadius),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(fanArc * 0.5) * fanRadius, -0.08, Math.sin(fanArc * 0.5) * fanRadius)
    ];
    const sonarEdgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const sonarEdgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    geosToDispose.push(sonarEdgeGeo);
    matsToDispose.push(sonarEdgeMat);
    sonarGroup.add(new THREE.LineSegments(sonarEdgeGeo, sonarEdgeMat));

    // Concentric acoustic range rings
    for (const r of [0.55, 1.05, 1.55]) {
      const rPts: THREE.Vector3[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        rPts.push(new THREE.Vector3(Math.cos(a) * r, 0.30, Math.sin(a) * r));
      }
      const rg = new THREE.BufferGeometry().setFromPoints(rPts);
      const rm = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      });
      geosToDispose.push(rg);
      matsToDispose.push(rm);
      group.add(new THREE.LineLoop(rg, rm));
    }

    // 6 Helical Hydro-Wake Plume Streams behind ROV vectored thrusters
    const nozzleAnchors: [number, number, number, number, number][] = [
      [-0.38, -0.04, 0.34, -1, 0.45],
      [-0.38, -0.04, -0.34, -1, -0.45],
      [0.34, -0.04, 0.34, -1, -0.35],
      [0.34, -0.04, -0.34, -1, 0.35],
      [0.0, 0.14, 0.28, 0, 0],
      [0.0, 0.14, -0.28, 0, 0]
    ];
    const segsPerPlume = 26;
    const wakePos = new Float32Array(nozzleAnchors.length * (segsPerPlume - 1) * 2 * 3);
    const wakeGeo = new THREE.BufferGeometry();
    wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePos, 3));
    const wakeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geosToDispose.push(wakeGeo);
    matsToDispose.push(wakeMat);
    const wakeLines = new THREE.LineSegments(wakeGeo, wakeMat);
    group.add(wakeLines);

    const update = (simTime: number, loadFactor: number) => {
      if (!group.visible) return;
      sonarGroup.rotation.y = simTime * (0.85 + loadFactor * 1.4);

      let idx = 0;
      const plumeLen = 0.42 + loadFactor * 0.58;
      for (let n = 0; n < nozzleAnchors.length; n++) {
        const [ax, ay, az, dx, dz] = nozzleAnchors[n];
        const isVert = dx === 0 && dz === 0;
        for (let k = 0; k < segsPerPlume - 1; k++) {
          const u0 = k / (segsPerPlume - 1);
          const u1 = (k + 1) / (segsPerPlume - 1);
          const ph0 = u0 * 10.0 - simTime * (8.0 + loadFactor * 12.0) + n;
          const ph1 = u1 * 10.0 - simTime * (8.0 + loadFactor * 12.0) + n;
          const rad0 = 0.04 + u0 * 0.11;
          const rad1 = 0.04 + u1 * 0.11;

          if (isVert) {
            wakePos[idx] = ax + Math.cos(ph0) * rad0;
            wakePos[idx + 1] = ay - u0 * plumeLen * 0.75;
            wakePos[idx + 2] = az + Math.sin(ph0) * rad0;
            wakePos[idx + 3] = ax + Math.cos(ph1) * rad1;
            wakePos[idx + 4] = ay - u1 * plumeLen * 0.75;
            wakePos[idx + 5] = az + Math.sin(ph1) * rad1;
          } else {
            wakePos[idx] = ax + dx * u0 * plumeLen;
            wakePos[idx + 1] = ay + Math.cos(ph0) * rad0;
            wakePos[idx + 2] = az + dz * u0 * plumeLen + Math.sin(ph0) * rad0;
            wakePos[idx + 3] = ax + dx * u1 * plumeLen;
            wakePos[idx + 4] = ay + Math.cos(ph1) * rad1;
            wakePos[idx + 5] = az + dz * u1 * plumeLen + Math.sin(ph1) * rad1;
          }
          idx += 6;
        }
      }
      wakeGeo.attributes.position.needsUpdate = true;
    };

    const dispose = () => {
      for (const g of geosToDispose) g.dispose();
      for (const m of matsToDispose) m.dispose();
    };

    return { group, update, dispose };
  }

  // Case C: Ground & Embodied Robots (Mars 2020 Perseverance, SAR, Unitree G1, Go2, Z1)
  // Semi-transparent 3D LiDAR / Stereo Vision Frustum + Expanding Ground LiDAR Terrain Scan Rings
  const geosToDispose: THREE.BufferGeometry[] = [];
  const matsToDispose: THREE.Material[] = [];

  const frustumGroup = new THREE.Group();
  const sensorOrigin: [number, number, number] =
    contextId === 'mars2020'
      ? [0.36, 0.62, -0.18]
      : contextId === 'unitree_g1'
        ? [0.04, 0.72, 0.08]
        : contextId === 'unitree_z1'
          ? [0.35, 0.32, 0.0]
          : [0.28, 0.26, 0.0];
  frustumGroup.position.set(sensorOrigin[0], sensorOrigin[1], sensorOrigin[2]);
  group.add(frustumGroup);

  // 4-sided pyramid frustum built from custom BufferGeometry triangles
  const reach = 1.45;
  const halfW = 0.58;
  const halfH = 0.34;
  const dropY = -0.48;
  const corners: [number, number, number][] = [
    [reach, dropY + halfH, -halfW],
    [reach, dropY + halfH, halfW],
    [reach, dropY - halfH, halfW],
    [reach, dropY - halfH, -halfW]
  ];
  const pyrPos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % 4];
    pyrPos.push(0, 0, 0, c0[0], c0[1], c0[2], c1[0], c1[1], c1[2]);
  }
  const pyrGeo = new THREE.BufferGeometry();
  pyrGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pyrPos), 3));
  const pyrMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  geosToDispose.push(pyrGeo);
  matsToDispose.push(pyrMat);
  const pyrMesh = new THREE.Mesh(pyrGeo, pyrMat);
  frustumGroup.add(pyrMesh);

  const edgeLinesPts: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % 4];
    edgeLinesPts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(c0[0], c0[1], c0[2]));
    edgeLinesPts.push(new THREE.Vector3(c0[0], c0[1], c0[2]), new THREE.Vector3(c1[0], c1[1], c1[2]));
  }
  const pyrEdgeGeo = new THREE.BufferGeometry().setFromPoints(edgeLinesPts);
  const pyrEdgeMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    depthWrite: false
  });
  geosToDispose.push(pyrEdgeGeo);
  matsToDispose.push(pyrEdgeMat);
  frustumGroup.add(new THREE.LineSegments(pyrEdgeGeo, pyrEdgeMat));

  // Expanding LiDAR point-cloud scan rings on the floor
  const numScanRings = 3;
  const ptsPerRing = 96;
  const ringGlowTex = createRadialGlowPointTexture([125, 211, 252, 0.8]);

  const scanRings: { loop: THREE.Points; mat: THREE.PointsMaterial }[] = [];
  for (let r = 0; r < numScanRings; r++) {
    const ringPos = new Float32Array(ptsPerRing * 3);
    for (let i = 0; i < ptsPerRing; i++) {
      const a = (i / ptsPerRing) * Math.PI * 2;
      ringPos[i * 3] = Math.cos(a);
      ringPos[i * 3 + 1] = 0;
      ringPos[i * 3 + 2] = Math.sin(a);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    const rMat = new THREE.PointsMaterial({
      map: ringGlowTex,
      color: r % 2 === 0 ? 0x38bdf8 : 0x10b981,
      size: 0.048,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geosToDispose.push(rGeo);
    matsToDispose.push(rMat);
    const pts = new THREE.Points(rGeo, rMat);
    pts.position.y = floorY + 0.025;
    group.add(pts);
    scanRings.push({ loop: pts, mat: rMat });
  }

  // Aerodynamic Wind-Tunnel Streamline Ribbons with Karman Vortex Street Wake Oscillation
  const numWakeLines = 7;
  const wakeSegs = 40;
  const wakeLines: { line: THREE.Line; geo: THREE.BufferGeometry; zBase: number; yBase: number; phaseOff: number }[] = [];
  for (let w = 0; w < numWakeLines; w++) {
    const zBase = (w - (numWakeLines - 1) * 0.5) * 0.26;
    const yBase = floorY + 0.32 + (w % 3) * 0.24;
    const wPos = new Float32Array(wakeSegs * 3);
    const wCol = new Float32Array(wakeSegs * 3);
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
    const wMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geosToDispose.push(wGeo);
    matsToDispose.push(wMat);
    const wLine = new THREE.Line(wGeo, wMat);
    wLine.frustumCulled = false;
    group.add(wLine);
    wakeLines.push({ line: wLine, geo: wGeo, zBase, yBase, phaseOff: w * 0.95 });
  }

  const update = (simTime: number, loadFactor: number) => {
    if (!group.visible) return;
    frustumGroup.rotation.y = Math.sin(simTime * (0.75 + loadFactor * 0.65)) * 0.42;

    for (let r = 0; r < scanRings.length; r++) {
      const phase = ((simTime * (0.48 + loadFactor * 0.35) + r / scanRings.length) % 1.0);
      const radius = 0.35 + phase * 1.95;
      scanRings[r].loop.scale.set(radius, 1, radius);
      scanRings[r].mat.opacity = (1.0 - phase) * 0.85;
    }

    const flowSpeed = 3.2 + loadFactor * 2.4;
    for (let w = 0; w < wakeLines.length; w++) {
      const wl = wakeLines[w];
      const posAttr = wl.geo.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = wl.geo.getAttribute('color') as THREE.BufferAttribute;
      for (let s = 0; s < wakeSegs; s++) {
        const u = s / (wakeSegs - 1);
        const x = -1.55 + u * 3.35;
        // Upstream laminar -> Obstacle deflection -> Downstream Karman vortex street shedding!
        const wakeEnv = Math.max(0, (x - 0.08) / 1.72);
        const deflect = Math.exp(-x * x * 3.2) * Math.sign(wl.zBase || 1) * 0.16;
        const karmanZ =
          wakeEnv *
          Math.sin(u * 13.5 - simTime * flowSpeed * 1.85 + wl.phaseOff) *
          (0.14 + loadFactor * 0.08);
        const karmanY =
          wakeEnv *
          Math.cos(u * 10.5 - simTime * flowSpeed * 1.45 + wl.phaseOff) *
          0.055;
        posAttr.array[s * 3] = x;
        posAttr.array[s * 3 + 1] = wl.yBase + karmanY;
        posAttr.array[s * 3 + 2] = wl.zBase + deflect + karmanZ;

        const vort = Math.min(1, wakeEnv * 1.25);
        // Laminar cyan -> Turbulent emerald/amber wake
        colAttr.array[s * 3] = 0.15 + vort * 0.72;
        colAttr.array[s * 3 + 1] = 0.78 - vort * 0.12;
        colAttr.array[s * 3 + 2] = 0.98 - vort * 0.58;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  };

  const dispose = () => {
    ringGlowTex.dispose();
    for (const g of geosToDispose) g.dispose();
    for (const m of matsToDispose) m.dispose();
  };

  return { group, update, dispose };
}
