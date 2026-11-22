import test from 'node:test';
import assert from 'node:assert/strict';
import { createExactNodeIndex, resolveExactJointNode } from './jointBinding.ts';

test('a joint binds only to an exact unique visual identifier', () => {
  const arm = { name: 'left_arm' };
  const index = createExactNodeIndex([arm, { name: 'left_arm_shell' }, { name: 'LEFT_ARM' }]);
  assert.equal(resolveExactJointNode(index, 'left_arm').node, arm);
  assert.equal(resolveExactJointNode(index, 'arm').status, 'missing');
  assert.equal(resolveExactJointNode(index, 'Left_Arm').status, 'missing');
});

test('duplicate node names cannot silently choose the last traversed node', () => {
  const one = { name: 'joint_child' };
  const index = createExactNodeIndex([one, one, { name: 'joint_child' }]);
  assert.equal(resolveExactJointNode(index, 'joint_child').status, 'ambiguous');
  assert.equal(resolveExactJointNode(index, 'joint_child').node, null);
});
