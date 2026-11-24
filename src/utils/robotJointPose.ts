import { Quaternion, Vector3, type Object3D } from 'three';
import type { UrdfJointDef } from './manifestUtils.ts';

const rotation = new Quaternion();
const translationAxis = new Vector3();

/** URDF axis is expressed in the joint frame; translation must be rotated into its parent frame. */
export function applyRobotJointPose(node: Object3D, type: UrdfJointDef['type'], axis: Vector3, basePosition: Vector3, baseQuaternion: Quaternion, value: number): void {
  node.position.copy(basePosition);
  node.quaternion.copy(baseQuaternion);
  if (type === 'prismatic') {
    translationAxis.copy(axis).applyQuaternion(baseQuaternion).normalize();
    node.position.addScaledVector(translationAxis, value);
  } else if (type !== 'fixed') {
    rotation.setFromAxisAngle(axis, value);
    node.quaternion.multiply(rotation);
  }
}
