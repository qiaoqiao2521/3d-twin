/** Visual names are identifiers, never fuzzy search terms. Duplicate IDs fail closed. */
export function createExactNodeIndex<T extends { name: string }>(nodes: Iterable<T>, authoredId: (node: T) => string = node => node.name): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const node of nodes) {
    const name = authoredId(node);
    if (!name) continue;
    const matches = index.get(name) || [];
    if (!matches.includes(node)) matches.push(node);
    index.set(name, matches);
  }
  return index;
}

export function resolveExactJointNode<T>(index: Map<string, T[]>, childId: string, matchesParent?: (node: T) => boolean):
  { status: 'bound'; node: T } | { status: 'missing' | 'ambiguous'; node: null } {
  let matches = index.get(childId) || [];
  // Some original GLBs name both a link group and its visual mesh after the link.
  // Only the declared parent relationship may disambiguate them, never a fuzzy label.
  if (matches.length > 1 && matchesParent) {
    const structuralMatches = matches.filter(matchesParent);
    if (structuralMatches.length === 1) matches = structuralMatches;
  }
  if (matches.length === 1) return { status: 'bound', node: matches[0] };
  return { status: matches.length ? 'ambiguous' : 'missing', node: null };
}
