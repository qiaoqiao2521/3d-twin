import * as THREE from 'three';

export type FeaColorMapId = 'turbo' | 'viridis' | 'jet';

export interface ScientificVizConfig {
  /** Illustrative load score; no finite-element solution or measured stress. */
  feaEnabled: boolean;
  /** Scientific colormap LUT */
  feaColorMap: FeaColorMapId;
  /** Iso-stress contour isolines overlay */
  feaContourLines: boolean;
  /** 3D Center of Mass (CoM) + Ground ZMP & Dynamic Support Polygon */
  comZmpEnabled: boolean;
  /** 3D Joint Torque Curved Arc Arrows & Tangential Velocity Vectors */
  torqueVectorsEnabled: boolean;
  /** Manipulator Kinematic Reachability Workspace Envelope */
  workspaceEnvelopeEnabled: boolean;
  /** Multi-beam rotating LiDAR persistent point cloud */
  lidarPersistEnabled: boolean;
  /** Point-cloud persistence decay duration in seconds [1.5 .. 10.0] */
  lidarDecaySec: number;
}

export function createDefaultScientificVizConfig(): ScientificVizConfig {
  return {
    feaEnabled: false,
    feaColorMap: 'turbo',
    feaContourLines: true,
    comZmpEnabled: false,
    torqueVectorsEnabled: false,
    workspaceEnvelopeEnabled: false,
    lidarPersistEnabled: false,
    lidarDecaySec: 4.5
  };
}

export function feaColorMapToShaderCode(map: FeaColorMapId): number {
  if (map === 'viridis') return 1;
  if (map === 'jet') return 2;
  return 0; // turbo
}

/**
 * Evaluates standard scientific colormaps (Turbo / Viridis / Jet) in [0, 1] -> linear/sRGB [r, g, b].
 */
export function evaluateScientificColorMap(
  value01: number,
  map: FeaColorMapId
): [number, number, number] {
  const x = Math.max(0, Math.min(1, value01));
  if (map === 'viridis') {
    const r = Math.max(0, Math.min(1, 0.267 + x * (0.004 + x * (2.78 - x * 2.06))));
    const g = Math.max(0, Math.min(1, 0.005 + x * (1.38 - x * 0.48)));
    const b = Math.max(0, Math.min(1, 0.329 + x * (1.42 - x * (2.68 - x * 1.08))));
    return [r, g, b];
  }
  if (map === 'jet') {
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 1)));
    return [r, g, b];
  }
  // Google Turbo polynomial approximation
  const r = Math.max(
    0,
    Math.min(
      1,
      0.13572 + x * (4.61539 + x * (-42.6603 + x * (132.131 + x * (-152.942 + x * 59.2864))))
    )
  );
  const g = Math.max(
    0,
    Math.min(
      1,
      0.0914 + x * (2.19419 + x * (4.84297 + x * (-14.185 + x * (4.2773 + x * 2.82957))))
    )
  );
  const b = Math.max(
    0,
    Math.min(
      1,
      0.10667 + x * (12.6419 + x * (-60.582 + x * (110.363 + x * (-89.9031 + x * 27.3482))))
    )
  );
  return [r, g, b];
}

/**
 * Computes a visual load score from authored heuristics. The legacy stressMpa
 * field is retained for renderer compatibility, not as a physical measurement.
 */
export function computeLinkVonMisesStress(params: {
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  cantileverDistMeters: number;
  jointOmegaRadS: number;
  loadFactor: number;
  pushSpike01: number;
  isImpactTarget?: boolean;
}): { sigma01: number; stressMpa: number; evidence: 'illustrative'; unit: null } {
  const n = params.partName.toLowerCase();
  const isLoadBearingJoint =
    n.includes('hip') ||
    n.includes('knee') ||
    n.includes('ankle') ||
    n.includes('thigh') ||
    n.includes('calf') ||
    n.includes('waist') ||
    n.includes('shoulder') ||
    n.includes('bogie') ||
    n.includes('rocker') ||
    n.includes('joint1') ||
    n.includes('joint2') ||
    n.includes('joint3') ||
    n.includes('flange') ||
    n.includes('harmonic');

  const layerBase = params.layer === 'L2' ? 0.34 : params.layer === 'L3' ? 0.24 : 0.14;
  const momentArmTerm = Math.max(0, 0.26 * (1 - Math.min(1, params.cantileverDistMeters / 1.15)));
  const dynamicTorqueTerm = Math.min(0.42, params.jointOmegaRadS * 0.065 + params.loadFactor * 0.18);
  const jointConcentrator = isLoadBearingJoint ? 0.16 : 0.0;
  const pushSurge =
    params.pushSpike01 * (params.isImpactTarget ? 0.68 : isLoadBearingJoint ? 0.52 : 0.2);

  const sigma01 = Math.max(
    0.03,
    Math.min(1.0, layerBase + momentArmTerm + dynamicTorqueTerm + jointConcentrator + pushSurge)
  );
  // Legacy colour-scale coordinate. No material or finite-element solve occurs.
  const stressMpa = Math.round(12 + Math.pow(sigma01, 1.28) * 403);
  return { sigma01, stressMpa, evidence: 'illustrative', unit: null };
}

export interface PartMassSample {
  partName: string;
  worldPos: [number, number, number];
  volumeWeight: number;
  isGroundContactCandidate: boolean;
}

export interface ComZmpSupportResult {
  comWorld: [number, number, number];
  zmpFloor: [number, number];
  supportHull2D: [number, number][];
  stabilityMargin01: number;
  statusLevel: 'stable' | 'warning' | 'critical' | 'unknown';
  evidence: 'illustrative';
  supportAvailable: boolean;
}

function cross2D(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function computeConvexHull2D(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function signedDistanceToConvexPolygon(pt: [number, number], poly: [number, number][]): number {
  if (poly.length < 3) return -0.2;
  let minEdgeDist = Infinity;
  let inside = true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez) || 1e-5;
    // CCW hull inward normal is (-ez, ex)
    const signed = ((pt[0] - a[0]) * -ez + (pt[1] - a[1]) * ex) / len;
    if (signed < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * ex + (pt[1] - a[1]) * ez) / (len * len)));
    const px = a[0] + ex * t;
    const pz = a[1] + ez * t;
    const d = Math.hypot(pt[0] - px, pt[1] - pz);
    if (d < minEdgeDist) minEdgeDist = d;
  }
  return inside ? minEdgeDist : -minEdgeDist;
}

/**
 * Volume-weighted centre and support projection for visual inspection. Contact
 * candidates are not measured forces; this is not an engineering stability test.
 */
export function computeRobotComAndSupportPolygon(params: {
  samples: PartMassSample[];
  floorY: number;
  comAccelXZ?: [number, number];
}): ComZmpSupportResult {
  let sumW = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const contactPts: [number, number][] = [];

  for (const s of params.samples) {
    if (!Number.isFinite(s.volumeWeight) || s.volumeWeight <= 0 ||
      !s.worldPos.every(Number.isFinite)) continue;
    const w = s.volumeWeight;
    sumW += w;
    cx += s.worldPos[0] * w;
    cy += s.worldPos[1] * w;
    cz += s.worldPos[2] * w;
    if (s.isGroundContactCandidate) {
      contactPts.push([s.worldPos[0], s.worldPos[2]]);
    }
  }

  if (sumW > 0) {
    cx /= sumW;
    cy /= sumW;
    cz /= sumW;
  } else {
    cy = params.floorY;
  }

  const hull = computeConvexHull2D(contactPts);
  // Never invent a rectangular support area or pad radius when contact data is
  // absent. Two points or a collinear set do not define a support polygon.
  const area = Math.abs(hull.reduce((sum, p, i) => {
    const next = hull[(i + 1) % hull.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0)) / 2;
  const supportAvailable = sumW > 0 && hull.length >= 3 && area > 1e-10;
  const comHeight = Math.max(0.18, cy - params.floorY);
  const g = 9.81;
  const ax = params.comAccelXZ ? params.comAccelXZ[0] : 0;
  const az = params.comAccelXZ ? params.comAccelXZ[1] : 0;
  const zmpX = cx - (comHeight / g) * ax;
  const zmpZ = cz - (comHeight / g) * az;

  const signedDist = signedDistanceToConvexPolygon([zmpX, zmpZ], hull);
  const stabilityMargin01 = supportAvailable ? Math.max(0, Math.min(1, (signedDist + 0.04) / 0.24)) : 0;
  const statusLevel: ComZmpSupportResult['statusLevel'] = !supportAvailable ? 'unknown' :
    stabilityMargin01 >= 0.42 ? 'stable' : stabilityMargin01 >= 0.16 ? 'warning' : 'critical';

  return {
    comWorld: [cx, cy, cz],
    zmpFloor: [zmpX, zmpZ],
    supportHull2D: supportAvailable ? hull : [],
    stabilityMargin01,
    statusLevel,
    evidence: 'illustrative',
    supportAvailable
  };
}

/**
 * Calibrated Multi-Zone FLIR Thermal Diffusion Model returning physical °C
 * for hover thermography inspection and FLIR colormap LUTs.
 */
export function computeCalibratedFlirTemperatureC(params: {
  contextId: string;
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  loadFactor: number;
  pushSpike01?: number;
}): { tempC: number; normalized01: number; zoneLabel: string } {
  const id = params.contextId.toLowerCase();
  const n = params.partName.toLowerCase();
  const load = Math.max(0, Math.min(1.5, params.loadFactor));
  const pushExtra = (params.pushSpike01 || 0) * 18.5;

  if ((id.includes('cfm56') || id.includes('b737')) && (n.includes('combustor') || n.includes('hpt') || n.includes('nozzle') || n.includes('lpt'))) {
    const tempC = Number((460 + load * 340 + pushExtra).toFixed(1));
    return { tempC, normalized01: Math.min(1, tempC / 850), zoneLabel: '高压涡轮热端核心' };
  }

  if (id === 'mars2020' && (n.includes('mmrtg') || n.includes('rtg') || n.includes('heat'))) {
    const tempC = Number((196.4 + load * 14.2).toFixed(1));
    return { tempC, normalized01: 0.94, zoneLabel: 'MMRTG 钚-238 热源核' };
  }

  if (n.includes('head') || n.includes('torso') || n.includes('compute') || n.includes('orin') || n.includes('imu') || n.includes('lidar')) {
    const tempC = Number((46.5 + load * 19.8 + pushExtra * 0.45).toFixed(1));
    return {
      tempC,
      normalized01: Math.min(1, (tempC - 20) / 68),
      zoneLabel: '边缘 AI 算力与传感舱'
    };
  }

  if (
    params.layer === 'L2' ||
    n.includes('hip') ||
    n.includes('knee') ||
    n.includes('thigh') ||
    n.includes('motor') ||
    n.includes('servo') ||
    n.includes('joint') ||
    n.includes('thruster')
  ) {
    const tempC = Number((38.2 + load * 31.4 + pushExtra).toFixed(1));
    return {
      tempC,
      normalized01: Math.min(1, (tempC - 20) / 68),
      zoneLabel: 'FOC 谐波伺服定子绕组'
    };
  }

  if (n.includes('pelvis') || n.includes('battery') || n.includes('base') || n.includes('chassis')) {
    const tempC = Number((32.8 + load * 13.6 + pushExtra * 0.3).toFixed(1));
    return {
      tempC,
      normalized01: Math.min(1, (tempC - 20) / 68),
      zoneLabel: '高压母线电池组'
    };
  }

  const tempC = Number((23.4 + load * 7.8 + pushExtra * 0.15).toFixed(1));
  return {
    tempC,
    normalized01: Math.max(0.06, Math.min(1, (tempC - 20) / 68)),
    zoneLabel: '结构散热蒙皮'
  };
}

export interface TorqueJointSample {
  worldPos: THREE.Vector3;
  axisWorld: THREE.Vector3;
  torqueRatio01: number;
  omegaRadS: number;
}

export interface ScientificVizSceneController {
  group: THREE.Group;
  update: (params: {
    config: ScientificVizConfig;
    contextId: string;
    floorY: number;
    simTime: number;
    dt: number;
    comZmp: ComZmpSupportResult | null;
    torqueSamples: TorqueJointSample[];
    workspaceOriginWorld: THREE.Vector3;
    workspaceMaxRadius: number;
    lidarOriginWorld: THREE.Vector3;
    robotBoundsBox: THREE.Box3 | null;
    raycastTargets?: THREE.Object3D[];
    hidden: boolean;
  }) => void;
  clearLidarCloud: () => void;
  dispose: () => void;
}

function createCircularPointSpriteTexture(): THREE.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 64, 64);
      const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
      grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.88)');
      grad.addColorStop(0.88, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }
  }
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const alpha = r > 1.0 ? 0 : Math.pow(1.0 - r * r, 1.6);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function attachCircularPointCoordDiscard(mat: THREE.PointsMaterial, cacheKey: string): void {
  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `void main() {
        vec2 ptCentered = gl_PointCoord - vec2(0.5);
        float ptRad = length(ptCentered);
        if (ptRad > 0.5) discard;`
    );
  };
}

/**
 * Creates the 3D scene visualization assembly for:
 * - CoM 3D black-gold marker + vertical plumb drop + dynamic Support Polygon + ZMP Ribbon
 * - 3D Curved Joint Torque Vector Arcs + Arrowheads
 * - Semi-transparent Kinematic Reachability Workspace Envelope
 * - Persistent Multi-Beam Rotating LiDAR Point Cloud (`4,096` ring buffer)
 */
export function createScientificVizSceneController(): ScientificVizSceneController {
  const group = new THREE.Group();
  group.name = 'scientific_computing_viz_group';

  // --------------------------------------------------------------------------
  // 1. CoM & ZMP Support Polygon Sub-Group
  // --------------------------------------------------------------------------
  const comGroup = new THREE.Group();
  group.add(comGroup);

  const comSphereGeo = new THREE.SphereGeometry(0.052, 20, 16);
  const comSphereMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vLocal;
      void main() {
        // Classic NASA/JPL octant CoM fiducial target (black & amber-gold quadrants)
        float oct = sign(vLocal.x) * sign(vLocal.y) * sign(vLocal.z);
        vec3 col = oct > 0.0 ? vec3(0.98, 0.78, 0.12) : vec3(0.08, 0.10, 0.14);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const comMarker = new THREE.Mesh(comSphereGeo, comSphereMat);
  comGroup.add(comMarker);

  const plumbPos = new Float32Array(6);
  const plumbGeo = new THREE.BufferGeometry();
  plumbGeo.setAttribute('position', new THREE.BufferAttribute(plumbPos, 3));
  const plumbMat = new THREE.LineBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const plumbLine = new THREE.Line(plumbGeo, plumbMat);
  plumbLine.frustumCulled = false;
  comGroup.add(plumbLine);

  // Support Polygon Fill + Crisp Perimeter Loop (up to 32 hull vertices)
  const maxHullVerts = 32;
  const polyLoopPos = new Float32Array(maxHullVerts * 3);
  const polyLoopGeo = new THREE.BufferGeometry();
  polyLoopGeo.setAttribute('position', new THREE.BufferAttribute(polyLoopPos, 3));
  const polyLoopMat = new THREE.LineBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const polyLoop = new THREE.LineLoop(polyLoopGeo, polyLoopMat);
  polyLoop.frustumCulled = false;
  comGroup.add(polyLoop);

  const polyFillPos = new Float32Array(maxHullVerts * 3 * 3);
  const polyFillGeo = new THREE.BufferGeometry();
  polyFillGeo.setAttribute('position', new THREE.BufferAttribute(polyFillPos, 3));
  const polyFillMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const polyFill = new THREE.Mesh(polyFillGeo, polyFillMat);
  polyFill.frustumCulled = false;
  comGroup.add(polyFill);

  // ZMP Floor Marker + 64-Point ZMP Trajectory Ribbon
  const zmpRingGeo = new THREE.RingGeometry(0.025, 0.044, 24);
  zmpRingGeo.rotateX(-Math.PI * 0.5);
  const zmpRingMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const zmpRing = new THREE.Mesh(zmpRingGeo, zmpRingMat);
  comGroup.add(zmpRing);

  const zmpTrailMax = 56;
  const zmpHistory: [number, number][] = [];
  const zmpTrailPos = new Float32Array(zmpTrailMax * 3);
  const zmpTrailGeo = new THREE.BufferGeometry();
  zmpTrailGeo.setAttribute('position', new THREE.BufferAttribute(zmpTrailPos, 3));
  const zmpTrailMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  const zmpTrailLine = new THREE.Line(zmpTrailGeo, zmpTrailMat);
  zmpTrailLine.frustumCulled = false;
  comGroup.add(zmpTrailLine);

  // --------------------------------------------------------------------------
  // 2. 3D Joint Torque Curved Arc Arrows Pool (up to 16 active joints)
  // --------------------------------------------------------------------------
  const torqueGroup = new THREE.Group();
  group.add(torqueGroup);

  const maxTorqueArcs = 16;
  const torqueArcPool: {
    holder: THREE.Group;
    arcMesh: THREE.Mesh;
    tipMesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
  }[] = [];

  const sharedArcTorus = new THREE.TorusGeometry(0.095, 0.0065, 8, 24, Math.PI * 1.35);
  const sharedTipCone = new THREE.ConeGeometry(0.019, 0.046, 10);

  for (let i = 0; i < maxTorqueArcs; i++) {
    const holder = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    const arcMesh = new THREE.Mesh(sharedArcTorus, mat);
    const tipMesh = new THREE.Mesh(sharedTipCone, mat);
    const endAng = Math.PI * 1.35;
    tipMesh.position.set(Math.cos(endAng) * 0.095, Math.sin(endAng) * 0.095, 0);
    tipMesh.rotation.z = endAng + Math.PI * 0.5;
    holder.add(arcMesh);
    holder.add(tipMesh);
    holder.visible = false;
    torqueGroup.add(holder);
    torqueArcPool.push({ holder, arcMesh, tipMesh, mat });
  }

  // --------------------------------------------------------------------------
  // 3. Kinematic Reachability Workspace Envelope (Geodesic Wire + Point Lattice)
  // --------------------------------------------------------------------------
  const envGroup = new THREE.Group();
  group.add(envGroup);

  const circularPointTex = createCircularPointSpriteTexture();

  const outerEnvGeo = new THREE.SphereGeometry(1.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.72);
  const outerEnvWireGeo = new THREE.WireframeGeometry(outerEnvGeo);
  const outerEnvWireMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const outerEnvWire = new THREE.LineSegments(outerEnvWireGeo, outerEnvWireMat);
  envGroup.add(outerEnvWire);

  const outerEnvShellMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const outerEnvShell = new THREE.Mesh(outerEnvGeo, outerEnvShellMat);
  envGroup.add(outerEnvShell);

  // Volumetric workspace reachability point lattice (circular smooth discard, zero square blocks)
  const latPts: number[] = [];
  for (let ir = 0; ir < 3; ir++) {
    const r = 0.42 + ir * 0.28;
    for (let ip = 1; ip <= 6; ip++) {
      const phi = (ip / 8) * Math.PI * 0.72;
      for (let it = 0; it < 16; it++) {
        const theta = (it / 16) * Math.PI * 2;
        latPts.push(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r,
          Math.sin(phi) * Math.sin(theta) * r
        );
      }
    }
  }
  const latGeo = new THREE.BufferGeometry();
  latGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(latPts), 3));
  const latMat = new THREE.PointsMaterial({
    map: circularPointTex,
    color: 0x67e8f9,
    size: 0.026,
    alphaTest: 0.03,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  attachCircularPointCoordDiscard(latMat, 'sci_viz_lat_circular_pt_v1');
  envGroup.add(new THREE.Points(latGeo, latMat));

  // --------------------------------------------------------------------------
  // 4. Persistent Multi-Beam Rotating LiDAR Point Cloud (`4,096` Ring Buffer)
  // --------------------------------------------------------------------------
  const lidarGroup = new THREE.Group();
  group.add(lidarGroup);

  const lidarCap = 4096;
  const lidarPos = new Float32Array(lidarCap * 3);
  const lidarCol = new Float32Array(lidarCap * 3);
  const lidarAge = new Float32Array(lidarCap);
  const lidarBaseRgb = new Float32Array(lidarCap * 3);
  for (let i = 0; i < lidarCap; i++) {
    lidarPos[i * 3 + 1] = -999;
    lidarAge[i] = 999;
  }
  let lidarWriteIdx = 0;

  const lidarGeo = new THREE.BufferGeometry();
  lidarGeo.setAttribute('position', new THREE.BufferAttribute(lidarPos, 3));
  lidarGeo.setAttribute('color', new THREE.BufferAttribute(lidarCol, 3));
  const lidarMat = new THREE.PointsMaterial({
    map: circularPointTex,
    size: 0.036,
    alphaTest: 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  attachCircularPointCoordDiscard(lidarMat, 'sci_viz_lidar_circular_pt_v1');
  const lidarPoints = new THREE.Points(lidarGeo, lidarMat);
  lidarPoints.frustumCulled = false;
  lidarGroup.add(lidarPoints);

  // Rotating 16-ray laser emitter fan lines from head/LiDAR sensor
  const beamCount = 16;
  const beamLinePos = new Float32Array(beamCount * 6);
  const beamLineGeo = new THREE.BufferGeometry();
  beamLineGeo.setAttribute('position', new THREE.BufferAttribute(beamLinePos, 3));
  const beamLineMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beamLines = new THREE.LineSegments(beamLineGeo, beamLineMat);
  beamLines.frustumCulled = false;
  lidarGroup.add(beamLines);

  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _tmpQuat = new THREE.Quaternion();
  const _tmpAxis = new THREE.Vector3();
  const _sensorOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _lidarRaycaster = new THREE.Raycaster();
  _lidarRaycaster.near = 0.14;
  _lidarRaycaster.far = 14.0;
  const _rayHitsScratch: THREE.Intersection[] = [];
  const _autoSceneMeshesScratch: THREE.Mesh[] = [];
  let _cachedParentChildCount = -1;
  let _cachedParentFrameTick = -999;

  return {
    group,
    clearLidarCloud() {
      for (let i = 0; i < lidarCap; i++) {
        lidarPos[i * 3 + 1] = -999;
        lidarAge[i] = 999;
      }
      lidarGeo.attributes.position.needsUpdate = true;
    },

    update(params) {
      if (params.hidden) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const { config, floorY, simTime, dt } = params;

      // 1. Update CoM + ZMP + Support Polygon
      if (config.comZmpEnabled && params.comZmp) {
        comGroup.visible = true;
        const { comWorld, zmpFloor, supportHull2D, statusLevel } = params.comZmp;
        comMarker.position.set(comWorld[0], comWorld[1], comWorld[2]);
        comMarker.rotation.y = simTime * 0.9;

        const floorLift = floorY + 0.016;
        plumbPos[0] = comWorld[0];
        plumbPos[1] = comWorld[1];
        plumbPos[2] = comWorld[2];
        plumbPos[3] = comWorld[0];
        plumbPos[4] = floorLift;
        plumbPos[5] = comWorld[2];
        plumbGeo.attributes.position.needsUpdate = true;

        const statusHex =
          statusLevel === 'unknown' ? 0x94a3b8 : statusLevel === 'stable' ? 0x10b981 : statusLevel === 'warning' ? 0xf59e0b : 0xef4444;
        polyLoopMat.color.setHex(statusHex);
        polyFillMat.color.setHex(statusHex);
        zmpRingMat.color.setHex(statusLevel === 'stable' ? 0x00e5ff : statusHex);

        const hullLen = Math.min(maxHullVerts, supportHull2D.length);
        zmpRing.visible = statusLevel !== 'unknown';
        zmpTrailLine.visible = statusLevel !== 'unknown';
        if (hullLen >= 3) {
          let cx = 0;
          let cz = 0;
          for (let i = 0; i < hullLen; i++) {
            const [hx, hz] = supportHull2D[i];
            cx += hx;
            cz += hz;
            polyLoopPos[i * 3] = hx;
            polyLoopPos[i * 3 + 1] = floorLift;
            polyLoopPos[i * 3 + 2] = hz;
          }
          cx /= hullLen;
          cz /= hullLen;
          polyLoopGeo.setDrawRange(0, hullLen);
          polyLoopGeo.attributes.position.needsUpdate = true;

          for (let i = 0; i < hullLen; i++) {
            const a = supportHull2D[i];
            const b = supportHull2D[(i + 1) % hullLen];
            const base = i * 9;
            polyFillPos[base] = cx;
            polyFillPos[base + 1] = floorLift - 0.002;
            polyFillPos[base + 2] = cz;
            polyFillPos[base + 3] = a[0];
            polyFillPos[base + 4] = floorLift - 0.002;
            polyFillPos[base + 5] = a[1];
            polyFillPos[base + 6] = b[0];
            polyFillPos[base + 7] = floorLift - 0.002;
            polyFillPos[base + 8] = b[1];
          }
          polyFillGeo.setDrawRange(0, hullLen * 3);
          polyFillGeo.attributes.position.needsUpdate = true;
        } else {
          polyLoopGeo.setDrawRange(0, 0);
          polyFillGeo.setDrawRange(0, 0);
          zmpHistory.length = 0;
        }

        zmpRing.position.set(zmpFloor[0], floorLift + 0.003, zmpFloor[1]);
        if (
          zmpHistory.length === 0 ||
          Math.hypot(
            zmpFloor[0] - zmpHistory[zmpHistory.length - 1][0],
            zmpFloor[1] - zmpHistory[zmpHistory.length - 1][1]
          ) > 0.008
        ) {
          zmpHistory.push([zmpFloor[0], zmpFloor[1]]);
          if (zmpHistory.length > zmpTrailMax) zmpHistory.shift();
        }
        for (let i = 0; i < zmpHistory.length; i++) {
          zmpTrailPos[i * 3] = zmpHistory[i][0];
          zmpTrailPos[i * 3 + 1] = floorLift + 0.004;
          zmpTrailPos[i * 3 + 2] = zmpHistory[i][1];
        }
        zmpTrailGeo.setDrawRange(0, zmpHistory.length);
        zmpTrailGeo.attributes.position.needsUpdate = true;
      } else {
        comGroup.visible = false;
      }

      // 2. Update 3D Joint Torque Arc Arrows
      if (config.torqueVectorsEnabled && params.torqueSamples.length > 0) {
        torqueGroup.visible = true;
        const count = Math.min(maxTorqueArcs, params.torqueSamples.length);
        for (let i = 0; i < maxTorqueArcs; i++) {
          const item = torqueArcPool[i];
          if (i >= count) {
            item.holder.visible = false;
            continue;
          }
          const smp = params.torqueSamples[i];
          item.holder.visible = true;
          item.holder.position.copy(smp.worldPos);
          _tmpAxis.copy(smp.axisWorld);
          if (_tmpAxis.lengthSq() < 1e-5) _tmpAxis.set(0, 1, 0);
          _tmpAxis.normalize();
          _tmpQuat.setFromUnitVectors(_zAxis, _tmpAxis);
          item.holder.quaternion.copy(_tmpQuat);
          item.holder.rotateZ(simTime * (1.5 + smp.omegaRadS * 0.8));

          const t01 = Math.max(0.08, Math.min(1, smp.torqueRatio01));
          const scale = 0.65 + t01 * 0.95;
          item.holder.scale.setScalar(scale);
          const [r, g, b] = evaluateScientificColorMap(t01, 'turbo');
          item.mat.color.setRGB(r, g, b);
        }
      } else {
        torqueGroup.visible = false;
      }

      // 3. Update Kinematic Reachability Workspace Envelope
      if (config.workspaceEnvelopeEnabled) {
        envGroup.visible = true;
        envGroup.position.copy(params.workspaceOriginWorld);
        envGroup.scale.setScalar(Math.max(0.45, params.workspaceMaxRadius));
        envGroup.rotation.y = simTime * 0.14;
      } else {
        envGroup.visible = false;
      }

      // 4. Update Persistent Multi-Beam Rotating LiDAR Point Cloud (Real MeshBVH + Floor Raycast)
      if (config.lidarPersistEnabled) {
        lidarGroup.visible = true;
        const decay = Math.max(1.2, config.lidarDecaySec);
        const orig = params.lidarOriginWorld;
        const hasValidBounds = Boolean(params.robotBoundsBox && !params.robotBoundsBox.isEmpty());
        const sensorElevY = hasValidBounds
          ? params.robotBoundsBox!.max.y - 0.12
          : Math.max(orig.y, floorY + 1.15);
        _sensorOrigin.set(orig.x, sensorElevY, orig.z);

        // Gather real 3D mesh raycast targets (either explicit raycastTargets or physical meshes in parent scene)
        const explicitTargets = params.raycastTargets;
        const useExplicitTargets = Boolean(explicitTargets && explicitTargets.length > 0);
        if (!useExplicitTargets && group.parent) {
          const tickSlot = Math.floor(simTime * 4);
          if (
            group.parent.children.length !== _cachedParentChildCount ||
            tickSlot !== _cachedParentFrameTick
          ) {
            _cachedParentChildCount = group.parent.children.length;
            _cachedParentFrameTick = tickSlot;
            _autoSceneMeshesScratch.length = 0;
            for (let ci = 0; ci < group.parent.children.length; ci++) {
              const rootChild = group.parent.children[ci];
              if (rootChild === group || !rootChild.visible) continue;
              rootChild.traverseVisible((node) => {
                if (!(node as THREE.Mesh).isMesh || (node as THREE.InstancedMesh).isInstancedMesh) return;
                const m = node as THREE.Mesh;
                if (m.name === 'infinite_matte_industrial_deck') return;
                const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material & {
                  isShaderMaterial?: boolean;
                  wireframe?: boolean;
                };
                if (
                  !mat ||
                  mat.isShaderMaterial ||
                  mat.blending === THREE.AdditiveBlending ||
                  mat.wireframe ||
                  (mat.transparent && mat.opacity < 0.25)
                ) {
                  return;
                }
                _autoSceneMeshesScratch.push(m);
              });
            }
          }
        }

        const spinYaw = simTime * 3.8;
        const maxLidarRange = 12.0;

        // Emit 36 rotating multi-beam rays per frame from actual upper head/sensor elevation
        for (let b = 0; b < 36; b++) {
          const az = spinYaw + (b / 36) * 0.55;
          const elev = 0.04 - ((b % 12) / 11) * 0.72;
          const cosE = Math.cos(elev);
          const dx = Math.cos(az) * cosE;
          const dy = Math.sin(elev);
          const dz = Math.sin(az) * cosE;
          _rayDir.set(dx, dy, dz).normalize();

          let hitDist = maxLidarRange;
          let hitValid = false;

          // 1) Exact analytical floor plane intersection
          if (_rayDir.y < -0.004) {
            const tFloor = (floorY + 0.012 - _sensorOrigin.y) / _rayDir.y;
            if (tFloor > 0.14 && tFloor < hitDist) {
              hitDist = tFloor;
              hitValid = true;
            }
          }

          // 2) Real 3D MeshBVH / Raycaster intersection against explicit targets or scene physical meshes
          if (useExplicitTargets || _autoSceneMeshesScratch.length > 0) {
            _lidarRaycaster.ray.origin.copy(_sensorOrigin);
            _lidarRaycaster.ray.direction.copy(_rayDir);
            _lidarRaycaster.far = hitDist;
            _rayHitsScratch.length = 0;
            if (useExplicitTargets) {
              _lidarRaycaster.intersectObjects(explicitTargets!, true, _rayHitsScratch);
            } else {
              _lidarRaycaster.intersectObjects(_autoSceneMeshesScratch, false, _rayHitsScratch);
            }
            if (_rayHitsScratch.length > 0 && _rayHitsScratch[0].distance < hitDist) {
              hitDist = _rayHitsScratch[0].distance;
              hitValid = true;
            }
          }

          const endDist = hitValid ? hitDist : 3.2;
          const px = _sensorOrigin.x + _rayDir.x * endDist;
          const hitY = _sensorOrigin.y + _rayDir.y * endDist;
          const pz = _sensorOrigin.z + _rayDir.z * endDist;

          if (hitValid) {
            const slot = lidarWriteIdx % lidarCap;
            lidarWriteIdx++;
            lidarPos[slot * 3] = px;
            lidarPos[slot * 3 + 1] = hitY;
            lidarPos[slot * 3 + 2] = pz;
            lidarAge[slot] = 0;

            const elevSpan = hasValidBounds
              ? Math.max(0.45, params.robotBoundsBox!.max.y - floorY)
              : 1.25;
            const elevNorm = Math.max(0, Math.min(1, (hitY - floorY) / elevSpan));
            const [cr, cg, cb] = evaluateScientificColorMap(0.18 + elevNorm * 0.76, 'turbo');
            lidarBaseRgb[slot * 3] = cr;
            lidarBaseRgb[slot * 3 + 1] = cg;
            lidarBaseRgb[slot * 3 + 2] = cb;
          }

          if (b < beamCount) {
            const lb = b * 6;
            beamLinePos[lb] = _sensorOrigin.x;
            beamLinePos[lb + 1] = _sensorOrigin.y;
            beamLinePos[lb + 2] = _sensorOrigin.z;
            beamLinePos[lb + 3] = px;
            beamLinePos[lb + 4] = hitY;
            beamLinePos[lb + 5] = pz;
          }
        }
        beamLineGeo.attributes.position.needsUpdate = true;

        const stepDt = Math.min(0.08, Math.max(0.004, dt));
        for (let i = 0; i < lidarCap; i++) {
          if (lidarAge[i] < decay) {
            lidarAge[i] += stepDt;
            const fade = Math.max(0, 1 - lidarAge[i] / decay);
            lidarCol[i * 3] = lidarBaseRgb[i * 3] * fade;
            lidarCol[i * 3 + 1] = lidarBaseRgb[i * 3 + 1] * fade;
            lidarCol[i * 3 + 2] = lidarBaseRgb[i * 3 + 2] * fade;
          } else if (lidarPos[i * 3 + 1] > -500) {
            lidarPos[i * 3 + 1] = -999;
          }
        }
        lidarGeo.attributes.position.needsUpdate = true;
        lidarGeo.attributes.color.needsUpdate = true;
      } else {
        lidarGroup.visible = false;
      }
    },

    dispose() {
      comSphereGeo.dispose();
      comSphereMat.dispose();
      plumbGeo.dispose();
      plumbMat.dispose();
      polyLoopGeo.dispose();
      polyLoopMat.dispose();
      polyFillGeo.dispose();
      polyFillMat.dispose();
      zmpRingGeo.dispose();
      zmpRingMat.dispose();
      zmpTrailGeo.dispose();
      zmpTrailMat.dispose();
      sharedArcTorus.dispose();
      sharedTipCone.dispose();
      for (const t of torqueArcPool) t.mat.dispose();
      outerEnvWire.geometry.dispose();
      (outerEnvWire.material as THREE.Material).dispose();
      outerEnvShell.geometry.dispose();
      (outerEnvShell.material as THREE.Material).dispose();
      circularPointTex.dispose();
      latGeo.dispose();
      latMat.dispose();
      lidarGeo.dispose();
      lidarMat.dispose();
      beamLineGeo.dispose();
      beamLineMat.dispose();
    }
  };
}
