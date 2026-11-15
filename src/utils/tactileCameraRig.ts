import * as THREE from 'three';

export type BulletTimeScale = 1 | 0.25 | 0.05;

export type CinemaMacroId =
  | 'off'
  | 'hero_orbit_push'
  | 'low_angle_titan'
  | 'top_down_disassembly';

export interface TactileDirectorConfig {
  /** Subtle ARRI handheld breathing micro-sway when idle */
  handheldMicroSway: boolean;
  /** Time-scale factor for slow-motion kinematic & particle inspection */
  bulletTimeScale: BulletTimeScale;
  /** Active 6.0s automated cinema camera macro */
  activeMacro: CinemaMacroId;
  /** Armed hangar kinetic impact test sphere launcher on part click */
  kineticImpactArmed: boolean;
  /** Lateral impulse magnitude in N·s [60 .. 420] */
  kineticImpulseNs: number;
  /** Show joint limit (>= 92%) warning rings & tactile IK spring tension arc */
  jointLimitGuardEnabled: boolean;
}

export function createDefaultTactileDirectorConfig(): TactileDirectorConfig {
  return {
    handheldMicroSway: false,
    bulletTimeScale: 1,
    activeMacro: 'off',
    kineticImpactArmed: false,
    kineticImpulseNs: 220,
    jointLimitGuardEnabled: true
  };
}

export interface Spring3DState {
  pos: [number, number, number];
  vel: [number, number, number];
}

/**
 * Critically damped 2nd-order spring integrator: x'' = -omega^2 (x - target) - 2*omega*x'
 */
export function stepCriticallyDampedSpring3D(
  state: Spring3DState,
  target: [number, number, number],
  omega: number,
  dtSec: number
): Spring3DState {
  const dt = Math.max(0, Math.min(0.05, dtSec));
  const expTerm = Math.exp(-omega * dt);
  const nextPos: [number, number, number] = [0, 0, 0];
  const nextVel: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    const x0 = state.pos[i] - target[i];
    const v0 = state.vel[i];
    const c2 = v0 + omega * x0;
    nextPos[i] = target[i] + (x0 + c2 * dt) * expTerm;
    nextVel[i] = (v0 - c2 * omega * dt) * expTerm;
  }
  return { pos: nextPos, vel: nextVel };
}

/**
 * Subtle organic handheld camera breathing sway (low-frequency multi-sine Lissajous).
 */
export function computeHandheldCameraMicroSway(
  simTime: number,
  enabled: boolean
): [number, number, number] {
  if (!enabled) return [0, 0, 0];
  const dx = Math.sin(simTime * 0.92) * 0.0085 + Math.sin(simTime * 2.15) * 0.0025;
  const dy = Math.cos(simTime * 1.18) * 0.0072 + Math.sin(simTime * 2.65) * 0.002;
  const dz = Math.sin(simTime * 0.76 + 1.1) * 0.0065;
  return [dx, dy, dz];
}

export interface CameraMicroImpulseState {
  elapsedSec: number;
  durationSec: number;
  strength: number;
  dirVec: [number, number, number];
}

export function createInitialCameraMicroImpulse(): CameraMicroImpulseState {
  return {
    elapsedSec: 99,
    durationSec: 0.13,
    strength: 0,
    dirVec: [0, -1, 0]
  };
}

export function triggerCameraMicroImpulse(
  strength01: number = 0.65,
  dirVec: [number, number, number] = [0, -1, 0],
  durationSec: number = 0.13
): CameraMicroImpulseState {
  const len = Math.hypot(dirVec[0], dirVec[1], dirVec[2]) || 1;
  return {
    elapsedSec: 0,
    durationSec: Math.max(0.08, Math.min(0.22, durationSec)),
    strength: Math.max(0, Math.min(1.5, strength01)),
    dirVec: [dirVec[0] / len, dirVec[1] / len, dirVec[2] / len]
  };
}

export function stepCameraMicroImpulse(
  prev: CameraMicroImpulseState,
  rawDtSec: number
): {
  next: CameraMicroImpulseState;
  offsetMeters: [number, number, number];
  vignette01: number;
} {
  if (prev.elapsedSec >= prev.durationSec || prev.strength <= 0.001) {
    return {
      next: prev,
      offsetMeters: [0, 0, 0],
      vignette01: 0
    };
  }
  const elapsed = prev.elapsedSec + Math.max(0, Math.min(0.05, rawDtSec));
  if (elapsed >= prev.durationSec) {
    return {
      next: { ...prev, elapsedSec: prev.durationSec, strength: 0 },
      offsetMeters: [0, 0, 0],
      vignette01: 0
    };
  }
  const u = elapsed / prev.durationSec;
  const env = Math.pow(1 - u, 2.2);
  const osc = Math.cos(u * Math.PI * 3.5);
  const amp = 0.042 * prev.strength * env * osc;
  return {
    next: { ...prev, elapsedSec: elapsed },
    offsetMeters: [
      prev.dirVec[0] * amp,
      prev.dirVec[1] * amp,
      prev.dirVec[2] * amp
    ],
    vignette01: Math.min(1, env * prev.strength * 0.85)
  };
}

export interface JointLimitProximityResult {
  ratio01: number;
  nearLimit: boolean;
  severity: 'normal' | 'amber' | 'critical';
  clampedElasticValue: number;
}

/**
 * Evaluates how close a URDF joint is to its [lower, upper] mechanical stops,
 * flagging >= 92% proximity and applying smooth elastic soft-stop resistance.
 */
export function detectJointLimitProximity(
  angleRad: number,
  lower: number,
  upper: number,
  jointType: string = 'revolute'
): JointLimitProximityResult {
  if (jointType === 'continuous' || !Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) {
    return {
      ratio01: 0,
      nearLimit: false,
      severity: 'normal',
      clampedElasticValue: angleRad
    };
  }
  const mid = (lower + upper) * 0.5;
  const halfSpan = Math.max(1e-4, (upper - lower) * 0.5);
  const normalizedDist = Math.abs(angleRad - mid) / halfSpan;
  const ratio01 = Math.max(0, Math.min(1, normalizedDist));
  const nearLimit = ratio01 >= 0.92;
  const severity: 'normal' | 'amber' | 'critical' =
    ratio01 >= 0.975 ? 'critical' : nearLimit ? 'amber' : 'normal';

  // Soft-stop elastic resistance past 92%
  let elasticVal = Math.max(lower, Math.min(upper, angleRad));
  if (ratio01 > 0.92) {
    const sign = angleRad >= mid ? 1 : -1;
    const excess = Math.min(1, (ratio01 - 0.92) / 0.08);
    const dampedExcess = 0.92 + 0.08 * (1 - Math.exp(-excess * 2.4)) / (1 - Math.exp(-2.4));
    elasticVal = mid + sign * halfSpan * dampedExcess;
  }

  return {
    ratio01,
    nearLimit,
    severity,
    clampedElasticValue: elasticVal
  };
}

export interface CinemaMacroPose {
  active: boolean;
  position: [number, number, number];
  lookAt: [number, number, number];
  fovDeg: number;
  suggestedExplosion?: number;
}

/**
 * Evaluates 6.0-second automated cinema camera macros:
 * - 'hero_orbit_push': 360-deg sweeping orbit pushing into an intimate hero 3/4 portrait
 * - 'low_angle_titan': Ultra-low floor-skimming monumental upward sweep
 * - 'top_down_disassembly': High overhead zenith dive synchronized with exploded-view reveal
 */
export function evaluateCinemaMacroPose(
  macroId: CinemaMacroId,
  elapsedSec: number,
  bboxMin: [number, number, number],
  bboxMax: [number, number, number],
  modelRadius: number = 1.25
): CinemaMacroPose {
  const duration = 6.0;
  if (macroId === 'off' || elapsedSec < 0 || elapsedSec >= duration) {
    return {
      active: false,
      position: [2.4, 1.5, 2.6],
      lookAt: [0, 0.5, 0],
      fovDeg: 40
    };
  }

  const u = Math.max(0, Math.min(1, elapsedSec / duration));
  const s = u * u * (3 - 2 * u); // smoothstep
  const cx = (bboxMin[0] + bboxMax[0]) * 0.5;
  const cy = (bboxMin[1] + bboxMax[1]) * 0.5;
  const cz = (bboxMin[2] + bboxMax[2]) * 0.5;
  const r = Math.max(0.85, modelRadius);

  if (macroId === 'hero_orbit_push') {
    const ang = -0.65 + s * Math.PI * 1.45;
    const dist = r * (2.65 - s * 1.05);
    const elev = bboxMin[1] + (bboxMax[1] - bboxMin[1]) * (0.52 + 0.24 * Math.sin(s * Math.PI));
    return {
      active: true,
      position: [cx + Math.cos(ang) * dist, elev, cz + Math.sin(ang) * dist],
      lookAt: [cx, cy + r * 0.08 * s, cz],
      fovDeg: 42 - s * 7
    };
  }

  if (macroId === 'low_angle_titan') {
    const ang = 0.45 + s * 1.35;
    const dist = r * (1.95 - s * 0.35);
    const camY = bboxMin[1] + 0.12 + s * (bboxMax[1] - bboxMin[1]) * 0.22;
    const lookY = bboxMin[1] + (bboxMax[1] - bboxMin[1]) * (0.58 + s * 0.16);
    return {
      active: true,
      position: [cx + Math.sin(ang) * dist, camY, cz + Math.cos(ang) * dist],
      lookAt: [cx, lookY, cz],
      fovDeg: 46 - s * 4
    };
  }

  // 'top_down_disassembly'
  const ang = s * Math.PI * 0.85;
  const zenithMix = Math.sin(s * Math.PI);
  const dist = r * (1.25 + (1 - zenithMix) * 1.25);
  const camY = bboxMax[1] + r * (1.35 + zenithMix * 1.15);
  return {
    active: true,
    position: [cx + Math.cos(ang) * dist, camY, cz + Math.sin(ang) * dist],
    lookAt: [cx, cy, cz],
    fovDeg: 40,
    suggestedExplosion: Number((zenithMix * 0.72).toFixed(3))
  };
}

export interface JointLimitWarningSample {
  worldPos: THREE.Vector3;
  severity: 'amber' | 'critical';
}

export interface TactileInteractionSceneController {
  group: THREE.Group;
  launchKineticProjectile: (
    startWorld: THREE.Vector3,
    targetWorld: THREE.Vector3,
    impulseNs: number,
    partName: string,
    onImpact: (hitWorld: THREE.Vector3, dirXZ: [number, number], impulseNs: number, partName: string) => void
  ) => void;
  update: (params: {
    dt: number;
    simTime: number;
    ikSpringActive: boolean;
    ikTargetWorld?: THREE.Vector3 | null;
    ikEndEffectorWorld?: THREE.Vector3 | null;
    jointLimitWarnings: JointLimitWarningSample[];
    hidden: boolean;
  }) => { ikTensionNewtons: number };
  dispose: () => void;
}

/**
 * Renders 3D Tactile Physics Feedback inside Hangar & Workstation views:
 * 1) 6-DOF IK Helical Tension Spring Arc between cursor target and end-effector
 * 2) Joint Limit (>= 92%) Amber/Crimson Warning Rings on saturated URDF joints
 * 3) Kinetic Stress-Test Projectile Sphere + Expanding Shock Ring on impact
 */
export function createTactileInteractionSceneController(): TactileInteractionSceneController {
  const group = new THREE.Group();
  group.name = 'tactile_interaction_feedback_group';

  // 1. 6-DOF IK Helical Spring Tension Line (48 segments)
  const springSegs = 48;
  const springPos = new Float32Array(springSegs * 3);
  const springGeo = new THREE.BufferGeometry();
  springGeo.setAttribute('position', new THREE.BufferAttribute(springPos, 3));
  const springMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const springLine = new THREE.Line(springGeo, springMat);
  springLine.visible = false;
  springLine.frustumCulled = false;
  group.add(springLine);

  // 2. Joint Limit Warning Rings Pool (up to 12 joints)
  const maxRings = 12;
  const sharedWarnTorus = new THREE.TorusGeometry(0.068, 0.0055, 8, 24);
  const warnRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < maxRings; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(sharedWarnTorus, mat);
    mesh.visible = false;
    group.add(mesh);
    warnRings.push({ mesh, mat });
  }

  // 3. Kinetic Stress-Test Projectile Sphere + Impact Shockwave Ring
  const ballGeo = new THREE.SphereGeometry(0.048, 18, 14);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.6,
    metalness: 0.85,
    roughness: 0.18
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.visible = false;
  group.add(ballMesh);

  const shockGeo = new THREE.RingGeometry(0.04, 0.075, 28);
  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const shockRing = new THREE.Mesh(shockGeo, shockMat);
  shockRing.visible = false;
  group.add(shockRing);

  let projActive = false;
  let projElapsed = 0;
  const projDuration = 0.14;
  const projStart = new THREE.Vector3();
  const projTarget = new THREE.Vector3();
  let projImpulseNs = 220;
  let projPartName = '';
  let projCallback:
    | ((hitWorld: THREE.Vector3, dirXZ: [number, number], impulseNs: number, partName: string) => void)
    | null = null;

  let shockAge = 99;
  const _uAxis = new THREE.Vector3();
  const _vAxis = new THREE.Vector3();
  const _upRef = new THREE.Vector3(0, 1, 0);

  return {
    group,
    launchKineticProjectile(startWorld, targetWorld, impulseNs, partName, onImpact) {
      projActive = true;
      projElapsed = 0;
      projStart.copy(startWorld);
      projTarget.copy(targetWorld);
      projImpulseNs = impulseNs;
      projPartName = partName;
      projCallback = onImpact;
      ballMesh.visible = true;
      ballMesh.position.copy(startWorld);
    },

    update(params) {
      if (params.hidden) {
        group.visible = false;
        return { ikTensionNewtons: 0 };
      }
      group.visible = true;
      const dt = Math.max(0.004, Math.min(0.06, params.dt));

      // 1. Update 6-DOF IK Tension Spring Arc
      let ikTensionNewtons = 0;
      if (params.ikSpringActive && params.ikTargetWorld && params.ikEndEffectorWorld) {
        const a = params.ikEndEffectorWorld;
        const b = params.ikTargetWorld;
        const dist = a.distanceTo(b);
        ikTensionNewtons = Math.round(Math.min(480, dist * 340));
        if (dist > 0.008) {
          springLine.visible = true;
          _uAxis.subVectors(b, a).normalize();
          _vAxis.crossVectors(_uAxis, _upRef);
          if (_vAxis.lengthSq() < 1e-4) _vAxis.set(1, 0, 0);
          _vAxis.normalize();
          const coilRadius = Math.min(0.036, 0.012 + dist * 0.04);

          for (let i = 0; i < springSegs; i++) {
            const t = i / (springSegs - 1);
            const env = Math.sin(t * Math.PI);
            const coilAng = t * Math.PI * 14.0 + params.simTime * 8.0;
            const px = a.x + (b.x - a.x) * t + _vAxis.x * Math.cos(coilAng) * coilRadius * env;
            const py =
              a.y + (b.y - a.y) * t + Math.sin(coilAng) * coilRadius * env;
            const pz = a.z + (b.z - a.z) * t + _vAxis.z * Math.cos(coilAng) * coilRadius * env;
            springPos[i * 3] = px;
            springPos[i * 3 + 1] = py;
            springPos[i * 3 + 2] = pz;
          }
          springGeo.attributes.position.needsUpdate = true;
          springMat.color.setHex(dist > 0.45 ? 0xf59e0b : 0x00e5ff);
        } else {
          springLine.visible = false;
        }
      } else {
        springLine.visible = false;
      }

      // 2. Update Joint Limit Warning Rings
      const warnCount = Math.min(maxRings, params.jointLimitWarnings.length);
      const pulse = 0.65 + 0.35 * Math.sin(params.simTime * 12.0);
      for (let i = 0; i < maxRings; i++) {
        const w = warnRings[i];
        if (i >= warnCount) {
          w.mesh.visible = false;
          continue;
        }
        const smp = params.jointLimitWarnings[i];
        w.mesh.visible = true;
        w.mesh.position.copy(smp.worldPos);
        w.mesh.rotation.set(params.simTime * 2.4 + i, params.simTime * 1.8, 0);
        w.mat.color.setHex(smp.severity === 'critical' ? 0xef4444 : 0xf59e0b);
        w.mat.opacity = 0.55 + 0.42 * pulse;
      }

      // 3. Advance Kinetic Stress-Test Projectile
      if (projActive) {
        projElapsed += dt;
        const u = Math.min(1, projElapsed / projDuration);
        ballMesh.position.lerpVectors(projStart, projTarget, u);
        if (u >= 1) {
          projActive = false;
          ballMesh.visible = false;
          shockAge = 0;
          shockRing.visible = true;
          shockRing.position.copy(projTarget);
          shockRing.lookAt(projStart);

          const dx = projTarget.x - projStart.x;
          const dz = projTarget.z - projStart.z;
          const len = Math.hypot(dx, dz) || 1;
          const cb = projCallback;
          projCallback = null;
          cb?.(projTarget.clone(), [dx / len, dz / len], projImpulseNs, projPartName);
        }
      }

      if (shockAge < 0.38) {
        shockAge += dt;
        const k = shockAge / 0.38;
        shockRing.scale.setScalar(1 + k * 5.2);
        shockMat.opacity = (1 - k) * 0.9;
        if (shockAge >= 0.38) {
          shockRing.visible = false;
        }
      }

      return { ikTensionNewtons };
    },

    dispose() {
      springGeo.dispose();
      springMat.dispose();
      sharedWarnTorus.dispose();
      for (const w of warnRings) w.mat.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      shockGeo.dispose();
      shockMat.dispose();
    }
  };
}

export interface CanvasWebmRecorderController {
  isRecording: () => boolean;
  startRecording: (filenamePrefix?: string) => boolean;
  stopRecording: () => void;
}

/**
 * Zero-dependency browser WebM HD video clip recorder for any Three.js WebGL canvas.
 */
export function createCanvasWebmRecorder(
  getCanvas: () => HTMLCanvasElement | null
): CanvasWebmRecorderController {
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let activePrefix = 'digital_twin_capture';

  return {
    isRecording() {
      return mediaRecorder !== null && mediaRecorder.state === 'recording';
    },
    startRecording(filenamePrefix = 'digital_twin_capture') {
      const canvas = getCanvas();
      if (!canvas || typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
        return false;
      }
      if (mediaRecorder && mediaRecorder.state === 'recording') return true;

      activePrefix = filenamePrefix;
      chunks = [];
      const stream = canvas.captureStream(30);
      const mimeCandidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      const mimeType =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
          : new MediaRecorder(stream);
      } catch {
        return false;
      }

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      mediaRecorder.onstop = () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activePrefix}_${Date.now()}.webm`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 3000);
        chunks = [];
      };
      mediaRecorder.start(200);
      return true;
    },
    stopRecording() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }
  };
}
