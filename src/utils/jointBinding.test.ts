import test from 'node:test';
import assert from 'node:assert/strict';
import { createExactNodeIndex, resolveExactJointNode } from './jointBinding.ts';
import { Group, Quaternion, Vector3 } from 'three';
import { applyRobotJointPose } from './robotJointPose.ts';

test('a joint binds only to an exact unique visual identifier', () => {
  const arm = { name: 'left_arm' };
  const index = createExactNodeIndex([arm, { name: 'left_arm_shell' }, { name: 'LEFT_ARM' }]);
  assert.equal(resolveExactJointNode(index, 'left_arm').node, arm);
  assert.equal(resolveExactJointNode(index, 'arm').status, 'missing');
  assert.equal(resolveExactJointNode(index, 'Left_Arm').status, 'missing');
});

test('a link group and its same-named visual bind by the exact declared parent, not traversal order', () => {
  const parent = { name: 'base' };
  const link = { name: 'arm', parent };
  const visual = { name: 'arm', parent: link };
  const index = createExactNodeIndex([visual, link]);
  assert.equal(resolveExactJointNode(index, 'arm', node => node.parent.name === 'base').node, link);
  assert.equal(resolveExactJointNode(index, 'arm', node => node.parent.name === 'unknown').status, 'ambiguous');
});

test('loader-generated names do not replace an authored identifier', () => {
  const node = { name: 'arm_1', original: 'arm' };
  assert.equal(resolveExactJointNode(createExactNodeIndex([node], node => node.original), 'arm').node, node);
});

test('prismatic translation follows the URDF joint frame and restores exactly', () => {
  const node = new Group();
  const position = new Vector3(1, 2, 3), orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  applyRobotJointPose(node, 'prismatic', new Vector3(1, 0, 0), position, orientation, .2);
  assert.ok(node.position.distanceTo(new Vector3(1, 2.2, 3)) < 1e-12);
  applyRobotJointPose(node, 'prismatic', new Vector3(1, 0, 0), position, orientation, 0);
  assert.deepEqual(node.position.toArray(), position.toArray());
});

test('duplicate node names cannot silently choose the last traversed node', () => {
  const one = { name: 'joint_child' };
  const index = createExactNodeIndex([one, one, { name: 'joint_child' }]);
  assert.equal(resolveExactJointNode(index, 'joint_child').status, 'ambiguous');
  assert.equal(resolveExactJointNode(index, 'joint_child').node, null);
});
