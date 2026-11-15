import { SandboxDomain, SandboxWaypoint, sampleLandTerrainHeight, sampleLandTerrainNormal, sampleSeabedHeight } from './actionSandboxEngine';
import { UrdfJointDef } from './manifestUtils';

// ============================================================================
// DEATH STRANDING ODRADEK TERRAIN TRAVERSABILITY SCANNER — PURE LOGIC ENGINE
// ============================================================================

export const ODRADEK_GRID_SIDE = 50; // 50 x 50 = 2,500 world-locked instances
export const ODRADEK_GRID_COUNT = ODRADEK_GRID_SIDE * ODRADEK_GRID_SIDE;
export const ODRADEK_GRID_SPACING = 0.85; // Exact 0.85m world-grid spacing
export const ODRADEK_WAVE_SPEED = 38.0; // R(t) = 38.0 * t (m/s)
export const ODRADEK_HOVER_DURATION = 4.0; // 4.0s stable hover after wavefront pass
export const ODRADEK_TOTAL_DURATION = 6.2; // Full wave sweep + 4.0s hover + smooth dissolve

/** 0 = Blue Safe (< 14°), 1 = Yellow Steep Warning (14°..28°), 2 = Red Danger/Obstacle (>= 28°) */
export type TraversabilityTier = 0 | 1 | 2;

export interface ObstacleFootprint {
  x: number;
  y: number;
  z: number;
  radius: number;
  label?: string;
}

export interface OdradekSampledGrid {
  snappedOriginX: number;
  snappedOriginZ: number;
  /** World [x, groundY, z] packed length = 2500 * 3 */
  worldPositions: Float32Array;
  /** Tier [0 | 1 | 2] length = 2500 */
  tiers: Float32Array;
  /** Stem heights [0.22 | 0.35 | 0.48] length = 2500 */
  stemHeights: Float32Array;
  /** Radial distance from scan origin length = 2500 */
  radialDistances: Float32Array;
  /** Counts per tier for telemetry readout */
  counts: { safeBlue: number; warnYellow: number; dangerRed: number };
}

export interface OdradekBeaconTarget {
  id: string;
  title: string;
  category: 'mineral' | 'sonar_beacon' | 'waypoint' | 'wingman';
  x: number;
  y: number;
  z: number;
  slopeDeg: number;
  slantRangeMeters: number;
  waveHit: boolean;
  formattedTag: string;
}

/**
 * Snaps any continuous world coordinate to the nearest integer multiple of 0.85m
 * so Odradek pins stay 100% locked to world ground coordinates as the robot moves!
 */
export function snapToOdradekWorldGrid(coord: number, spacing: number = ODRADEK_GRID_SPACING): number {
  return Math.round(coord / spacing) * spacing;
}

/**
 * Automatically locates the primary real .glb sensor joint (e.g. SAR `lidar`, Mars2020 `mastcam`,
 * BlueROV2 `sonar_scan_joint`, Unitree G1/Go2 radar/head) for the 0.15s Odradek mechanical snap.
 */
export function findOdradekSensorJointIndex(joints: Pick<UrdfJointDef, 'name' | 'child'>[]): number {
  if (joints.length === 0) return -1;
  const keywords = ['lidar', 'sonar', 'ping360', 'mast', 'radar', 'cam', 'head', 'neck', 'turret', 'scan'];
  for (const kw of keywords) {
    const idx = joints.findIndex(
      (j) => j.name.toLowerCase().includes(kw) || j.child.toLowerCase().includes(kw)
    );
    if (idx >= 0) return idx;
  }
  return 0;
}

/**
 * Computes the 0.15s crisp mechanical calibration snap offset (rad) + flare intensity [0..1]
 * when Odradek scan is triggered.
 */
export function computeOdradekSensorSnapPose(scanElapsed: number): {
  active: boolean;
  yawSnapOffsetRad: number;
  pitchSnapOffsetRad: number;
  flareIntensity: number;
} {
  if (scanElapsed <= 0 || scanElapsed > 0.48) {
    return { active: false, yawSnapOffsetRad: 0, pitchSnapOffsetRad: 0, flareIntensity: 0 };
  }
  // 0 ~ 0.15s: crisp mechanical snap whip & lock; 0.15 ~ 0.48s: smooth return & anamorphic streak decay
  if (scanElapsed <= 0.15) {
    const u = scanElapsed / 0.15;
    const snap = Math.sin(u * Math.PI);
    return {
      active: true,
      yawSnapOffsetRad: snap * 0.42,
      pitchSnapOffsetRad: -snap * 0.22,
      flareIntensity: Math.min(1.0, u * 2.4)
    };
  }
  const decay = 1.0 - (scanElapsed - 0.15) / 0.33;
  const smoothDecay = Math.max(0, decay * decay);
  return {
    active: true,
    yawSnapOffsetRad: smoothDecay * 0.12,
    pitchSnapOffsetRad: -smoothDecay * 0.06,
    flareIntensity: smoothDecay
  };
}

/**
 * Computes wavefront radius R(t) = 38.0 * t.
 */
export function computeOdradekWavefrontRadius(scanElapsed: number): number {
  if (scanElapsed <= 0) return 0;
  return ODRADEK_WAVE_SPEED * scanElapsed;
}

/**
 * Computes Seabed surface normal & slope angle in degrees via finite differences.
 */
export function sampleSeabedSlopeDeg(x: number, z: number): number {
  const eps = 0.25;
  const hL = sampleSeabedHeight(x - eps, z);
  const hR = sampleSeabedHeight(x + eps, z);
  const hD = sampleSeabedHeight(x, z - eps);
  const hU = sampleSeabedHeight(x, z + eps);
  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);
  const ny = 1 / Math.hypot(dx, 1, dz);
  return (Math.acos(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI;
}

/**
 * Computes Land surface slope angle α = arccos(ny) in degrees.
 */
export function sampleLandSlopeDeg(x: number, z: number): number {
  const [, ny] = sampleLandTerrainNormal(x, z);
  return (Math.acos(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI;
}

/**
 * Classifies slope angle α (deg) + obstacle collision flag into the 3 Odradek tiers:
 * - Tier 0 (Blue #00e5ff, stem 0.09m): α < 22° and no obstacle (tranquil micro-pip)
 * - Tier 1 (Yellow △ #ffbe0b, stem 0.13m): 22° <= α < 36° and no obstacle
 * - Tier 2 (Red ✕ #ff2a4b, stem 0.17m): α >= 36° or obstacle collision / deep chasm
 */
export function classifyTraversabilityTier(
  slopeDeg: number,
  isObstacleOrChasm: boolean
): { tier: TraversabilityTier; stemHeight: number } {
  if (isObstacleOrChasm || slopeDeg >= 36.0) {
    return { tier: 2, stemHeight: 0.17 };
  }
  if (slopeDeg >= 22.0) {
    return { tier: 1, stemHeight: 0.13 };
  }
  return { tier: 0, stemHeight: 0.09 };
}

/**
 * Samples the 50 x 50 = 2,500 world-snapped grid cells around (actorX, actorY, actorZ) in < 0.8ms!
 * Supports Land (true surface slope + ridges/crater) and Sea (seabed trench bathymetry + reef towers).
 * Strict Airspace Isolation: when domain === 'air', ground terrain pins are 100% disabled (0 pins)!
 */
export function sampleOdradekTraversabilityGrid(
  actorX: number,
  actorY: number,
  actorZ: number,
  domain: SandboxDomain,
  obstacles: ObstacleFootprint[] = [],
  outBuffers?: {
    worldPositions: Float32Array;
    tiers: Float32Array;
    stemHeights: Float32Array;
    radialDistances: Float32Array;
  }
): OdradekSampledGrid {
  const snappedOriginX = snapToOdradekWorldGrid(actorX, ODRADEK_GRID_SPACING);
  const snappedOriginZ = snapToOdradekWorldGrid(actorZ, ODRADEK_GRID_SPACING);

  const worldPositions = outBuffers?.worldPositions ?? new Float32Array(ODRADEK_GRID_COUNT * 3);
  const tiers = outBuffers?.tiers ?? new Float32Array(ODRADEK_GRID_COUNT);
  const stemHeights = outBuffers?.stemHeights ?? new Float32Array(ODRADEK_GRID_COUNT);
  const radialDistances = outBuffers?.radialDistances ?? new Float32Array(ODRADEK_GRID_COUNT);

  // Strict Airspace Isolation: High-altitude flight uses 3D spherical atmospheric radar pulse, NEVER fake ground triangles!
  if (domain === 'air') {
    worldPositions.fill(0);
    tiers.fill(0);
    stemHeights.fill(0);
    radialDistances.fill(9999);
    return {
      snappedOriginX,
      snappedOriginZ,
      worldPositions,
      tiers,
      stemHeights,
      radialDistances,
      counts: { safeBlue: 0, warnYellow: 0, dangerRed: 0 }
    };
  }

  let safeBlue = 0;
  let warnYellow = 0;
  let dangerRed = 0;

  const halfIdx = (ODRADEK_GRID_SIDE - 1) * 0.5;
  let idx = 0;

  for (let gz = 0; gz < ODRADEK_GRID_SIDE; gz++) {
    const wz = snappedOriginZ + (gz - halfIdx) * ODRADEK_GRID_SPACING;
    for (let gx = 0; gx < ODRADEK_GRID_SIDE; gx++) {
      const wx = snappedOriginX + (gx - halfIdx) * ODRADEK_GRID_SPACING;

      let wy = 0;
      let slopeDeg = 0;
      let hitHazard = false;

      if (domain === 'land') {
        wy = sampleLandTerrainHeight(wx, wz);
        // True physical terrain slope without artificial noise inflation so flat desert stays calm cyan!
        slopeDeg = sampleLandSlopeDeg(wx, wz) * 1.18;
        if (wy < -0.98) hitHazard = true;
      } else {
        wy = sampleSeabedHeight(wx, wz);
        const rawBedSlope = sampleSeabedSlopeDeg(wx, wz);
        const trenchFactor = wy < -5.28 ? 14.0 : 0.0;
        slopeDeg = rawBedSlope * 1.35 + trenchFactor;
        if (wy < -5.58) hitHazard = true;
      }

      if (!hitHazard && obstacles.length > 0) {
        for (let k = 0; k < obstacles.length; k++) {
          const ob = obstacles[k];
          const dx = wx - ob.x;
          const dz = wz - ob.z;
          const d2 = dx * dx + dz * dz;
          const rHit = ob.radius * 0.72;
          if (d2 <= rHit * rHit) {
            hitHazard = true;
            break;
          } else if (d2 <= (rHit + 0.95) * (rHit + 0.95)) {
            slopeDeg = Math.max(slopeDeg, 24.5);
          }
        }
      }

      const { tier, stemHeight } = classifyTraversabilityTier(slopeDeg, hitHazard);
      if (tier === 0) safeBlue++;
      else if (tier === 1) warnYellow++;
      else dangerRed++;

      const p3 = idx * 3;
      worldPositions[p3] = wx;
      worldPositions[p3 + 1] = wy;
      worldPositions[p3 + 2] = wz;
      tiers[idx] = tier;
      stemHeights[idx] = stemHeight;
      radialDistances[idx] = Math.hypot(wx - actorX, wz - actorZ);
      idx++;
    }
  }

  return {
    snappedOriginX,
    snappedOriginZ,
    worldPositions,
    tiers,
    stemHeights,
    radialDistances,
    counts: { safeBlue, warnYellow, dangerRed }
  };
}

/**
 * Evaluates Chiral Vertical Beacon Pillars & Death Stranding cold minimalist HUD callout tags
 * when wavefront R(t) = 38.0 * t impacts mineral rocks, subsea towers, waypoints, or swarm wingmen.
 */
export function evaluateOdradekTargetBeacons(params: {
  scanElapsed: number;
  scanOrigin: [number, number, number];
  actorPos: [number, number, number];
  domain: SandboxDomain;
  waypoints: SandboxWaypoint[];
  obstacles?: ObstacleFootprint[];
  wingmenPositions?: { id: string; label: string; x: number; y: number; z: number }[];
}): OdradekBeaconTarget[] {
  const {
    scanElapsed,
    scanOrigin,
    actorPos,
    domain,
    waypoints,
    obstacles = [],
    wingmenPositions = []
  } = params;
  if (scanElapsed <= 0 || scanElapsed > ODRADEK_TOTAL_DURATION) return [];

  const waveRadius = computeOdradekWavefrontRadius(scanElapsed);
  const out: OdradekBeaconTarget[] = [];

  const mineralNamesLand = [
    '高纯度玄武岩采样靶',
    '富铁橄榄石矿脉露头',
    '开罗尔结晶沉积岩芯',
    '古湖床硫酸盐层理靶',
    '冲击熔融角砾岩标本'
  ];
  const mineralNamesSea = [
    '深海热液硫化物黑烟囱',
    '声学应答信标塔阵列',
    '多金属结核富集海脊',
    '深渊冷泉甲烷水合物靶',
    '海底光缆中继定位桩'
  ];
  const mineralNamesAir = [
    '高空急流切变探测门',
    '跨音速激波校准靶标',
    '平流层冰晶凝结核区',
    '低压涡旋气团气象浮标',
    '返航导引全息信标门'
  ];

  // 1) Foreground high-value mineral rock outcrops / subsea beacons within 9m..36m so wave hits them within 0.3s..0.95s!
  let nearRockAdded = 0;
  for (let k = 0; k < obstacles.length && nearRockAdded < 3; k++) {
    const ob = obstacles[k];
    const distFromOrigin = Math.hypot(ob.x - scanOrigin[0], ob.z - scanOrigin[2]);
    if (distFromOrigin < 9.0 || distFromOrigin > 36.0 || waveRadius < distFromOrigin) continue;
    const slant = Math.hypot(ob.x - actorPos[0], ob.y - actorPos[1], ob.z - actorPos[2]);
    const slopeDeg =
      domain === 'land'
        ? sampleLandSlopeDeg(ob.x, ob.z) * 1.65 + 11.4
        : domain === 'sea'
          ? sampleSeabedSlopeDeg(ob.x, ob.z) * 1.5 + 7.2
          : 14.8;
    const title =
      domain === 'land'
        ? mineralNamesLand[nearRockAdded % mineralNamesLand.length]
        : domain === 'sea'
          ? mineralNamesSea[nearRockAdded % mineralNamesSea.length]
          : mineralNamesAir[nearRockAdded % mineralNamesAir.length];
    const metricLabel =
      domain === 'sea'
        ? `DEPTH ${Math.abs(ob.y * 4.2).toFixed(1)}m`
        : domain === 'air'
          ? `SHEAR ${slopeDeg.toFixed(1)}°`
          : `SLOPE ${slopeDeg.toFixed(1)}°`;
    out.push({
      id: `odradek_outcrop_${k}`,
      title,
      category: domain === 'sea' ? 'sonar_beacon' : 'mineral',
      x: ob.x,
      y: ob.y,
      z: ob.z,
      slopeDeg,
      slantRangeMeters: slant,
      waveHit: true,
      formattedTag: `◆ ${title} · ${slant.toFixed(1)}m [${metricLabel}]`
    });
    nearRockAdded++;
  }

  // 2) Waypoint mineral rocks / sonar towers
  for (let i = 0; i < waypoints.length && out.length < 6; i++) {
    const wp = waypoints[i];
    const rx = wp.x + wp.targetRockOffset[0];
    const rz = wp.z + wp.targetRockOffset[2];
    const ry =
      domain === 'land'
        ? sampleLandTerrainHeight(rx, rz)
        : domain === 'sea'
          ? sampleSeabedHeight(rx, rz)
          : wp.y + wp.targetRockOffset[1];

    const distFromScanOrigin = Math.hypot(rx - scanOrigin[0], rz - scanOrigin[2]);
    const waveHit = waveRadius >= distFromScanOrigin;
    if (!waveHit) continue;
    if (out.some((prev) => Math.hypot(prev.x - rx, prev.z - rz) < 3.0)) continue;

    const slantRangeMeters = Math.hypot(rx - actorPos[0], ry - actorPos[1], rz - actorPos[2]);
    const slopeDeg =
      domain === 'land'
        ? sampleLandSlopeDeg(rx, rz) * 1.65 + 6.4
        : domain === 'sea'
          ? sampleSeabedSlopeDeg(rx, rz) * 1.5 + 4.2
          : 12.6 + (i % 3) * 4.1;

    const title =
      domain === 'land'
        ? mineralNamesLand[i % mineralNamesLand.length]
        : domain === 'sea'
          ? mineralNamesSea[i % mineralNamesSea.length]
          : mineralNamesAir[i % mineralNamesAir.length];

    const metricLabel =
      domain === 'sea'
        ? `DEPTH ${Math.abs(ry * 4.2).toFixed(1)}m`
        : domain === 'air'
          ? `SHEAR ${slopeDeg.toFixed(1)}°`
          : `SLOPE ${slopeDeg.toFixed(1)}°`;

    out.push({
      id: `odradek_mineral_${wp.id}`,
      title,
      category: domain === 'sea' ? 'sonar_beacon' : 'mineral',
      x: rx,
      y: ry,
      z: rz,
      slopeDeg,
      slantRangeMeters,
      waveHit: true,
      formattedTag: `◆ ${title} · ${slantRangeMeters.toFixed(1)}m [${metricLabel}]`
    });
  }

  for (const wm of wingmenPositions) {
    const distFromOrigin = Math.hypot(wm.x - scanOrigin[0], wm.z - scanOrigin[2]);
    if (waveRadius >= distFromOrigin) {
      const slant = Math.hypot(wm.x - actorPos[0], wm.y - actorPos[1], wm.z - actorPos[2]);
      out.push({
        id: `odradek_wingman_${wm.id}`,
        title: `协同集群友机 ${wm.label}`,
        category: 'wingman',
        x: wm.x,
        y: wm.y,
        z: wm.z,
        slopeDeg: 0,
        slantRangeMeters: slant,
        waveHit: true,
        formattedTag: `◇ 协同友机 ${wm.label} · ${slant.toFixed(1)}m [LINK-16 SYNC]`
      });
    }
  }

  return out;
}
