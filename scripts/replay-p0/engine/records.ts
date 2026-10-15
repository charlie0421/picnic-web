import type { ProjectionState } from '../contract';
import { attributes, live, projectNode, removeNode } from './nodes';
import type { Contract } from './types';
import { bag, coordinate, fields, id, integer, Rejected, requireValue, type Bag } from './values';

export function timestamp(value: unknown, start: number): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= start && value <= start + 300000);
  return value;
}
function mutation(data: Bag, state: ProjectionState, contract: Contract): Bag {
  fields(data, ['source', 'texts', 'attributes', 'removes', 'adds']);
  for (const name of ['texts', 'attributes', 'removes', 'adds']) requireValue(Array.isArray(data[name]));
  const removes = (data.removes as unknown[]).map(raw => {
    const x = fields(raw, ['parentId', 'id']); const key = id(x.id); const parent = live(state, x.parentId);
    const node = live(state, key); requireValue(node.parent === x.parentId && parent.children.includes(key), 'sequence');
    parent.children = parent.children.filter(v => v !== key); removeNode(state, key); node.parent = null;
    return { parentId: x.parentId, id: key };
  });
  const adds = (data.adds as unknown[]).map(raw => {
    const x = fields(raw, ['parentId', 'nextId', 'node']); const parentKey = id(x.parentId); const parent = live(state, parentKey);
    requireValue(parent.kind === 0 || parent.kind === 2, 'sequence');
    const next = x.nextId === null ? null : id(x.nextId);
    if (next !== null) requireValue(live(state, next).parent === parentKey && parent.children.includes(next), 'sequence');
    const key = id(bag(x.node).id); let ancestor: number | null = parentKey;
    while (ancestor !== null) { requireValue(ancestor !== key, 'sequence'); ancestor = state.nodes.get(ancestor)?.parent ?? null; }
    requireValue(contract.childAllowed(parent));
    const node = projectNode(x.node, parentKey, state, contract);
    parent.children.splice(next === null ? parent.children.length : parent.children.indexOf(next), 0, key);
    return { parentId: parentKey, nextId: next, node };
  });
  const texts = (data.texts as unknown[]).map(raw => {
    const x = fields(raw, ['id', 'value']); const node = live(state, x.id);
    requireValue(node.kind === 3 || node.kind === 5);
    node.text = node.kind === 5 ? '' : node.isStyle ? contract.styleText(x.value) : contract.text(x.value, node.parent === null ? undefined : state.nodes.get(node.parent));
    return { id: x.id, value: node.text };
  });
  const changes = (data.attributes as unknown[]).map(raw => {
    const x = fields(raw, ['id', 'attributes']); const node = live(state, x.id); requireValue(node.kind === 2);
    const out = attributes(x.attributes, node, true, contract); contract.checkElement(node, state);
    return { id: x.id, attributes: out };
  });
  return { source: 0, texts, attributes: changes, removes, adds };
}
export function projectRecords(records: unknown[], state: ProjectionState, segment: number, contract: Contract): Bag[] {
  let full = false, meta = false;
  const clean: Bag[] = [];
  for (const raw of records) {
    const e = fields(raw, ['type', 'timestamp', 'data']); const kind = integer(e.type, 0, 6);
    if (kind === 5) continue;
    const time = timestamp(e.timestamp, state.sessionStartMs!); let data: Bag;
    if (kind === 0 || kind === 1) { fields(e.data, []); data = {}; }
    else if (kind === 4) {
      const d = fields(e.data, ['href', 'width', 'height']); requireValue(segment === 0 && !meta, 'sequence'); meta = true;
      data = { href: 'https://replay.invalid/ko/vote', width: integer(d.width, 1, 4096), height: integer(d.height, 1, 4096) };
    } else if (kind === 2) {
      const d = fields(e.data, ['node', 'initialOffset']); const offset = fields(d.initialOffset, ['left', 'top']);
      requireValue(segment === 0 && !full && meta, 'sequence'); full = true;
      requireValue(bag(d.node).type === 0);
      data = { node: projectNode(d.node, null, state, contract), initialOffset: { left: coordinate(offset.left), top: coordinate(offset.top) } };
    } else if (kind === 3) {
      const d = bag(e.data); const source = integer(d.source, 0, 16);
      if ([5, 7, 9, 10, 11, 12, 14].includes(source)) continue;
      requireValue(segment > 0 || full, 'sequence');
      if (source === 0) data = mutation(d, state, contract);
      else if (source === 1 || source === 6) {
        fields(d, ['source', 'positions']); requireValue(Array.isArray(d.positions));
        data = { source, positions: d.positions.map(rawPosition => {
          const p = fields(rawPosition, ['x', 'y', 'id', 'timeOffset']); live(state, p.id);
          requireValue(typeof p.timeOffset === 'number' && Number.isFinite(p.timeOffset)); timestamp(time + p.timeOffset, state.sessionStartMs!);
          return { x: coordinate(p.x), y: coordinate(p.y), id: p.id, timeOffset: p.timeOffset };
        }) };
      } else if (source === 2) {
        fields(d, ['source', 'type', 'id'], ['x', 'y', 'pointerType']); live(state, d.id);
        const interaction = integer(d.type, 0, 9);
        data = { source, type: interaction, id: d.id };
        if (interaction === 5 || interaction === 6) {
          // Actual FocusEvent/blur wire has no client coordinates.
          requireValue(d.x === undefined && d.y === undefined);
        } else { data.x = coordinate(d.x); data.y = coordinate(d.y); }
        if (d.pointerType !== undefined) data.pointerType = integer(d.pointerType, 0, 2);
      } else if (source === 3) {
        fields(d, ['source', 'id', 'x', 'y']); live(state, d.id);
        data = { source, id: d.id, x: coordinate(d.x), y: coordinate(d.y) };
      } else if (source === 4) {
        fields(d, ['source', 'width', 'height']); data = { source, width: integer(d.width, 1, 4096), height: integer(d.height, 1, 4096) };
      } else throw new Rejected('schema');
    } else throw new Rejected('schema');
    clean.push({ type: kind, data, timestamp: time });
  }
  requireValue(segment !== 0 || (meta && full), 'sequence'); return clean;
}
