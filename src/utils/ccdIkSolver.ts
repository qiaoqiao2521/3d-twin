import { UrdfJointDef } from './manifestUtils';

export type HangarCameraPresetId = 'top-down' | 'front-side' | 'isometric';

export interface HangarCameraPresetSpec {
  id: HangarCameraPresetId;
  label: string;
  shortEn: string;
  /** Camera position in world coordinates relative to target center */
  offset: [number, number, number];
  /** Camera up vector to avoid gimbal lock on pure top-down views */
  up: [number, number, number];
}

export const HANGAR_CAMERA_PRESETS: HangarCameraPresetSpec[] = [
  {
    id: 'top-down',
    label: '俯视正交',
    shortEn: 'Top-Down',
    offset: [0.0, 4.45, 0.001],
    up: [0, 0, -1]
  },
  {
    id: 'front-side',
    label: '正侧前视',
    shortEn: 'Front-Side',
    offset: [3.25, 0.42, 1.05],
    up: [0, 1, 0]
  },
  {
    id: 'isometric',
    label: '等轴测图',
    shortEn: 'Isometric',
    offset: [2.42, 2.15, 2.42],
    up: [0, 1, 0]
  }
];

export function getHangarCameraPreset(id: HangarCameraPresetId): HangarCameraPresetSpec {
  return HANGAR_CAMERA_PRESETS.find((p) => p.id === id) || HANGAR_CAMERA_PRESETS[2];
}

// ============================================================================
// PURE 3D MATH FOR 60FPS CYCLIC COORDINATE DESCENT (CCD) INVERSE KINEMATICS
// ============================================================================

export interface IkJointLinkSpec {
  name: string;
  /** Joint rotation axis in joint-local space (normalized) */
  axis: [number, number, number];
  /** Translation from previous joint frame to this joint origin */
  localOffset: [number, number, number];
  /** Fixed RPY rotation quaternion [x, y, z, w] from URDF joint origin */
  originQuat: [number, number, number, number];
  lower: number;
  upper: number;
}

export interface MoltenKerfNode {
  x: number;
  y: number;
  z: number;
  /** Temperature 1.0 (white-hot 3200K) -> 0.0 (cooled slag) */
  heat: number;
}

function quatMultiply(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number
): [number, number, number, number] {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number
): [number, number, number, number] {
  const half = angle * 0.5;
  const s = Math.sin(half);
  const len = Math.hypot(ax, ay, az) || 1;
  return [(ax / len) * s, (ay / len) * s, (az / len) * s, Math.cos(half)];
}

function rotateVecByQuat(
  vx: number,
  vy: number,
  vz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): [number, number, number] {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

/**
 * Evaluates Forward Kinematics for an arbitrary N-DOF serial revolute chain in chain-root coordinates.
 * Returns per-joint world positions, world axes, and the end-effector tip position.
 */
export function evaluateSerialChainFk(
  chain: IkJointLinkSpec[],
  angles: number[],
  tipLocalOffset: [number, number, number]
): {
  jointPositions: [number, number, number][];
  jointWorldAxes: [number, number, number][];
  endEffectorPos: [number, number, number];
} {
  const jointPositions: [number, number, number][] = [];
  const jointWorldAxes: [number, number, number][] = [];

  let px = 0;
  let py = 0;
  let pz = 0;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let qw = 1;

  for (let i = 0; i < chain.length; i++) {
    const j = chain[i];
    const [dx, dy, dz] = rotateVecByQuat(
      j.localOffset[0],
      j.localOffset[1],
      j.localOffset[2],
      qx,
      qy,
      qz,
      qw
    );
    px += dx;
    py += dy;
    pz += dz;

    // Apply fixed URDF joint origin rotation
    [qx, qy, qz, qw] = quatMultiply(
      qx,
      qy,
      qz,
      qw,
      j.originQuat[0],
      j.originQuat[1],
      j.originQuat[2],
      j.originQuat[3]
    );

    jointPositions.push([px, py, pz]);
    const worldAxis = rotateVecByQuat(j.axis[0], j.axis[1], j.axis[2], qx, qy, qz, qw);
    jointWorldAxes.push(worldAxis);

    // Apply variable joint rotation angle
    const [jqx, jqy, jqz, jqw] = quatFromAxisAngle(
      j.axis[0],
      j.axis[1],
      j.axis[2],
      angles[i] || 0
    );
    [qx, qy, qz, qw] = quatMultiply(qx, qy, qz, qw, jqx, jqy, jqz, jqw);
  }

  const [tx, ty, tz] = rotateVecByQuat(
    tipLocalOffset[0],
    tipLocalOffset[1],
    tipLocalOffset[2],
    qx,
    qy,
    qz,
    qw
  );

  return {
    jointPositions,
    jointWorldAxes,
    endEffectorPos: [px + tx, py + ty, pz + tz]
  };
}

/**
 * Pure 60fps Cyclic Coordinate Descent (CCD) Inverse Kinematics Solver.
 * Solves joint angles respecting exact URDF joint axes and [lower, upper] radian limits.
 */
export function solveCcdIkChain(
  chain: IkJointLinkSpec[],
  currentAngles: number[],
  targetInRoot: [number, number, number],
  tipLocalOffset: [number, number, number],
  maxIterations: number = 10,
  dampingStepLimitRad: number = 0.35
): { angles: number[]; endEffectorPos: [number, number, number]; residualDist: number } {
  const n = chain.length;
  const angles = currentAngles.slice(0, n);
  while (angles.length < n) angles.push(0);

  if (n === 0) {
    return {
      angles,
      endEffectorPos: [0, 0, 0],
      residualDist: Math.hypot(targetInRoot[0], targetInRoot[1], targetInRoot[2])
    };
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Sweep from wrist/distal joint down to shoulder/base turret
    for (let i = n - 1; i >= 0; i--) {
      const fk = evaluateSerialChainFk(chain, angles, tipLocalOffset);
      const [ex, ey, ez] = fk.endEffectorPos;
      const distErr = Math.hypot(
        targetInRoot[0] - ex,
        targetInRoot[1] - ey,
        targetInRoot[2] - ez
      );
      if (distErr < 0.004) {
        return { angles, endEffectorPos: fk.endEffectorPos, residualDist: distErr };
      }

      const [jx, jy, jz] = fk.jointPositions[i];
      const [ax, ay, az] = fk.jointWorldAxes[i];

      // Vector from joint i to current end-effector, projected onto plane perpendicular to joint axis
      const curVx = ex - jx;
      const curVy = ey - jy;
      const curVz = ez - jz;
      const curDot = curVx * ax + curVy * ay + curVz * az;
      const pCurX = curVx - ax * curDot;
      const pCurY = curVy - ay * curDot;
      const pCurZ = curVz - az * curDot;

      // Vector from joint i to desired target, projected onto plane perpendicular to joint axis
      const tgtVx = targetInRoot[0] - jx;
      const tgtVy = targetInRoot[1] - jy;
      const tgtVz = targetInRoot[2] - jz;
      const tgtDot = tgtVx * ax + tgtVy * ay + tgtVz * az;
      const pTgtX = tgtVx - ax * tgtDot;
      const pTgtY = tgtVy - ay * tgtDot;
      const pTgtZ = tgtVz - az * tgtDot;

      const curLen = Math.hypot(pCurX, pCurY, pCurZ);
      const tgtLen = Math.hypot(pTgtX, pTgtY, pTgtZ);
      if (curLen < 1e-4 || tgtLen < 1e-4) continue;

      const uCurX = pCurX / curLen;
      const uCurY = pCurY / curLen;
      const uCurZ = pCurZ / curLen;
      const uTgtX = pTgtX / tgtLen;
      const uTgtY = pTgtY / tgtLen;
      const uTgtZ = pTgtZ / tgtLen;

      // Cross product uCur x uTgt dotted with joint world axis gives signed sin(deltaTheta)
      const cx = uCurY * uTgtZ - uCurZ * uTgtY;
      const cy = uCurZ * uTgtX - uCurX * uTgtZ;
      const cz = uCurX * uTgtY - uCurY * uTgtX;
      const sinTheta = cx * ax + cy * ay + cz * az;
      const cosTheta = Math.max(-1, Math.min(1, uCurX * uTgtX + uCurY * uTgtY + uCurZ * uTgtZ));
      let delta = Math.atan2(sinTheta, cosTheta);

      // Damped per-iteration step so high-DOF chains never snap violently
      delta = Math.max(-dampingStepLimitRad, Math.min(dampingStepLimitRad, delta * 0.85));

      const lo = Number.isFinite(chain[i].lower) ? chain[i].lower : -Math.PI;
      const hi = Number.isFinite(chain[i].upper) ? chain[i].upper : Math.PI;
      const nextAngle = angles[i] + delta;
      angles[i] = lo < hi ? Math.max(lo, Math.min(hi, nextAngle)) : nextAngle;
    }
  }

  const finalFk = evaluateSerialChainFk(chain, angles, tipLocalOffset);
  const residualDist = Math.hypot(
    targetInRoot[0] - finalFk.endEffectorPos[0],
    targetInRoot[1] - finalFk.endEffectorPos[1],
    targetInRoot[2] - finalFk.endEffectorPos[2]
  );
  return { angles, endEffectorPos: finalFk.endEffectorPos, residualDist };
}

/**
 * Selects the ordered URDF joint indices belonging to the robot's primary serial manipulator arm:
 * - SAR: AR4 6-DOF rescue manipulator (joint_1..joint_6)
 * - Unitree Z1: 6-DOF collaborative manipulator (joint1..joint6)
 * - RexROV2: Oberon7 7-DOF subsea hydraulic manipulator (azimuth..wrist)
 * - Unitree G1: Right 5/7-DOF bionic arm (right_shoulder_pitch..right_wrist)
 * - Fallback: Front-right limb / active turret joints so IK works on any articulated URDF!
 */
export function extractManipulatorJointIndices(
  actorId: string,
  joints: UrdfJointDef[]
): number[] {
  const id = actorId.toLowerCase();
  const candidates: number[] = [];

  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (j.type === 'fixed' || j.type === 'continuous') continue;
    const n = j.name.toLowerCase();
    const c = j.child.toLowerCase();

    if (id === 'sar') {
      if (
        (n.includes('joint_') && !n.includes('f_') && !n.includes('gripper') && !n.includes('jaw')) ||
        c.includes('link_')
      ) {
        candidates.push(i);
      }
    } else if (id === 'unitree_z1') {
      if (!n.includes('gripper') && !n.includes('stator') && !n.includes('mover')) {
        candidates.push(i);
      }
    } else if (id === 'rexrov2') {
      if (
        !n.includes('thruster') &&
        !n.includes('sonar') &&
        !n.includes('finger') &&
        !n.includes('jaw')
      ) {
        candidates.push(i);
      }
    } else if (id === 'unitree_g1') {
      if (
        n.includes('right') &&
        (n.includes('shoulder') || n.includes('elbow') || n.includes('wrist'))
      ) {
        candidates.push(i);
      }
    } else if (id === 'unitree_go2') {
      // Allow front-right paw tactile reach inspection when IK is toggled on Go2!
      if (n.startsWith('fr_')) {
        candidates.push(i);
      }
    }
  }

  if (candidates.length > 0) {
    return candidates.slice(0, 7);
  }

  // Fallback to first up-to-6 revolute joints
  for (let i = 0; i < joints.length && candidates.length < 6; i++) {
    if (joints[i].type === 'revolute') candidates.push(i);
  }
  return candidates;
}

/**
 * Maps normalized molten kerf heat (1.0 = freshly plasma-arc melted -> 0.0 = cooled slag)
 * to realistic blackbody incandescent RGB [0..1].
 */
export function computeMoltenKerfColor(heat: number): [number, number, number] {
  const h = Math.max(0, Math.min(1, heat));
  if (h > 0.78) {
    // Blazing white-yellow plasma core (3000K -> 2200K)
    const u = (h - 0.78) / 0.22;
    return [1.0, 0.88 + 0.12 * u, 0.45 + 0.52 * u];
  }
  if (h > 0.42) {
    // Molten orange-gold -> cherry red (2200K -> 1300K)
    const u = (h - 0.42) / 0.36;
    return [0.92 + 0.08 * u, 0.18 + 0.70 * u, 0.04 + 0.41 * u];
  }
  if (h > 0.12) {
    // Cherry red -> cooling dark ember
    const u = (h - 0.12) / 0.30;
    return [0.28 + 0.64 * u, 0.03 + 0.15 * u, 0.02];
  }
  const u = h / 0.12;
  return [0.08 + 0.20 * u, 0.02 + 0.01 * u, 0.02];
}

/**
 * Advances cooling of molten plasma-cut kerf nodes and appends a new node when cutting torch moves.
 */
export function stepMoltenKerfTrail(
  nodes: MoltenKerfNode[],
  dt: number,
  cuttingPoint: [number, number, number] | null,
  maxNodes: number = 96
): MoltenKerfNode[] {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  const updated: MoltenKerfNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const cooled = nodes[i].heat - safeDt * 0.14;
    if (cooled > 0.015) {
      updated.push({ ...nodes[i], heat: cooled });
    }
  }

  if (cuttingPoint) {
    const last = updated[updated.length - 1];
    const dist = last
      ? Math.hypot(
          cuttingPoint[0] - last.x,
          cuttingPoint[1] - last.y,
          cuttingPoint[2] - last.z
        )
      : 999;

    if (dist >= 0.035) {
      updated.push({
        x: cuttingPoint[0],
        y: cuttingPoint[1],
        z: cuttingPoint[2],
        heat: 1.0
      });
    } else if (last) {
      last.heat = 1.0;
    }
  }

  if (updated.length > maxNodes) {
    return updated.slice(updated.length - maxNodes);
  }
  return updated;
}
