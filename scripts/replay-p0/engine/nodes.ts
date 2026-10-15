import type { NodeState, ProjectionState } from '../contract';
import type { Contract } from './types';
import { bag, fields, id, integer, Rejected, requireValue, type Bag } from './values';

export function nodeBudget(state: ProjectionState) {
  // The approved budget counts retained node records AND tombstone ID records.
  // A removed ID retains its typed node for reinsertion checks and occupies both stores.
  requireValue(state.nodes.size + state.tombstones.size <= 20000, 'budget');
}
export function live(state: ProjectionState, value: unknown): NodeState {
  const key = id(value); const node = state.nodes.get(key);
  requireValue(node && !state.tombstones.has(key), 'sequence'); return node;
}
export function attributes(value: unknown, node: NodeState, diff: boolean, contract: Contract): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(bag(value))) {
    const clean = contract.attribute({ tag: node.tag!, key, raw, node, diff });
    if (clean === undefined) continue;
    requireValue(clean !== null || diff);
    output[key] = clean;
    if (clean === null) delete node.attrs[key]; else node.attrs[key] = clean;
  }
  return output;
}
export function projectNode(raw: unknown, parent: number | null, state: ProjectionState, contract: Contract): Bag {
  const n = bag(raw); const key = id(n.id); const kind = integer(n.type, 0, 5);
  const old = state.nodes.get(key);
  requireValue(!old || state.tombstones.has(key), 'sequence');
  requireValue(!old || (old.kind === kind && old.tag === n.tagName), 'sequence');
  const parentEntry = parent === null ? undefined : state.nodes.get(parent);
  const entry: NodeState = { parent, children: [], kind, attrs: {}, style: {} };
  state.nodes.set(key, entry); state.tombstones.delete(key); nodeBudget(state);
  let output: Bag;
  if (kind === 0) {
    fields(n, ['id', 'type', 'childNodes']); requireValue(parent === null && !old);
    output = { type: 0, childNodes: [], id: key };
  } else if (kind === 1) {
    fields(n, ['id', 'type', 'name', 'publicId', 'systemId']);
    requireValue(n.name === 'html' && n.publicId === '' && n.systemId === '');
    return { type: 1, name: 'html', publicId: '', systemId: '', id: key };
  } else if (kind === 2) {
    fields(n, ['id', 'type', 'tagName', 'attributes', 'childNodes'], contract.elementExtraKeys);
    requireValue(typeof n.tagName === 'string' && contract.tags.has(n.tagName));
    entry.tag = n.tagName;
    const extras = contract.elementExtras(n, entry, parentEntry, state);
    output = { type: 2, tagName: n.tagName, attributes: attributes(n.attributes, entry, false, contract), childNodes: [], ...extras, id: key };
  } else if (kind === 3 || kind === 5) {
    fields(n, ['id', 'type', 'textContent'], kind === 3 ? ['isStyle'] : []);
    const isStyle = parentEntry?.tag === 'style';
    requireValue(n.isStyle === undefined || (n.isStyle === true && isStyle));
    entry.isStyle = isStyle;
    entry.text = kind === 5 ? '' : isStyle ? contract.styleText(n.textContent) : contract.text(n.textContent, parentEntry);
    return { type: kind, textContent: entry.text, ...(isStyle ? { isStyle: true } : {}), id: key };
  } else throw new Rejected('schema');
  requireValue(Array.isArray(n.childNodes));
  output.childNodes = n.childNodes.map(child => {
    const projected = projectNode(child, key, state, contract); entry.children.push(projected.id as number); return projected;
  });
  if (kind === 2) contract.checkElement(entry, state);
  return output;
}
export function removeNode(state: ProjectionState, key: number) {
  const node = live(state, key);
  state.tombstones.add(key);
  for (const child of node.children) removeNode(state, child);
  nodeBudget(state);
}
