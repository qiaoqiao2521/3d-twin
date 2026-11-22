import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findInspectionNode,
  getInspectionChildren,
  validateInspectionSnapshot,
  type SceneInspectionSnapshot,
} from './sceneInspection.ts';

function snapshot(): SceneInspectionSnapshot {
  return {
    schemaVersion: 1,
    objectId: 'iron:grimlock:beast',
    source: {
      project: 'iron', revision: null, geometry: 'procedural', reality: 'virtual',
      lengthUnit: 'unknown', state: 'procedural-animation', physicalEvidence: 'none',
    },
    nodes: [
      { id: 'root', parentId: null, name: 'Grimlock', kind: 'assembly' },
      { id: 'part:left-eye', parentId: 'root', name: 'Eye', kind: 'part' },
      { id: 'part:right-eye', parentId: 'root', name: 'Eye', kind: 'part' },
    ],
  };
}

test('procedural virtual geometry remains inspectable without a source model file or physical claim', () => {
  const value = snapshot();
  assert.deepEqual(validateInspectionSnapshot(value), { valid: true, issues: [] });
  assert.equal(value.source.revision, null);
  assert.equal(value.source.lengthUnit, 'unknown');
  assert.equal(value.nodes.filter((node) => node.kind === 'joint').length, 0);
});

test('selection resolves exact stable IDs and never guesses from duplicate display names', () => {
  const value = snapshot();
  assert.equal(findInspectionNode(value, 'Eye'), null);
  assert.equal(findInspectionNode(value, 'left-eye'), null);
  assert.equal(findInspectionNode(value, 'part:left-eye')?.id, 'part:left-eye');
  assert.equal(getInspectionChildren(value, 'root').length, 2);
});

test('virtual source cannot acquire engineering evidence by embedding', () => {
  const value = snapshot();
  value.source.physicalEvidence = 'verified-device';
  assert.equal(validateInspectionSnapshot(value).valid, false);
  assert.ok(validateInspectionSnapshot(value).issues.some((entry) => entry.code === 'virtual_physical_claim'));
});

test('a model file alone does not require or assert a verified device', () => {
  const value = snapshot();
  value.source.geometry = 'file';
  value.source.reality = 'engineering';
  value.source.physicalEvidence = 'reference-model';
  assert.equal(validateInspectionSnapshot(value).valid, true);
  assert.equal(value.source.physicalEvidence, 'reference-model');
});

test('duplicate IDs, missing parents and cyclic hierarchies are rejected', () => {
  const duplicate = snapshot();
  duplicate.nodes[2].id = duplicate.nodes[1].id;
  assert.ok(validateInspectionSnapshot(duplicate).issues.some((entry) => entry.code === 'duplicate_node_id'));
  const orphan = snapshot();
  orphan.nodes[1].parentId = 'absent';
  assert.ok(validateInspectionSnapshot(orphan).issues.some((entry) => entry.code === 'missing_parent'));
  const cycle = snapshot();
  cycle.nodes[1].parentId = cycle.nodes[2].id;
  cycle.nodes[2].parentId = cycle.nodes[1].id;
  assert.ok(validateInspectionSnapshot(cycle).issues.some((entry) => entry.code === 'hierarchy_cycle'));
});

test('joint metadata stays distinct from the visual assembly tree', () => {
  const value = snapshot();
  value.nodes[1].joint = { type: 'revolute', value: 0, lower: -1, upper: 1, unit: 'rad' };
  assert.ok(validateInspectionSnapshot(value).issues.some((entry) => entry.code === 'joint_on_visual_node'));
  value.nodes[1].kind = 'joint';
  assert.equal(validateInspectionSnapshot(value).valid, true);
});

test('final joint values are checked against declared limits, including zero limits', () => {
  const value = snapshot();
  value.nodes.push({
    id: 'joint:jaw', parentId: 'root', name: 'Jaw hinge', kind: 'joint',
    joint: { type: 'revolute', value: 0.2, lower: 0, upper: 0.1, unit: 'rad' },
  });
  assert.ok(validateInspectionSnapshot(value).issues.some((entry) => entry.code === 'joint_value_out_of_range'));
  value.nodes[3].joint!.value = 0;
  assert.equal(validateInspectionSnapshot(value).valid, true);
  value.nodes[3].joint!.value = -0.01;
  assert.equal(validateInspectionSnapshot(value).valid, false);
});

test('missing measurements remain null and unknown instead of invented limits', () => {
  const value = snapshot();
  value.nodes.push({
    id: 'joint:unknown', parentId: 'root', name: 'Unmeasured joint', kind: 'joint',
    joint: { type: 'unknown', value: null, lower: null, upper: null, unit: 'unknown' },
  });
  const before = structuredClone(value);
  assert.equal(validateInspectionSnapshot(value).valid, true);
  assert.deepEqual(value, before);
});

test('nonfinite numbers, incompatible units and inverted limits fail validation', () => {
  for (const joint of [
    { type: 'revolute', value: NaN, lower: null, upper: null, unit: 'rad' },
    { type: 'prismatic', value: 0, lower: 0, upper: 1, unit: 'rad' },
    { type: 'revolute', value: 0, lower: 1, upper: -1, unit: 'rad' },
  ] as const) {
    const value = snapshot();
    value.nodes.push({ id: 'joint:bad', parentId: 'root', name: 'Bad', kind: 'joint', joint });
    assert.equal(validateInspectionSnapshot(value).valid, false);
  }
});

test('unknown and malformed bridge payloads are rejected without throwing', () => {
  for (const value of [null, [], 'iron', {}, { schemaVersion: 2, nodes: [] }, { ...snapshot(), nodes: [null] }]) {
    assert.equal(validateInspectionSnapshot(value).valid, false);
  }
});
