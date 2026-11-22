/** Visual names are identifiers, never fuzzy search terms. Duplicate IDs fail closed. */
export function createExactNodeIndex<T extends { name: string }>(nodes: Iterable<T>): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const node of nodes) {
    if (!node.name) continue;
    const matches = index.get(node.name) || [];
    if (!matches.includes(node)) matches.push(node);
    index.set(node.name, matches);
  }
  return index;
}

export function resolveExactJointNode<T>(index: Map<string, T[]>, childId: string):
  { status: 'bound'; node: T } | { status: 'missing' | 'ambiguous'; node: null } {
  const matches = index.get(childId) || [];
  if (matches.length === 1) return { status: 'bound', node: matches[0] };
  return { status: matches.length ? 'ambiguous' : 'missing', node: null };
}
