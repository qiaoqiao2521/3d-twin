import * as THREE from 'three';
import { MARS_BATTLEFIELD_OBSTACLES, sampleMarsArenaSurfaceHeight, type MarsCombatWorldState } from './marsCombatEngine';

export const COMBAT_RETICLE_NDC_Y = 0.06;
const ndc = new THREE.Vector2(0, COMBAT_RETICLE_NDC_Y);
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const axisX = new THREE.Vector3(1, 0, 0);
const localTarget = new THREE.Vector3();
const localUp = new THREE.Vector3();
const localSide = new THREE.Vector3();
const localTip = new THREE.Vector3();
const basis = new THREE.Matrix4();
const parentInverse = new THREE.Matrix4();
const correction = new THREE.Quaternion();

export function updateCombatShoulderCamera(
  camera: THREE.PerspectiveCamera,
  wState: MarsCombatWorldState,
  yaw: number,
  pitch: number,
  dt: number,
  simElapsed: number,
  previousYaw: number | null
) {
  // Over-the-Shoulder 3rd-Person Spring-Arm Camera with Terrain/Obstacle Anti-Clipping
  const camBackDist = wState.dashTimer > 0 ? 7.6 : wState.heavyPostureTimer > 0 ? 6.15 : 6.6;
  const fwdX = Math.cos(yaw);
  const fwdZ = Math.sin(yaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  const anchorX = wState.x + rightX * 0.55;
  const anchorY = wState.y + 1.65;
  const anchorZ = wState.z + rightZ * 0.55;

  const rawCamX = wState.x - fwdX * camBackDist + rightX * 1.15;
  const rawCamY = wState.y + 2.85 - Math.sin(pitch) * 3.2;
  const rawCamZ = wState.z - fwdZ * camBackDist + rightZ * 1.15;

  // 6-step Spring-Arm sweep from shoulder anchor to rawCam against MARS_BATTLEFIELD_OBSTACLES
  let armFraction = 1.0;
  for (let s = 1; s <= 6; s++) {
    const t = s / 6;
    const sx = anchorX + (rawCamX - anchorX) * t;
    const sy = anchorY + (rawCamY - anchorY) * t;
    const sz = anchorZ + (rawCamZ - anchorZ) * t;
    let blocked = false;
    for (const obs of MARS_BATTLEFIELD_OBSTACLES) {
      const dx = sx - obs.x;
      const dz = sz - obs.z;
      if (dx * dx + dz * dz < (obs.radius + 0.48) * (obs.radius + 0.48)) {
        const obsTop = sampleMarsArenaSurfaceHeight(obs.x, obs.z) + obs.height + 0.35;
        if (sy < obsTop) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) {
      armFraction = Math.max(0.24, (s - 1) / 6);
      break;
    }
  }

  const resolvedCamX = anchorX + (rawCamX - anchorX) * armFraction;
  const resolvedCamZ = anchorZ + (rawCamZ - anchorZ) * armFraction;
  const terrainFloorAtCam = sampleMarsArenaSurfaceHeight(resolvedCamX, resolvedCamZ) + 0.65;
  const resolvedCamY = Math.max(
    anchorY + (rawCamY - anchorY) * armFraction,
    terrainFloorAtCam
  );

  desired.set(resolvedCamX, resolvedCamY, resolvedCamZ);
  const dampK = 1 - Math.exp(-14 * dt);
  if (previousYaw === null) {
    camera.position.copy(desired);
  } else {
    // Follow look input immediately; damp distance and translation along the spring arm.
    const delta = yaw - previousYaw;
    const ox = camera.position.x - wState.x;
    const oz = camera.position.z - wState.z;
    camera.position.x = wState.x + ox * Math.cos(delta) - oz * Math.sin(delta);
    camera.position.z = wState.z + ox * Math.sin(delta) + oz * Math.cos(delta);
    camera.position.lerp(desired, dampK);
  }
  const liveFloorY = sampleMarsArenaSurfaceHeight(camera.position.x, camera.position.z) + 0.55;
  if (camera.position.y < liveFloorY) {
    camera.position.y = liveFloorY;
  }

  // Smooth Multi-Sine Camera-Local Trauma Shake (projected strictly along camera Right & Up — zero Math.random jitter!)
  const shake = wState.cameraTrauma * wState.cameraTrauma * 0.34;
  const shakeRight =
    (Math.sin(simElapsed * 37.0) * 0.6 + Math.sin(simElapsed * 61.0 + 1.3) * 0.4) * shake;
  const shakeUp =
    (Math.cos(simElapsed * 43.0 + 0.7) * 0.6 + Math.sin(simElapsed * 73.0) * 0.4) * shake;

  lookTarget.set(
    wState.x + fwdX * 14 + rightX * (0.65 + shakeRight),
    wState.y + 1.45 + Math.sin(pitch) * 12 + shakeUp,
    wState.z + fwdZ * 14 + rightZ * (0.65 + shakeRight)
  );
  camera.lookAt(lookTarget);

  const targetFov =
    wState.dashTimer > 0 ? 60 : wState.heavyPostureTimer > 0 ? 56.8 : 52;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-14 * dt));
    camera.updateProjectionMatrix();
  }
}

export function sampleCombatReticle(
  camera: THREE.PerspectiveCamera,
  weaponOrigin: THREE.Vector3,
  barrelReach: number,
  pickMeshes: THREE.Object3D[],
  target: THREE.Vector3
): number | null {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  raycaster.near = Math.max(camera.near, localTarget.subVectors(weaponOrigin, ray.origin).dot(ray.direction) + barrelReach + 0.03);
  raycaster.far = camera.far;
  const hit = raycaster.intersectObjects(pickMeshes, true)[0];
  if (!hit) {
    ray.at(Math.max(56, raycaster.near + 1), target);
    return null;
  }
  target.copy(hit.point);
  for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
    if (typeof node.userData.combatEnemyUid === 'number') return node.userData.combatEnemyUid;
  }
  return null;
}

/** Aim the mounted display mesh's +X centreline through the reticle, preserving its grip position. */
export function alignCombatWeapon(weapon: THREE.Object3D, socket: THREE.Object3D, target: THREE.Vector3) {
  const parent = weapon.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parentInverse.copy(parent.matrixWorld).invert();
  localTarget.copy(target).applyMatrix4(parentInverse).sub(weapon.position);
  const distance = localTarget.length();
  if (distance < 1e-6) return;
  localTarget.divideScalar(distance);
  localUp.set(0, 1, 0).transformDirection(parentInverse);
  localSide.crossVectors(localTarget, localUp);
  if (localSide.lengthSq() < 1e-8) {
    localUp.set(0, 0, 1).transformDirection(parentInverse);
    localSide.crossVectors(localTarget, localUp);
  }
  localSide.normalize();
  localUp.crossVectors(localSide, localTarget).normalize();
  basis.makeBasis(localTarget, localUp, localSide);

  // A barrel or nocked arrow can sit above and to one side of the hand.
  weapon.worldToLocal(socket.getWorldPosition(localTip)).multiply(weapon.scale);
  localTip.x = Math.sqrt(Math.max(0, distance * distance - localTip.y * localTip.y - localTip.z * localTip.z));
  correction.setFromUnitVectors(localTip.normalize(), axisX);
  weapon.quaternion.setFromRotationMatrix(basis).multiply(correction);
}

/** The shipped bow points along +X; its arrowhead mesh supplies the emission point. */
export function attachBowArrowSocket(bow: THREE.Group): THREE.Object3D | null {
  const arrowhead = bow.getObjectByName('bow_plasma_arrowhead') as THREE.Mesh | undefined;
  if (!arrowhead?.geometry) return null;
  const geometry = arrowhead.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return null;
  const socket = new THREE.Object3D();
  socket.name = 'bow_arrow_socket';
  bounds.getCenter(socket.position);
  socket.position.x = bounds.max.x;
  arrowhead.add(socket);
  return socket;
}
