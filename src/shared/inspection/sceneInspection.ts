/**
 * Shared inspection data, independent of React, Three.js and any robot runtime.
 * Geometry, physical evidence and live-state provenance are separate facts.
 * This schema describes what is known; it never infers joints from mesh names.
 */
export interface InspectionJoint {
  type: 'fixed' | 'revolute' | 'continuous' | 'prismatic' | 'unknown';
  value: number | null;
  lower: number | null;
  upper: number | null;
  unit: 'rad' | 'm' | 'unknown';
}

export interface InspectionNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'assembly' | 'part' | 'joint';
  joint?: InspectionJoint;
}

export interface SceneInspectionSnapshot {
  schemaVersion: 1;
  objectId: string;
  source: {
    project: string;
    revision: string | null;
    geometry: 'procedural' | 'file';
    reality: 'virtual' | 'engineering';
    lengthUnit: 'm' | 'mm' | 'unknown';
    state: 'procedural-animation' | 'kinematic-preview' | 'simulation' | 'telemetry' | 'unknown';
    physicalEvidence: 'none' | 'reference-model' | 'verified-device';
  };
  nodes: InspectionNode[];
}

export interface InspectionIssue {
  code: string;
  message: string;
  nodeId?: string;
  severity: 'error' | 'warning';
}

export interface InspectionValidation {
  valid: boolean;
  issues: InspectionIssue[];
}

export const INSPECTION_SCHEMA_VERSION = 1;
export const MAX_INSPECTION_NODES = 50_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function member(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

/** Validate untrusted bridge data without coercing names, units or missing values. */
export function validateInspectionSnapshot(input: unknown): InspectionValidation {
  const issues: InspectionIssue[] = [];
  const issue = (code: string, message: string, nodeId?: string, severity: 'error' | 'warning' = 'error') => {
    issues.push({ code, message, ...(nodeId ? { nodeId } : {}), severity });
  };
  const result = () => ({ valid: !issues.some((entry) => entry.severity === 'error'), issues });

  if (!record(input)) {
    issue('invalid_snapshot', 'Inspection snapshot must be an object.');
    return result();
  }
  if (input.schemaVersion !== INSPECTION_SCHEMA_VERSION) {
    issue('unsupported_schema', 'Unsupported inspection schema version.');
  }
  if (!textId(input.objectId)) issue('invalid_object_id', 'An explicit object ID is required.');

  const source = input.source;
  if (!record(source)) {
    issue('missing_source', 'Geometry and state provenance are required.');
  } else {
    if (!textId(source.project)) issue('invalid_project', 'Source project must be explicit.');
    if (source.revision !== null && !textId(source.revision)) {
      issue('invalid_revision', 'Use a source revision or null when it is unknown.');
    }
    for (const [key, allowed] of [
      ['geometry', ['procedural', 'file']],
      ['reality', ['virtual', 'engineering']],
      ['lengthUnit', ['m', 'mm', 'unknown']],
      ['state', ['procedural-animation', 'kinematic-preview', 'simulation', 'telemetry', 'unknown']],
      ['physicalEvidence', ['none', 'reference-model', 'verified-device']],
    ] as const) {
      if (!member(source[key], allowed)) issue(`invalid_${key}`, `Unsupported or missing source ${key}.`);
    }
    if (source.reality === 'virtual' && source.physicalEvidence !== 'none') {
      issue('virtual_physical_claim', 'A virtual character cannot claim a verified physical counterpart.');
    }
    if (source.state === 'telemetry' && source.physicalEvidence === 'none') {
      issue('unverified_telemetry', 'Telemetry has no declared physical source evidence.', undefined, 'warning');
    }
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0 || input.nodes.length > MAX_INSPECTION_NODES) {
    issue('invalid_nodes', `Provide between 1 and ${MAX_INSPECTION_NODES} explicit inspection nodes.`);
    return result();
  }

  const nodes = new Map<string, Record<string, unknown>>();
  let roots = 0;
  for (const candidate of input.nodes) {
    if (!record(candidate) || !textId(candidate.id)) {
      issue('invalid_node_id', 'Every node needs a stable, explicit ID.');
      continue;
    }
    const id = candidate.id;
    if (nodes.has(id)) issue('duplicate_node_id', 'Node IDs must be unique.', id);
    else nodes.set(id, candidate);
    if (!textId(candidate.name)) issue('invalid_node_name', 'Node display name is missing or invalid.', id);
    if (!member(candidate.kind, ['assembly', 'part', 'joint'])) {
      issue('invalid_node_kind', 'Visual assemblies, parts and joints must be identified separately.', id);
    }
    if (candidate.parentId === null) roots += 1;
    else if (!textId(candidate.parentId)) issue('invalid_parent_id', 'Use an explicit parent ID or null for the root.', id);

    if (candidate.kind !== 'joint') {
      if (candidate.joint !== undefined) {
        issue('joint_on_visual_node', 'A visual assembly or part cannot implicitly act as a kinematic joint.', id);
      }
      continue;
    }
    const joint = candidate.joint;
    if (!record(joint)) {
      issue('missing_joint', 'Joint nodes require explicit joint metadata.', id);
      continue;
    }
    if (!member(joint.type, ['fixed', 'revolute', 'continuous', 'prismatic', 'unknown'])) {
      issue('invalid_joint_type', 'Unknown joint types must be declared as unknown.', id);
    }
    if (!member(joint.unit, ['rad', 'm', 'unknown'])) issue('invalid_joint_unit', 'Joint units must be explicit.', id);
    for (const key of ['value', 'lower', 'upper'] as const) {
      if (joint[key] !== null && (typeof joint[key] !== 'number' || !Number.isFinite(joint[key]))) {
        issue('invalid_joint_number', `Joint ${key} must be finite or null; it is never defaulted.`, id);
      }
    }
    if ((joint.type === 'revolute' || joint.type === 'continuous') && joint.unit === 'm') {
      issue('joint_unit_mismatch', 'Rotational joint values cannot use metres.', id);
    }
    if (joint.type === 'prismatic' && joint.unit === 'rad') {
      issue('joint_unit_mismatch', 'Prismatic joint values cannot use radians.', id);
    }
    if (typeof joint.lower === 'number' && typeof joint.upper === 'number' && joint.lower > joint.upper) {
      issue('inverted_joint_limits', 'Joint lower limit is greater than its upper limit.', id);
    }
    if (joint.unit === 'unknown') {
      if (joint.value !== null || joint.lower !== null || joint.upper !== null) {
        issue('unknown_joint_units', 'Numeric joint values have unknown units; range checks are unavailable.', id, 'warning');
      }
    } else if (typeof joint.value === 'number' && Number.isFinite(joint.value)) {
      if ((typeof joint.lower === 'number' && joint.value < joint.lower) ||
          (typeof joint.upper === 'number' && joint.value > joint.upper)) {
        issue('joint_value_out_of_range', 'Joint value exceeds a declared limit.', id);
      }
    }
  }
  if (roots !== 1) issue('invalid_root_count', 'The inspection hierarchy must have exactly one explicit root.');

  for (const [id, node] of nodes) {
    if (typeof node.parentId === 'string' && !nodes.has(node.parentId)) {
      issue('missing_parent', 'Parent ID does not exist in this snapshot.', id);
    }
  }
  // Mark fully traversed parent chains to keep validation linear for large assemblies.
  const visited = new Set<string>();
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue;
    const chain = new Set<string>();
    let current: string | null = start;
    while (current !== null && nodes.has(current) && !visited.has(current)) {
      if (chain.has(current)) {
        issue('hierarchy_cycle', 'The parent hierarchy contains a cycle.', current);
        break;
      }
      chain.add(current);
      const parent: unknown = nodes.get(current)?.parentId;
      current = typeof parent === 'string' ? parent : null;
    }
    for (const id of chain) visited.add(id);
  }
  return result();
}

/** Exact IDs only: display names and substring matches never select a part. */
export function findInspectionNode(snapshot: SceneInspectionSnapshot, id: string): InspectionNode | null {
  return snapshot.nodes.find((node) => node.id === id) ?? null;
}

export function getInspectionChildren(snapshot: SceneInspectionSnapshot, parentId: string | null): InspectionNode[] {
  return snapshot.nodes.filter((node) => node.parentId === parentId);
}
