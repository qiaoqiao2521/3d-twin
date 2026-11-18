import * as THREE from 'three';

interface DriveWheel {
  node: THREE.Object3D;
  base: THREE.Quaternion;
  axle: THREE.Vector3;
  up: THREE.Vector3;
  x: number;
  z: number;
  radius: number;
  steerable: boolean;
  steer: number;
  spin: number;
}

export interface DriveWheelRig {
  wheels: DriveWheel[];
  lastDistance?: number;
  lastYaw?: number;
}

const rotation = new THREE.Quaternion();

export function bindDriveWheels(frame: THREE.Object3D, model: THREE.Object3D, actorId: string): DriveWheelRig {
  frame.updateWorldMatrix(true, true);
  const toFrame = frame.matrixWorld.clone().invert();
  const wheels: DriveWheel[] = [];
  model.traverse((node) => {
    const name = node.name.toLowerCase();
    const isWheel = /^(?:carrier_)?(?:front|rear)_(?:left|right)_wheel$|^link_(?:left|right)_wheel$|^drive_wheel_(?:front|middle|rear)_(?:left|right)$/.test(name)
      || (actorId === 'hello_stretch' && name === 'caster_link')
      || (actorId === 'sar' && /^(front|back)_(left|right)$/.test(name));
    if (!isWheel) return;
    const bounds = new THREE.Box3();
    node.traverse((part) => {
      if (!(part as THREE.Mesh).isMesh) return;
      const geometry = (part as THREE.Mesh).geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const inFrame = new THREE.Matrix4().multiplyMatrices(toFrame, part.matrixWorld);
        bounds.union(geometry.boundingBox.clone().applyMatrix4(inFrame));
      }
    });
    if (bounds.isEmpty()) return;
    const localToFrame = new THREE.Matrix4().multiplyMatrices(toFrame, node.matrixWorld);
    const intoNode = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(localToFrame)).invert();
    const center = bounds.getCenter(new THREE.Vector3());
    wheels.push({
      node, base: node.quaternion.clone(),
      axle: new THREE.Vector3(0, 0, 1).applyQuaternion(intoNode),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(intoNode),
      x: center.x, z: center.z, radius: Math.max(0.001, (bounds.max.y - bounds.min.y) * 0.5),
      steerable: (actorId === 'mars2020' && !name.includes('middle')) || name === 'caster_link', steer: 0, spin: 0
    });
  });
  // Steerable wheels pivot relative to the axle supporting the differential turn.
  if (wheels.some((wheel) => wheel.steerable)) {
    const middle = wheels.filter((wheel) => !wheel.steerable);
    if (middle.length) {
      const axleX = middle.reduce((sum, wheel) => sum + wheel.x, 0) / middle.length;
      for (const wheel of wheels) wheel.x -= axleX;
    }
  }
  return { wheels };
}

export function updateDriveWheels(rig: DriveWheelRig, distance: number, yaw: number, locked?: (node: THREE.Object3D) => boolean) {
  const travel = distance - (rig.lastDistance ?? distance);
  const rawTurn = yaw - (rig.lastYaw ?? yaw);
  const turn = Math.atan2(Math.sin(rawTurn), Math.cos(rawTurn));
  rig.lastDistance = distance;
  rig.lastYaw = yaw;
  for (const wheel of rig.wheels) {
    const forward = travel - turn * wheel.z;
    const lateral = wheel.steerable ? turn * wheel.x : 0;
    if (Math.abs(forward) + Math.abs(lateral) > 1e-7 && !locked?.(wheel.node)) {
      // Keep steering within a half-turn. Reversing changes wheel spin instead of flipping the fork.
      const sign = forward < 0 ? -1 : 1;
      wheel.steer = wheel.steerable ? Math.atan2(lateral * sign, Math.abs(forward)) : 0;
      wheel.spin -= sign * Math.hypot(forward, lateral) / wheel.radius;
    }
    wheel.node.quaternion.copy(wheel.base)
      .multiply(rotation.setFromAxisAngle(wheel.up, -wheel.steer))
      .multiply(rotation.setFromAxisAngle(wheel.axle, wheel.spin));
  }
}
