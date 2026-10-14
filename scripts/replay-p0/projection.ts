import { serializeEnvelope, type Envelope } from '@sentry/core';
import postcss from 'postcss';
import manifest from './fixtures/sdk-contract.json';
import type { NodeState, ProjectResult, ProjectionState, Reason } from './contract';

const MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
type Bag = Record<string, unknown>;
class Rejected extends Error { constructor(readonly reason: Reason) { super(reason); } }
function requireValue(value: unknown, reason: Reason = 'schema'): asserts value {
  if (!value) throw new Rejected(reason);
}
function bag(value: unknown): Bag {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Bag;
}
function fields(value: unknown, required: string[], optional: string[] = []): Bag {
  const result = bag(value);
  requireValue(required.every(k => Object.hasOwn(result, k))
    && Object.keys(result).every(k => required.includes(k) || optional.includes(k)));
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  requireValue(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
  return value;
}
function id(value: unknown): number { return integer(value, 1, 2 ** 31 - 1); }
function coordinate(value: unknown): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= -65536 && value <= 65536);
  return Math.round(value);
}
function text(value: unknown): string {
  requireValue(typeof value === 'string'); requireValue(value.length <= 4096, 'budget');
  return value.replace(/\S/g, '*');
}
function checkTreeBudget(value: unknown) {
  let count = 0;
  const walk = (v: unknown, depth: number) => {
    requireValue(++count <= 200000 && depth <= 80, 'budget');
    if (typeof v === 'string') requireValue(encoder.encode(v).byteLength <= MAX_BYTES, 'budget');
    if (v && typeof v === 'object') for (const child of Object.values(v)) walk(child, depth + 1);
  };
  walk(value, 0);
}
async function codec(bytes: Uint8Array, decompress: boolean): Promise<Uint8Array> {
  const transform = decompress ? new DecompressionStream('deflate') : new CompressionStream('deflate');
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(transform);
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.byteLength; requireValue(length <= MAX_BYTES, 'budget'); chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
function cssValue(property: string, value: unknown, priority: unknown = ''): string {
  requireValue(typeof value === 'string' && (priority === '' || priority === 'important'));
  let valid = false;
  if (property === 'width' || property === 'height') valid = /^(0|[1-9]\d{0,3})px$/.test(value) && parseInt(value, 10) <= 1000;
  if (property === 'opacity') valid = /^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?|\.\d{1,2})$/.test(value);
  if (property === '--banner-current-index') valid = /^[012]$/.test(value);
  requireValue(valid);
  return value + (priority ? ' !important' : '');
}
function style(value: unknown, previous: Record<string, string>, diff: boolean): Record<string, string> {
  requireValue(diff || typeof value === 'string');
  if (value === null) return {};
  if (typeof value === 'string') {
    requireValue(!value.includes('\\')); const next: Record<string, string> = {};
    const ast = postcss.parse(value);
    for (const node of ast.nodes) {
      requireValue(node.type === 'decl');
      requireValue(!Object.hasOwn(next, node.prop));
      next[node.prop] = cssValue(node.prop, node.value, node.important ? 'important' : '');
    }
    return next;
  }
  requireValue(diff); const next = { ...previous };
  for (const [property, change] of Object.entries(bag(value))) {
    requireValue(['width', 'height', 'opacity', '--banner-current-index'].includes(property));
    if (change === false) { requireValue(Object.hasOwn(next, property)); delete next[property]; }
    else if (Array.isArray(change)) {
      requireValue(change.length === 2); next[property] = cssValue(property, change[0], change[1]);
    } else next[property] = cssValue(property, change);
  }
  return next;
}
function styleString(value: Record<string, string>): string {
  return Object.entries(value).map(([k, v]) => `${k}: ${v};`).join(' ');
}
function attributes(value: unknown, node: NodeState, diff: boolean): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(bag(value))) {
    let clean: string | null;
    if (key === 'style') {
      node.style = style(raw, node.style, diff);
      clean = raw === null ? null : styleString(node.style);
    } else if (key === 'class') {
      if (raw === null && diff) clean = null;
      else {
        requireValue(typeof raw === 'string'); const tokens = raw.split(/\s+/).filter(Boolean);
        requireValue(tokens.length <= 64 && tokens.every(t => t.length <= 256), 'budget');
        clean = tokens.filter(t => manifest.classes.includes(t)).join(' ');
      }
    } else if (key === 'disabled' || key === 'aria-expanded') {
      if (raw === null && diff) clean = null;
      else if (key === 'disabled') { requireValue(raw === '' || raw === 'disabled'); clean = ''; }
      else { requireValue(raw === 'true' || raw === 'false'); clean = raw; }
    } else if (key === 'rr_width' || key === 'rr_height') {
      requireValue(typeof raw === 'string' && /^(0|[1-9]\d*)px$/.test(raw) && parseInt(raw, 10) <= 16384); clean = raw;
    } else if (key === 'rr_scrollLeft' || key === 'rr_scrollTop') {
      const n = typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : raw;
      clean = String(integer(n, -65536, 65536));
    } else if (key === '_cssText') {
      requireValue(raw === manifest.rawCss || raw === manifest.normalizedCss); clean = manifest.rawCss;
    } else continue;
    output[key] = clean;
    if (clean === null) delete node.attrs[key]; else node.attrs[key] = clean;
  }
  return output;
}
function staticCss(value: unknown): string {
  requireValue(value === manifest.rawCss || value === manifest.normalizedCss); return manifest.rawCss;
}
function nodeBudget(state: ProjectionState) {
  requireValue(state.nodes.size + state.tombstones.size <= 20000, 'budget');
}
function live(state: ProjectionState, value: unknown): NodeState {
  const key = id(value); const node = state.nodes.get(key);
  requireValue(node && !state.tombstones.has(key), 'sequence'); return node;
}
function projectNode(raw: unknown, parent: number | null, state: ProjectionState): Bag {
  const n = bag(raw); const key = id(n.id); const kind = integer(n.type, 0, 5);
  const old = state.nodes.get(key);
  requireValue(!old || state.tombstones.has(key), 'sequence');
  requireValue(!old || (old.kind === kind && old.tag === n.tagName), 'sequence');
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
    fields(n, ['id', 'type', 'tagName', 'attributes', 'childNodes']);
    requireValue(typeof n.tagName === 'string' && manifest.tags.includes(n.tagName));
    entry.tag = n.tagName; output = { type: 2, tagName: n.tagName, attributes: attributes(n.attributes, entry, false), childNodes: [], id: key };
  } else if (kind === 3 || kind === 5) {
    fields(n, ['id', 'type', 'textContent'], kind === 3 ? ['isStyle'] : []);
    const isStyle = parent !== null && state.nodes.get(parent)?.tag === 'style';
    requireValue(n.isStyle === undefined || (n.isStyle === true && isStyle));
    entry.isStyle = isStyle;
    entry.text = kind === 5 ? '' : isStyle ? staticCss(n.textContent) : text(n.textContent);
    return { type: kind, textContent: entry.text, ...(isStyle ? { isStyle: true } : {}), id: key };
  } else throw new Rejected('schema');
  requireValue(Array.isArray(n.childNodes));
  output.childNodes = n.childNodes.map(child => {
    const projected = projectNode(child, key, state); entry.children.push(projected.id as number); return projected;
  });
  return output;
}
function removeNode(state: ProjectionState, key: number) {
  const node = live(state, key);
  state.tombstones.add(key);
  for (const child of node.children) removeNode(state, child);
  nodeBudget(state);
}
function timestamp(value: unknown, start: number): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= start && value <= start + 300000);
  return value;
}
function mutation(data: Bag, state: ProjectionState): Bag {
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
    const node = projectNode(x.node, parentKey, state);
    parent.children.splice(next === null ? parent.children.length : parent.children.indexOf(next), 0, key);
    return { parentId: parentKey, nextId: next, node };
  });
  const texts = (data.texts as unknown[]).map(raw => {
    const x = fields(raw, ['id', 'value']); const node = live(state, x.id);
    requireValue(node.kind === 3 || node.kind === 5);
    node.text = node.kind === 5 ? '' : node.isStyle ? staticCss(x.value) : text(x.value);
    return { id: x.id, value: node.text };
  });
  const changes = (data.attributes as unknown[]).map(raw => {
    const x = fields(raw, ['id', 'attributes']); const node = live(state, x.id); requireValue(node.kind === 2);
    return { id: x.id, attributes: attributes(x.attributes, node, true) };
  });
  return { source: 0, texts, attributes: changes, removes, adds };
}
function projectRecords(records: unknown[], state: ProjectionState, segment: number): Bag[] {
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
      data = { node: projectNode(d.node, null, state), initialOffset: { left: coordinate(offset.left), top: coordinate(offset.top) } };
    } else if (kind === 3) {
      const d = bag(e.data); const source = integer(d.source, 0, 16);
      if ([5, 7, 9, 10, 11, 12, 14].includes(source)) continue;
      requireValue(segment > 0 || full, 'sequence');
      if (source === 0) data = mutation(d, state);
      else if (source === 1 || source === 6) {
        fields(d, ['source', 'positions']); requireValue(Array.isArray(d.positions));
        data = { source, positions: d.positions.map(rawPosition => {
          const p = fields(rawPosition, ['x', 'y', 'id', 'timeOffset']); live(state, p.id);
          requireValue(typeof p.timeOffset === 'number' && Number.isFinite(p.timeOffset)); timestamp(time + p.timeOffset, state.sessionStartMs!);
          return { x: coordinate(p.x), y: coordinate(p.y), id: p.id, timeOffset: p.timeOffset };
        }) };
      } else if (source === 2) {
        fields(d, ['source', 'type', 'id', 'x', 'y']); live(state, d.id);
        data = { source, type: integer(d.type, 0, 9), id: d.id, x: coordinate(d.x), y: coordinate(d.y) };
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

/** Only the synthetic P0 schema. Never use as a general Replay transport. */
export async function projectEnvelope(input: Envelope, state: ProjectionState): Promise<ProjectResult> {
  try {
    requireValue(Array.isArray(input) && input.length === 2 && Array.isArray(input[1]) && input[1].length === 2);
    const [header, items] = input; const replay = items.find(i => i[0].type === 'replay_event');
    const recording = items.find(i => i[0].type === 'replay_recording'); requireValue(replay && recording);
    const event = bag(replay[1]); checkTreeBudget(event);
    const replayId = event.replay_id;
    requireValue(typeof replayId === 'string' && /^[a-f0-9]{32}$/.test(replayId) && event.event_id === replayId && header.event_id === replayId, 'sequence');
    const segment = integer(event.segment_id, 0, 2 ** 31 - 1);
    requireValue(segment === state.nextSegment && (state.replayId === null || state.replayId === replayId), 'sequence');
    requireValue(event.type === 'replay_event' && event.replay_type === 'session');
    requireValue(bag(event.sdk).version === manifest.sdkVersion);
    requireValue(typeof event.replay_start_timestamp === 'number' && Number.isFinite(event.replay_start_timestamp));
    const start = event.replay_start_timestamp * 1000;
    requireValue(start >= 0 && (state.sessionStartMs === null || start === state.sessionStartMs), 'sequence');
    requireValue(typeof event.timestamp === 'number'); timestamp(event.timestamp * 1000, start);
    const payload = recording[1]; requireValue(typeof payload === 'string' || payload instanceof Uint8Array);
    const bytes = typeof payload === 'string' ? encoder.encode(payload) : payload;
    requireValue(bytes.byteLength <= MAX_BYTES, 'budget');
    const split = bytes.indexOf(10); requireValue(split > 0);
    const recordingHeader = fields(JSON.parse(decoder.decode(bytes.subarray(0, split))), ['segment_id']);
    requireValue(recordingHeader.segment_id === segment, 'sequence');
    let body = bytes.subarray(split + 1);
    const compressed = body[0] !== 91;
    if (compressed) body = await codec(body, true);
    requireValue(body.byteLength <= MAX_BYTES, 'budget');
    const records: unknown = JSON.parse(decoder.decode(body)); checkTreeBudget(records);
    requireValue(Array.isArray(records)); requireValue(records.length <= 10000, 'budget');
    const next = structuredClone(state); next.replayId = replayId; next.sessionStartMs = start; nodeBudget(next);
    const clean = projectRecords(records, next, segment);
    const segmentHeader = encoder.encode(JSON.stringify({ segment_id: segment }) + '\n');
    const rawOutput = encoder.encode(JSON.stringify(clean));
    requireValue(rawOutput.byteLength + segmentHeader.byteLength <= MAX_BYTES, 'budget');
    const encodedOutput = compressed ? await codec(rawOutput, false) : rawOutput;
    const outputRecording = new Uint8Array(segmentHeader.length + encodedOutput.length);
    outputRecording.set(segmentHeader); outputRecording.set(encodedOutput, segmentHeader.length);
    requireValue(outputRecording.byteLength <= MAX_BYTES, 'budget');
    const sdk = { name: 'sentry.javascript.browser', version: '9.47.1' };
    const metadata = { type: 'replay_event' as const, replay_type: 'session' as const, event_id: replayId, replay_id: replayId,
      segment_id: segment, timestamp: event.timestamp, replay_start_timestamp: event.replay_start_timestamp,
      release: 'replay-p0-fixture', environment: 'replay-p0-local', platform: 'javascript', sdk,
      urls: ['https://replay.invalid/ko/vote'], error_ids: [], trace_ids: [] };
    const envelope: Envelope = [{ event_id: replayId, sdk }, [
      [{ type: 'replay_event' }, metadata],
      [{ type: 'replay_recording', length: outputRecording.length }, outputRecording],
    ]];
    const serialized = serializeEnvelope(envelope);
    const output = typeof serialized === 'string' ? encoder.encode(serialized) : serialized;
    requireValue(output.byteLength <= MAX_BYTES, 'budget'); next.nextSegment++;
    return { ok: true, value: { bytes: output, next, segment } };
  } catch (error) { return { ok: false, reason: error instanceof Rejected ? error.reason : 'schema' }; }
}
