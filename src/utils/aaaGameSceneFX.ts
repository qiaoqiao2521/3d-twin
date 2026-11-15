import * as THREE from 'three';
import {
  DiegeticSpineTelemetry,
  OrbitalDropState,
  OverheatAndRcsState
} from './aaaGameVfxEngine';

// ============================================================================
// AAA INDUSTRIAL SCI-FI GAME SCENE VFX CONTROLLERS
// Strictly 100% Custom BufferGeometry & LatheGeometry — ZERO Box/Cylinder/Sphere/Cone/Capsule!
// ============================================================================

function buildCustomAnnularDiscGeometry(
  innerR: number,
  outerR: number,
  segs: number = 64
): THREE.BufferGeometry {
  const pos = new Float32Array(segs * 18);
  const uv = new Float32Array(segs * 12);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);

    const b = i * 18;
    // Tri 1
    pos[b] = c0 * innerR; pos[b + 1] = 0; pos[b + 2] = s0 * innerR;
    pos[b + 3] = c0 * outerR; pos[b + 4] = 0; pos[b + 5] = s0 * outerR;
    pos[b + 6] = c1 * outerR; pos[b + 7] = 0; pos[b + 8] = s1 * outerR;
    // Tri 2
    pos[b + 9] = c0 * innerR; pos[b + 10] = 0; pos[b + 11] = s0 * innerR;
    pos[b + 12] = c1 * outerR; pos[b + 13] = 0; pos[b + 14] = s1 * outerR;
    pos[b + 15] = c1 * innerR; pos[b + 16] = 0; pos[b + 17] = s1 * innerR;

    const u = i * 12;
    uv[u] = i / segs; uv[u + 1] = 0;
    uv[u + 2] = i / segs; uv[u + 3] = 1;
    uv[u + 4] = (i + 1) / segs; uv[u + 5] = 1;
    uv[u + 6] = i / segs; uv[u + 7] = 0;
    uv[u + 8] = (i + 1) / segs; uv[u + 9] = 1;
    uv[u + 10] = (i + 1) / segs; uv[u + 11] = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function buildCurved3DArcGaugeGeometry(
  radius: number,
  thickness: number,
  startAngle: number,
  arcSpan: number,
  segs: number = 32
): THREE.BufferGeometry {
  const pos = new Float32Array(segs * 18);
  const uv = new Float32Array(segs * 12);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const a0 = startAngle + t0 * arcSpan;
    const a1 = startAngle + t1 * arcSpan;
    const rIn = radius - thickness * 0.5;
    const rOut = radius + thickness * 0.5;

    // Subtle dorsal cylindrical wrap in local Z so the spine arcs curve around the chassis!
    const z0 = -Math.cos(t0 * Math.PI - Math.PI * 0.5) * 0.05;
    const z1 = -Math.cos(t1 * Math.PI - Math.PI * 0.5) * 0.05;

    const x0In = Math.cos(a0) * rIn, y0In = Math.sin(a0) * rIn;
    const x0Out = Math.cos(a0) * rOut, y0Out = Math.sin(a0) * rOut;
    const x1In = Math.cos(a1) * rIn, y1In = Math.sin(a1) * rIn;
    const x1Out = Math.cos(a1) * rOut, y1Out = Math.sin(a1) * rOut;

    const b = i * 18;
    pos[b] = x0In; pos[b + 1] = y0In; pos[b + 2] = z0;
    pos[b + 3] = x0Out; pos[b + 4] = y0Out; pos[b + 5] = z0;
    pos[b + 6] = x1Out; pos[b + 7] = y1Out; pos[b + 8] = z1;

    pos[b + 9] = x0In; pos[b + 10] = y0In; pos[b + 11] = z0;
    pos[b + 12] = x1Out; pos[b + 13] = y1Out; pos[b + 14] = z1;
    pos[b + 15] = x1In; pos[b + 16] = y1In; pos[b + 17] = z1;

    const u = i * 12;
    uv[u] = t0; uv[u + 1] = 0;
    uv[u + 2] = t0; uv[u + 3] = 1;
    uv[u + 4] = t1; uv[u + 5] = 1;
    uv[u + 6] = t0; uv[u + 7] = 0;
    uv[u + 8] = t1; uv[u + 9] = 1;
    uv[u + 10] = t1; uv[u + 11] = 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function createDiegeticHeaderLegendTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = 'rgba(4, 14, 28, 0.72)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillRect(6, 6, 500, 84);

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('RIG SPINE TELEMETRY · DIEGETIC [U]', 24, 38);

  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('▪ PWR', 24, 72);
  ctx.fillStyle = '#f97316';
  ctx.fillText('▪ HEAT', 142, 72);
  ctx.fillStyle = '#10b981';
  ctx.fillText('▪ RPM', 278, 72);
  ctx.fillStyle = '#c084fc';
  ctx.fillText('▪ WPN', 398, 72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface AaaSandboxSceneFXController {
  worldGroup: THREE.Group;
  actorAttachedGroup: THREE.Group;
  updateSandboxAaaFX: (params: {
    dt: number;
    simTime: number;
    actorWorldPos: THREE.Vector3;
    actorGroundY: number;
    actorYaw: number;
    modelHeightSpan: number;
    speedMetersPerSec: number;
    yawRateRadS: number;
    dropState: OrbitalDropState;
    overheatState: OverheatAndRcsState;
    patrolRibbonActive: boolean;
    patrolTargetWorld: THREE.Vector3 | null;
    sampleGroundHeight: (x: number, z: number) => number;
    diegeticHudActive: boolean;
    spineTelemetry: DiegeticSpineTelemetry;
    cameraWorldPos?: THREE.Vector3;
    cameraQuaternion?: THREE.Quaternion;
  }) => void;
  dispose: () => void;
}

/**
 * Unified 60fps Scene VFX Controller for Sandbox AAA Systems:
 * 1) Titanfall 2 Orbital Dropfall (Atmospheric Shock Cone + Mach Vapor Ring + Retro Plumes + Ground Seismic Crack Wave)
 * 2) Armored Core 6 Overheat Steam/Spark Jets + 4-Corner 90ms RCS Cold-Gas Attitude Micro-Thrusters
 * 4) Star Citizen / Ace Combat 7 Wingtip/Blade-Tip Aerodynamic Condensation Vortex Ribbons
 * 5) Horizon Golden Patrol Navigation Chevron Ribbon (+0.25m above terrain)
 * 6) Dead Space 100% Diegetic 3D Dorsal Spine Holographic Arc Gauges (⚡PWR / 🌡️HEAT / 🔄RPM / 🎯WPN)
 */
export function createAaaSandboxSceneFXController(): AaaSandboxSceneFXController {
  const worldGroup = new THREE.Group();
  worldGroup.name = 'aaa_sandbox_world_vfx';

  const actorAttachedGroup = new THREE.Group();
  actorAttachedGroup.name = 'aaa_sandbox_actor_attached_vfx';

  // ===========================================================================
  // 1. TITANFALL 2 ORBITAL DROPFALL: SHOCK CONE + MACH RING + RETRO JETS + SEISMIC WAVE
  // ===========================================================================
  const dropRigGroup = new THREE.Group();
  dropRigGroup.visible = false;
  actorAttachedGroup.add(dropRigGroup);

  const shockProfile = [
    new THREE.Vector2(0.18, -0.35),
    new THREE.Vector2(1.05, 0.45),
    new THREE.Vector2(1.85, 2.35),
    new THREE.Vector2(2.45, 4.6)
  ];
  const shockConeGeo = new THREE.LatheGeometry(shockProfile, 28);
  const shockConeMat = new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: 0.0 },
      uTime: { value: 0.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUvS;
      void main() {
        vUvS = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uTime;
      varying vec2 vUvS;
      void main() {
        float tipHot = 1.0 - smoothstep(0.0, 0.85, vUvS.y);
        float streak = 0.65 + 0.35 * sin(vUvS.x * 44.0 + uTime * 35.0);
        vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.92, 0.58), pow(tipHot, 1.8));
        gl_FragColor = vec4(col * 2.4, tipHot * streak * uIntensity * 0.85);
      }
    `
  });
  dropRigGroup.add(new THREE.Mesh(shockConeGeo, shockConeMat));

  // Sonic Boom Vapor Ring around falling chassis
  const machRingGeo = buildCustomAnnularDiscGeometry(1.15, 2.55, 48);
  const machRingMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const machRingMesh = new THREE.Mesh(machRingGeo, machRingMat);
  machRingMesh.position.y = 1.25;
  dropRigGroup.add(machRingMesh);

  // Twin Retro-Thruster Braking Jets (0.6s ~ 0.9s at 12m altitude)
  const retroProfile = [
    new THREE.Vector2(0.24, 0.0),
    new THREE.Vector2(0.45, -1.15),
    new THREE.Vector2(0.06, -3.2)
  ];
  const retroGeo = new THREE.LatheGeometry(retroProfile, 16);
  const retroMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const retroLeft = new THREE.Mesh(retroGeo, retroMat);
  retroLeft.position.set(0.0, 0.25, 0.55);
  const retroRight = new THREE.Mesh(retroGeo, retroMat);
  retroRight.position.set(0.0, 0.25, -0.55);
  dropRigGroup.add(retroLeft, retroRight);

  // Expanding Ground Seismic Crack Light-Wave Disc
  const seismicGeo = buildCustomAnnularDiscGeometry(0.15, 1.0, 64);
  const seismicMat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUvG;
      varying vec3 vLocalP;
      void main() {
        vUvG = uv;
        vLocalP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      varying vec2 vUvG;
      varying vec3 vLocalP;
      void main() {
        float ang = atan(vLocalP.z, vLocalP.x);
        float crack = pow(abs(sin(ang * 9.0 + vUvG.y * 5.0)), 10.0);
        float rimWave = 1.0 - smoothstep(0.65, 1.0, vUvG.y);
        float outerRing = 1.0 - smoothstep(0.0, 0.16, abs(vUvG.y - 0.88));
        float fade = 1.0 - smoothstep(0.25, 1.0, uProgress);
        float alpha = clamp((crack * rimWave * 0.9 + outerRing * 1.3) * fade, 0.0, 1.0);
        if (alpha < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.38, 0.05), vec3(0.22, 0.88, 1.0), outerRing * 0.65);
        gl_FragColor = vec4(col * 2.5, alpha);
      }
    `
  });
  const seismicMesh = new THREE.Mesh(seismicGeo, seismicMat);
  seismicMesh.visible = false;
  worldGroup.add(seismicMesh);

  // ===========================================================================
  // 2. ARMORED CORE 6: 4-CORNER 60ms RCS COLD-GAS WISPS + OVERHEAT STEAM/SPARKS
  // ===========================================================================
  const rcsProfile = [
    new THREE.Vector2(0.008, 0.0),
    new THREE.Vector2(0.032, 0.065),
    new THREE.Vector2(0.056, 0.20)
  ];
  const rcsGeo = new THREE.LatheGeometry(rcsProfile, 14);
  const rcsCorners: {
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
  }[] = [];
  // [FL, FR, RL, RR] compact chassis-flank attitude cold-gas micro-nozzles (0.16m ~ 0.24m length)
  const cornerConfigs: { pos: [number, number, number]; rot: [number, number, number] }[] = [
    { pos: [0.46, 0.44, -0.38], rot: [-Math.PI * 0.42, 0, -0.35] }, // FL
    { pos: [0.46, 0.44,  0.38], rot: [ Math.PI * 0.42, 0, -0.35] }, // FR
    { pos: [-0.46, 0.44, -0.38], rot: [-Math.PI * 0.45, 0, 0.25] }, // RL
    { pos: [-0.46, 0.44,  0.38], rot: [ Math.PI * 0.45, 0, 0.25] }  // RR
  ];
  for (const cfg of cornerConfigs) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uEnv: { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying float vAxial;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vAxial = clamp(position.y / 0.20, 0.0, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uEnv;
        varying float vAxial;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vec3 viewDir = normalize(-vViewPos);
          // Feathered silhouette falloff so zero hard geometric borders ever appear!
          float sil = pow(clamp(abs(dot(normalize(vNormalV), viewDir)), 0.0, 1.0), 1.85);
          float nozzleCore = exp(-vAxial * 3.8) * smoothstep(0.0, 0.08, vAxial);
          float wispTail = (1.0 - smoothstep(0.15, 1.0, vAxial)) * 0.55;
          float alpha = (nozzleCore + wispTail) * sil * uEnv * 0.58;
          if (alpha < 0.008) discard;
          vec3 col = mix(vec3(0.32, 0.78, 1.0), vec3(0.92, 0.98, 1.0), nozzleCore);
          gl_FragColor = vec4(col * 1.35, alpha);
        }
      `
    });
    const mesh = new THREE.Mesh(rcsGeo, m);
    mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    mesh.visible = false;
    actorAttachedGroup.add(mesh);
    rcsCorners.push({ mesh, mat: m });
  }

  // Overheat Pressurized Volumetric Steam Billows + Diamond Plasma Sparks (140 pooled particles, zero square blocks!)
  const STEAM_POOL = 140;
  const steamPos = new Float32Array(STEAM_POOL * 3);
  const steamCol = new Float32Array(STEAM_POOL * 3);
  const steamVel = new Float32Array(STEAM_POOL * 3);
  const steamLife = new Float32Array(STEAM_POOL);
  const steamMeta = new Float32Array(STEAM_POOL * 2); // [normAge 0..1, kind: 0 = soft billow steam, 1 = diamond star spark]
  let steamCursor = 0;
  for (let i = 0; i < STEAM_POOL; i++) steamPos[i * 3 + 1] = -999;

  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  steamGeo.setAttribute('color', new THREE.BufferAttribute(steamCol, 3));
  steamGeo.setAttribute('aMeta', new THREE.BufferAttribute(steamMeta, 2));
  const steamMat = new THREE.ShaderMaterial({
    uniforms: {
      uViewportH: { value: 900.0 },
      uTime: { value: 0.0 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 aMeta;
      uniform float uViewportH;
      varying vec3 vColor;
      varying vec2 vMeta;
      void main() {
        vColor = color;
        vMeta = aMeta;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float isSpark = aMeta.y;
        // Billow steam expands smoothly as it cools; sparks stay razor-sharp!
        float worldSize = isSpark > 0.5
          ? mix(0.26, 0.08, aMeta.x)
          : mix(0.22, 0.72, aMeta.x);
        gl_PointSize = clamp((worldSize * uViewportH * 0.55) / max(0.35, -mv.z), 2.0, 96.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vColor;
      varying vec2 vMeta;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;
        float lifeFade = sin(clamp(1.0 - vMeta.x, 0.0, 1.0) * 3.14159265 * 0.85);
        if (vMeta.y > 0.5) {
          // Crisp 4-pointed diamond plasma spark flare + incandescent white core
          float crossStar = exp(-abs(uv.x) * 9.5) * exp(-abs(uv.y) * 2.2) +
                            exp(-abs(uv.y) * 9.5) * exp(-abs(uv.x) * 2.2);
          float core = exp(-r * r * 12.0);
          float alpha = clamp((core * 1.15 + crossStar * 0.65) * lifeFade, 0.0, 1.0);
          if (alpha < 0.01) discard;
          vec3 hotCol = mix(vColor, vec3(1.0, 0.98, 0.90), clamp(core, 0.0, 1.0));
          gl_FragColor = vec4(hotCol * 1.45, alpha);
        } else {
          // Soft turbulent pressurized vapor billow (zero square edges!)
          float swirl = 0.82 + 0.18 * sin(uv.x * 5.2 + uTime * 7.0) * cos(uv.y * 5.2 - uTime * 6.0);
          float radial = pow(1.0 - r * r, 2.4) * swirl;
          float alpha = radial * lifeFade * 0.34;
          if (alpha < 0.006) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      }
    `
  });
  const steamPoints = new THREE.Points(steamGeo, steamMat);
  steamPoints.frustumCulled = false;
  worldGroup.add(steamPoints);

  // ===========================================================================
  // 4. AERODYNAMIC WINGTIP / BLADE-TIP CONDENSATION VORTEX RIBBONS
  // ===========================================================================
  const VORTEX_SEGS = 34;
  const buildVortexRibbon = () => {
    const pos = new Float32Array(VORTEX_SEGS * 2 * 3);
    const uv = new Float32Array(VORTEX_SEGS * 2 * 2);
    const indices: number[] = [];
    for (let i = 0; i < VORTEX_SEGS; i++) {
      uv[i * 4] = i / (VORTEX_SEGS - 1);
      uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i / (VORTEX_SEGS - 1);
      uv[i * 4 + 3] = 1;
      if (i < VORTEX_SEGS - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(indices);
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUvV;
        void main() {
          vUvV = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUvV;
        void main() {
          float edge = sin(vUvV.y * 3.14159265);
          float tail = 1.0 - vUvV.x;
          float a = edge * tail * tail * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.82, 0.95, 1.0), a);
        }
      `
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    worldGroup.add(mesh);
    const history: THREE.Vector3[] = Array.from({ length: VORTEX_SEGS }, () => new THREE.Vector3(0, -999, 0));
    return { g, m, mesh, pos, history, initialized: false };
  };
  const leftVortex = buildVortexRibbon();
  const rightVortex = buildVortexRibbon();

  // ===========================================================================
  // 5. HORIZON GOLDEN PATROL NAVIGATION CHEVRON RIBBON (+0.25m ABOVE TERRAIN)
  // ===========================================================================
  const PATROL_SEGS = 44;
  const patrolPos = new Float32Array(PATROL_SEGS * 2 * 3);
  const patrolUv = new Float32Array(PATROL_SEGS * 2 * 2);
  const patrolIdx: number[] = [];
  for (let i = 0; i < PATROL_SEGS; i++) {
    patrolUv[i * 4] = i / (PATROL_SEGS - 1);
    patrolUv[i * 4 + 1] = 0;
    patrolUv[i * 4 + 2] = i / (PATROL_SEGS - 1);
    patrolUv[i * 4 + 3] = 1;
    if (i < PATROL_SEGS - 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      patrolIdx.push(a, c, b, b, c, d);
    }
  }
  const patrolGeo = new THREE.BufferGeometry();
  patrolGeo.setAttribute('position', new THREE.BufferAttribute(patrolPos, 3));
  patrolGeo.setAttribute('uv', new THREE.BufferAttribute(patrolUv, 2));
  patrolGeo.setIndex(patrolIdx);

  const patrolMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0.0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUvN;
      void main() {
        vUvN = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUvN;
      void main() {
        float crossCenter = abs(vUvN.y - 0.5) * 2.0; // 0..1
        float chevron = fract(vUvN.x * 11.0 - uTime * 2.8 - crossCenter * 0.45);
        float arrowBand = 1.0 - smoothstep(0.0, 0.28, abs(chevron - 0.5));
        float rail = 1.0 - smoothstep(0.84, 1.0, crossCenter);
        float endFade = smoothstep(0.0, 0.08, vUvN.x) * (1.0 - smoothstep(0.88, 1.0, vUvN.x));
        float alpha = (arrowBand * 0.85 + (1.0 - rail) * 0.35) * rail * endFade;
        if (alpha < 0.02) discard;
        vec3 gold = mix(vec3(1.0, 0.62, 0.06), vec3(1.0, 0.94, 0.48), arrowBand);
        gl_FragColor = vec4(gold * 1.75, alpha * 0.85);
      }
    `
  });
  const patrolRibbonMesh = new THREE.Mesh(patrolGeo, patrolMat);
  patrolRibbonMesh.frustumCulled = false;
  patrolRibbonMesh.visible = false;
  worldGroup.add(patrolRibbonMesh);

  // ===========================================================================
  // 6. DEAD SPACE 100% DIEGETIC 3D DORSAL SPINE HOLOGRAPHIC ARC HUD [KEY U]
  // ===========================================================================
  const diegeticSpineGroup = new THREE.Group();
  diegeticSpineGroup.name = 'dead_space_diegetic_spine_hud';
  diegeticSpineGroup.visible = false;
  worldGroup.add(diegeticSpineGroup);

  const createArcBarMesh = (
    radius: number,
    startAng: number,
    spanAng: number,
    colLowHex: number,
    colHighHex: number,
    segmentsCount: number,
    reverseFill: boolean = false
  ) => {
    const geo = buildCurved3DArcGaugeGeometry(radius, 0.082, startAng, spanAng, 36);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uFill: { value: 0.65 },
        uColLow: { value: new THREE.Color(colLowHex) },
        uColHigh: { value: new THREE.Color(colHighHex) },
        uSegs: { value: segmentsCount },
        uReverse: { value: reverseFill ? 1.0 : 0.0 }
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUvA;
        void main() {
          vUvA = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFill;
        uniform vec3 uColLow;
        uniform vec3 uColHigh;
        uniform float uSegs;
        uniform float uReverse;
        varying vec2 vUvA;
        void main() {
          float prog = uReverse > 0.5 ? (1.0 - vUvA.x) : vUvA.x;
          float cell = fract(prog * uSegs);
          if (cell > 0.80) discard; // Crisp Dead Space segmented RIG slots!
          float lit = prog <= uFill ? 1.0 : 0.28;
          float rimY = 1.0 - smoothstep(0.34, 0.5, abs(vUvA.y - 0.5));
          vec3 col = mix(uColLow, uColHigh, clamp(prog, 0.0, 1.0));
          gl_FragColor = vec4(col * (0.75 + 2.15 * lit), (0.45 + 0.55 * lit) * rimY);
        }
      `
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 18;
    diegeticSpineGroup.add(m);
    return { geo, mat, mesh: m };
  };

  // 4 Curved Holographic Dorsal Spine Gauges framing the robot's back:
  // Left Flank (PWR outer cyan, RPM inner emerald; sweeping bottom-up) & Right Flank (HEAT outer amber-red, WPN inner violet; sweeping bottom-up)
  const pwrArc = createArcBarMesh(0.66, Math.PI - 0.64, 1.28, 0x0ea5e9, 0x67e8f9, 16.0, true);
  const rpmArc = createArcBarMesh(0.50, Math.PI - 0.56, 1.12, 0x10b981, 0x6ee7b7, 14.0, true);
  const heatArc = createArcBarMesh(0.66, -0.64, 1.28, 0xf59e0b, 0xff2a4b, 16.0, false);
  const wpnArc = createArcBarMesh(0.50, -0.56, 1.12, 0x8b5cf6, 0xf0abfc, 10.0, false);

  // Floating 3D Diegetic Header Strip right above the dorsal spine arcs (XY plane facing camera)
  const legendTex = createDiegeticHeaderLegendTexture();
  const legendVerts = new Float32Array([
    -0.44, -0.078, 0.0,   0.44, -0.078, 0.0,   0.44,  0.078, 0.0,
    -0.44, -0.078, 0.0,   0.44,  0.078, 0.0,  -0.44,  0.078, 0.0
  ]);
  const legendUvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  const legendGeo = new THREE.BufferGeometry();
  legendGeo.setAttribute('position', new THREE.BufferAttribute(legendVerts, 3));
  legendGeo.setAttribute('uv', new THREE.BufferAttribute(legendUvs, 2));
  const legendMat = new THREE.MeshBasicMaterial({
    map: legendTex,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false
  });
  const legendMesh = new THREE.Mesh(legendGeo, legendMat);
  legendMesh.position.set(0, 0.72, 0);
  legendMesh.frustumCulled = false;
  legendMesh.renderOrder = 18;
  diegeticSpineGroup.add(legendMesh);

  const _tmpLeftTip = new THREE.Vector3();
  const _tmpRightTip = new THREE.Vector3();
  const _tmpSplineA = new THREE.Vector3();
  const _tmpSplineMid = new THREE.Vector3();
  const _tmpSplineTangent = new THREE.Vector3();
  const _tmpCamOffset = new THREE.Vector3();

  const updateVortexStrip = (
    vortex: ReturnType<typeof buildVortexRibbon>,
    tipWorld: THREE.Vector3,
    active: boolean,
    opacity: number
  ) => {
    if (!active || opacity < 0.02) {
      vortex.mesh.visible = false;
      vortex.initialized = false;
      return;
    }
    vortex.mesh.visible = true;
    vortex.m.uniforms.uOpacity.value = opacity;

    if (!vortex.initialized) {
      for (const h of vortex.history) h.copy(tipWorld);
      vortex.initialized = true;
    } else {
      for (let i = VORTEX_SEGS - 1; i > 0; i--) {
        vortex.history[i].copy(vortex.history[i - 1]);
      }
      vortex.history[0].copy(tipWorld);
    }

    for (let i = 0; i < VORTEX_SEGS; i++) {
      const p = vortex.history[i];
      const halfW = 0.03 + (i / VORTEX_SEGS) * 0.11;
      const b = i * 6;
      vortex.pos[b] = p.x;
      vortex.pos[b + 1] = p.y - halfW;
      vortex.pos[b + 2] = p.z;
      vortex.pos[b + 3] = p.x;
      vortex.pos[b + 4] = p.y + halfW;
      vortex.pos[b + 5] = p.z;
    }
    vortex.g.attributes.position.needsUpdate = true;
  };

  const updateSandboxAaaFX: AaaSandboxSceneFXController['updateSandboxAaaFX'] = ({
    dt,
    simTime,
    actorWorldPos,
    actorGroundY,
    actorYaw,
    modelHeightSpan,
    speedMetersPerSec,
    yawRateRadS,
    dropState,
    overheatState,
    patrolRibbonActive,
    patrolTargetWorld,
    sampleGroundHeight,
    diegeticHudActive,
    spineTelemetry,
    cameraWorldPos,
    cameraQuaternion
  }) => {
    // 1. Orbital Dropfall VFX
    if (dropState.active) {
      dropRigGroup.visible = dropState.shockConeIntensity > 0.01 || dropState.retroBurnIntensity > 0.01;
      shockConeMat.uniforms.uIntensity.value = dropState.shockConeIntensity;
      shockConeMat.uniforms.uTime.value = simTime;
      machRingMat.opacity = dropState.shockConeIntensity * 0.55;
      const ringScale = 0.95 + Math.sin(simTime * 28.0) * 0.12;
      machRingMesh.scale.set(ringScale, 1, ringScale);

      retroMat.opacity = dropState.retroBurnIntensity * 0.88;
      const retroLen = 0.65 + dropState.retroBurnIntensity * 0.9;
      retroLeft.scale.set(1, retroLen, 1);
      retroRight.scale.set(1, retroLen, 1);

      if (dropState.seismicWaveProgress > 0.005) {
        seismicMesh.visible = true;
        seismicMesh.position.set(actorWorldPos.x, actorGroundY + 0.05, actorWorldPos.z);
        const rad = 1.2 + dropState.seismicWaveProgress * 16.5;
        seismicMesh.scale.set(rad, 1, rad);
        seismicMat.uniforms.uProgress.value = dropState.seismicWaveProgress;
      } else {
        seismicMesh.visible = false;
      }
    } else {
      dropRigGroup.visible = false;
      seismicMesh.visible = false;
    }

    // 2A. 4-Corner 60ms Feathered RCS Cold-Gas Attitude Micro-Thrusters
    for (let c = 0; c < 4; c++) {
      const rem = overheatState.rcsTimers[c];
      const rcs = rcsCorners[c];
      if (rem > 0.002) {
        rcs.mesh.visible = true;
        const env = Math.min(1.0, rem / 0.06);
        rcs.mat.uniforms.uEnv.value = env;
        const s = 0.82 + 0.36 * env;
        rcs.mesh.scale.set(s, s, s);
      } else {
        rcs.mesh.visible = false;
      }
    }

    // 2B. AC6 Overheat Forced Volumetric Steam & Diamond Spark Jets
    steamMat.uniforms.uTime.value = simTime;
    if (overheatState.steamJetIntensity > 0.05 && dt > 0) {
      for (let k = 0; k < 4; k++) {
        const idx = steamCursor % STEAM_POOL;
        steamCursor++;
        const ang = Math.random() * Math.PI * 2;
        const isSpark = k === 0;
        const spd = isSpark ? 5.6 + Math.random() * 3.4 : 2.6 + Math.random() * 1.9;
        steamPos[idx * 3] = actorWorldPos.x + Math.cos(ang) * 0.42;
        steamPos[idx * 3 + 1] = actorWorldPos.y + modelHeightSpan * (0.42 + Math.random() * 0.32);
        steamPos[idx * 3 + 2] = actorWorldPos.z + Math.sin(ang) * 0.42;
        steamVel[idx * 3] = Math.cos(ang) * spd;
        steamVel[idx * 3 + 1] = 1.6 + Math.random() * 2.2;
        steamVel[idx * 3 + 2] = Math.sin(ang) * spd;
        if (isSpark) {
          steamCol[idx * 3] = 1.0;
          steamCol[idx * 3 + 1] = 0.62;
          steamCol[idx * 3 + 2] = 0.16;
          steamLife[idx] = 0.44;
          steamMeta[idx * 2] = 0.0;
          steamMeta[idx * 2 + 1] = 1.0;
        } else {
          steamCol[idx * 3] = 0.78;
          steamCol[idx * 3 + 1] = 0.92;
          steamCol[idx * 3 + 2] = 1.0;
          steamLife[idx] = 0.72;
          steamMeta[idx * 2] = 0.0;
          steamMeta[idx * 2 + 1] = 0.0;
        }
      }
    }
    if (dt > 0) {
      for (let i = 0; i < STEAM_POOL; i++) {
        if (steamLife[i] > 0) {
          const maxL = steamMeta[i * 2 + 1] > 0.5 ? 0.44 : 0.72;
          steamLife[i] -= dt;
          if (steamLife[i] <= 0) {
            steamPos[i * 3 + 1] = -999;
            steamMeta[i * 2] = 1.0;
          } else {
            steamMeta[i * 2] = Math.min(1.0, Math.max(0.0, 1.0 - steamLife[i] / maxL));
            const drag = steamMeta[i * 2 + 1] > 0.5 ? 0.985 : 0.955;
            steamVel[i * 3] *= drag;
            steamVel[i * 3 + 2] *= drag;
            steamPos[i * 3] += steamVel[i * 3] * dt;
            steamPos[i * 3 + 1] += steamVel[i * 3 + 1] * dt;
            steamPos[i * 3 + 2] += steamVel[i * 3 + 2] * dt;
          }
        }
      }
      steamGeo.attributes.position.needsUpdate = true;
      steamGeo.attributes.color.needsUpdate = true;
      steamGeo.attributes.aMeta.needsUpdate = true;
    }

    // 4. Aerodynamic Wingtip / Blade-Tip Vortex Condensation Ribbons
    const absSpd = Math.abs(speedMetersPerSec);
    const aeroLoad = Math.min(1.0, Math.max(0, (absSpd - 3.2) / 10.0) + Math.abs(yawRateRadS) * 0.32);
    const fx = Math.cos(actorYaw);
    const fz = Math.sin(actorYaw);
    const rx = -fz;
    const rz = fx;
    _tmpLeftTip.set(
      actorWorldPos.x - fx * 0.45 - rx * 0.92,
      actorWorldPos.y + modelHeightSpan * 0.55,
      actorWorldPos.z - fz * 0.45 - rz * 0.92
    );
    _tmpRightTip.set(
      actorWorldPos.x - fx * 0.45 + rx * 0.92,
      actorWorldPos.y + modelHeightSpan * 0.55,
      actorWorldPos.z - fz * 0.45 + rz * 0.92
    );
    updateVortexStrip(leftVortex, _tmpLeftTip, aeroLoad > 0.08, aeroLoad * 0.55);
    updateVortexStrip(rightVortex, _tmpRightTip, aeroLoad > 0.08, aeroLoad * 0.55);

    // 5. Horizon Golden Patrol Navigation Chevron Ribbon (+0.25m above terrain)
    if (patrolRibbonActive && patrolTargetWorld) {
      patrolRibbonMesh.visible = true;
      patrolMat.uniforms.uTime.value = simTime;

      _tmpSplineA.set(actorWorldPos.x + fx * 1.1, actorGroundY + 0.25, actorWorldPos.z + fz * 1.1);
      const dist = _tmpSplineA.distanceTo(patrolTargetWorld);
      _tmpSplineTangent.set(fx * Math.min(5.5, dist * 0.22), 0, fz * Math.min(5.5, dist * 0.22));
      _tmpSplineMid
        .copy(_tmpSplineA)
        .lerp(patrolTargetWorld, 0.45)
        .add(_tmpSplineTangent);

      for (let i = 0; i < PATROL_SEGS; i++) {
        const u = i / (PATROL_SEGS - 1);
        const inv = 1 - u;
        const px = inv * inv * _tmpSplineA.x + 2 * inv * u * _tmpSplineMid.x + u * u * patrolTargetWorld.x;
        const pz = inv * inv * _tmpSplineA.z + 2 * inv * u * _tmpSplineMid.z + u * u * patrolTargetWorld.z;
        const py = sampleGroundHeight(px, pz) + 0.25;

        const uNext = Math.min(1, u + 0.03);
        const invN = 1 - uNext;
        const nx = invN * invN * _tmpSplineA.x + 2 * invN * uNext * _tmpSplineMid.x + uNext * uNext * patrolTargetWorld.x;
        const nz = invN * invN * _tmpSplineA.z + 2 * invN * uNext * _tmpSplineMid.z + uNext * uNext * patrolTargetWorld.z;
        let tx = nx - px;
        let tz = nz - pz;
        const tLen = Math.hypot(tx, tz) || 1;
        tx /= tLen;
        tz /= tLen;
        const sideX = -tz * 0.36;
        const sideZ = tx * 0.36;

        const b = i * 6;
        patrolPos[b] = px - sideX;
        patrolPos[b + 1] = py;
        patrolPos[b + 2] = pz - sideZ;
        patrolPos[b + 3] = px + sideX;
        patrolPos[b + 4] = py;
        patrolPos[b + 5] = pz + sideZ;
      }
      patrolGeo.attributes.position.needsUpdate = true;
    } else {
      patrolRibbonMesh.visible = false;
    }

    // 6. Dead Space 100% Diegetic 3D Dorsal Spine HUD (0.28m behind robot dorsal spine toward camera!)
    diegeticSpineGroup.visible = diegeticHudActive;
    if (diegeticHudActive) {
      if (cameraWorldPos) {
        _tmpCamOffset.subVectors(cameraWorldPos, actorWorldPos);
        _tmpCamOffset.y = 0;
        if (_tmpCamOffset.lengthSq() > 1e-4) {
          _tmpCamOffset.normalize().multiplyScalar(0.32);
        } else {
          _tmpCamOffset.set(-Math.cos(actorYaw) * 0.32, 0, -Math.sin(actorYaw) * 0.32);
        }
      } else {
        _tmpCamOffset.set(-Math.cos(actorYaw) * 0.32, 0, -Math.sin(actorYaw) * 0.32);
      }
      diegeticSpineGroup.position.set(
        actorWorldPos.x + _tmpCamOffset.x,
        actorWorldPos.y + modelHeightSpan * 0.62,
        actorWorldPos.z + _tmpCamOffset.z
      );
      if (cameraQuaternion) {
        diegeticSpineGroup.quaternion.copy(cameraQuaternion);
      }
      pwrArc.mat.uniforms.uFill.value = spineTelemetry.powerArcFill;
      heatArc.mat.uniforms.uFill.value = spineTelemetry.thermalSlotFill;
      rpmArc.mat.uniforms.uFill.value = spineTelemetry.rpmRingFill;
      wpnArc.mat.uniforms.uFill.value = spineTelemetry.weaponChargeFill;
    }
  };

  const dispose = () => {
    shockConeGeo.dispose();
    shockConeMat.dispose();
    machRingGeo.dispose();
    machRingMat.dispose();
    retroGeo.dispose();
    retroMat.dispose();
    seismicGeo.dispose();
    seismicMat.dispose();
    rcsGeo.dispose();
    for (const r of rcsCorners) r.mat.dispose();
    steamGeo.dispose();
    steamMat.dispose();
    leftVortex.g.dispose();
    leftVortex.m.dispose();
    rightVortex.g.dispose();
    rightVortex.m.dispose();
    patrolGeo.dispose();
    patrolMat.dispose();
    pwrArc.geo.dispose();
    pwrArc.mat.dispose();
    rpmArc.geo.dispose();
    rpmArc.mat.dispose();
    heatArc.geo.dispose();
    heatArc.mat.dispose();
    wpnArc.geo.dispose();
    wpnArc.mat.dispose();
    legendGeo.dispose();
    legendMat.dispose();
    legendTex.dispose();
  };

  return { worldGroup, actorAttachedGroup, updateSandboxAaaFX, dispose };
}

// ============================================================================
// HARDSPACE: SHIPBREAKER MAGNETIC GRAPPLE TETHER & URDF LOCK-RINGS CONTROLLER
// ============================================================================

export interface ShipbreakerSalvageController {
  group: THREE.Group;
  updateSalvageFX: (params: {
    enabled: boolean;
    simTime: number;
    jointWorldAnchors: { pos: THREE.Vector3; axisWorld: THREE.Vector3 }[];
    grappleActive: boolean;
    emitterWorld: THREE.Vector3;
    grappledPartCenterWorld: THREE.Vector3 | null;
    grappledPartRadius: number;
  }) => void;
  dispose: () => void;
}

export function createShipbreakerSalvageController(): ShipbreakerSalvageController {
  const group = new THREE.Group();
  group.name = 'shipbreaker_salvage_grapple_fx';

  // Pool of up to 32 URDF Joint Assembly Lock-Rings
  const MAX_LOCK_RINGS = 32;
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(0, Math.cos(a) * 0.085, Math.sin(a) * 0.085));
  }
  const sharedLockRingGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const sharedLockRingMat = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lockRings: THREE.LineLoop[] = [];
  for (let i = 0; i < MAX_LOCK_RINGS; i++) {
    const loop = new THREE.LineLoop(sharedLockRingGeo, sharedLockRingMat);
    loop.visible = false;
    group.add(loop);
    lockRings.push(loop);
  }

  // Curved Bézier Magnetic Grapple Beam (Primary Cyan Core + Secondary Helical Gold Wave + Capture Halo)
  const BEAM_SEGS = 48;
  const coreBeamArr = new Float32Array(BEAM_SEGS * 3);
  const waveBeamArr = new Float32Array(BEAM_SEGS * 3);

  const coreBeamGeo = new THREE.BufferGeometry();
  coreBeamGeo.setAttribute('position', new THREE.BufferAttribute(coreBeamArr, 3));
  const coreBeamMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const coreBeamLine = new THREE.Line(coreBeamGeo, coreBeamMat);
  coreBeamLine.frustumCulled = false;
  coreBeamLine.visible = false;
  group.add(coreBeamLine);

  const waveBeamGeo = new THREE.BufferGeometry();
  waveBeamGeo.setAttribute('position', new THREE.BufferAttribute(waveBeamArr, 3));
  const waveBeamMat = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const waveBeamLine = new THREE.Line(waveBeamGeo, waveBeamMat);
  waveBeamLine.frustumCulled = false;
  waveBeamLine.visible = false;
  group.add(waveBeamLine);

  // Magnetic Capture Field Halo around the floating .glb sub-part
  const captureHaloPts: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    captureHaloPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const captureHaloGeo = new THREE.BufferGeometry().setFromPoints(captureHaloPts);
  const captureHaloMat = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const captureHaloLoop = new THREE.LineLoop(captureHaloGeo, captureHaloMat);
  captureHaloLoop.visible = false;
  group.add(captureHaloLoop);

  const _defaultAxis = new THREE.Vector3(1, 0, 0);
  const _ctrlPt = new THREE.Vector3();
  const _ptOnCurve = new THREE.Vector3();

  const updateSalvageFX: ShipbreakerSalvageController['updateSalvageFX'] = ({
    enabled,
    simTime,
    jointWorldAnchors,
    grappleActive,
    emitterWorld,
    grappledPartCenterWorld,
    grappledPartRadius
  }) => {
    group.visible = enabled;
    if (!enabled) return;

    sharedLockRingMat.opacity = 0.55 + 0.35 * Math.sin(simTime * 5.0);
    for (let i = 0; i < MAX_LOCK_RINGS; i++) {
      const lr = lockRings[i];
      if (i < jointWorldAnchors.length) {
        const ja = jointWorldAnchors[i];
        lr.visible = true;
        lr.position.copy(ja.pos);
        lr.quaternion.setFromUnitVectors(_defaultAxis, ja.axisWorld);
        lr.rotateX(simTime * 1.4);
      } else {
        lr.visible = false;
      }
    }

    if (grappleActive && grappledPartCenterWorld) {
      coreBeamLine.visible = true;
      waveBeamLine.visible = true;
      captureHaloLoop.visible = true;

      _ctrlPt
        .copy(emitterWorld)
        .lerp(grappledPartCenterWorld, 0.45)
        .add(new THREE.Vector3(0, 0.32 + Math.sin(simTime * 6.0) * 0.06, 0));

      for (let i = 0; i < BEAM_SEGS; i++) {
        const t = i / (BEAM_SEGS - 1);
        const inv = 1 - t;
        _ptOnCurve.set(
          inv * inv * emitterWorld.x + 2 * inv * t * _ctrlPt.x + t * t * grappledPartCenterWorld.x,
          inv * inv * emitterWorld.y + 2 * inv * t * _ctrlPt.y + t * t * grappledPartCenterWorld.y,
          inv * inv * emitterWorld.z + 2 * inv * t * _ctrlPt.z + t * t * grappledPartCenterWorld.z
        );
        const env = Math.sin(t * Math.PI);
        const phase = t * 22.0 - simTime * 24.0;
        const amp = 0.055 * env;

        const b = i * 3;
        coreBeamArr[b] = _ptOnCurve.x + Math.cos(phase * 0.5) * amp * 0.35;
        coreBeamArr[b + 1] = _ptOnCurve.y + Math.sin(phase * 0.5) * amp * 0.35;
        coreBeamArr[b + 2] = _ptOnCurve.z;

        waveBeamArr[b] = _ptOnCurve.x + Math.cos(phase) * amp;
        waveBeamArr[b + 1] = _ptOnCurve.y + Math.sin(phase) * amp;
        waveBeamArr[b + 2] = _ptOnCurve.z + Math.sin(phase * 1.3) * amp;
      }
      coreBeamGeo.attributes.position.needsUpdate = true;
      waveBeamGeo.attributes.position.needsUpdate = true;

      captureHaloLoop.position.copy(grappledPartCenterWorld);
      const r = Math.max(0.14, grappledPartRadius * (0.95 + 0.08 * Math.sin(simTime * 10.0)));
      captureHaloLoop.scale.set(r, r, r);
      captureHaloLoop.rotation.set(simTime * 2.2, simTime * 3.1, 0);
    } else {
      coreBeamLine.visible = false;
      waveBeamLine.visible = false;
      captureHaloLoop.visible = false;
    }
  };

  const dispose = () => {
    sharedLockRingGeo.dispose();
    sharedLockRingMat.dispose();
    coreBeamGeo.dispose();
    coreBeamMat.dispose();
    waveBeamGeo.dispose();
    waveBeamMat.dispose();
    captureHaloGeo.dispose();
    captureHaloMat.dispose();
  };

  return { group, updateSalvageFX, dispose };
}
