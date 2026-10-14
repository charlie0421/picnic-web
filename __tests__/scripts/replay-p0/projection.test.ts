// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Envelope } from '@sentry/core';
import { deflateSync } from 'node:zlib';
import fixture from '../../../scripts/replay-p0/fixtures/sdk-contract.json';
import { emptyProjectionState } from '../../../scripts/replay-p0/contract';
import { projectEnvelope } from '../../../scripts/replay-p0/projection';
import { parseBrowserEnvelope } from '../../../scripts/envelope-test/browser-analyze';

const captured = fixture.envelopes.filter(e => e.items.some(i => i.header.type === 'replay_recording'));
function input(index = 0, compressed = false): Envelope {
  const e = structuredClone(captured[index]);
  return [e.header, e.items.map(i => {
    if (i.header.type !== 'replay_recording') return [i.header, i.payload];
    const p = i.payload as { segment: unknown; records: unknown[] };
    const data = Buffer.from(JSON.stringify(p.records));
    return [{ type: 'replay_recording' }, new Uint8Array(Buffer.concat([
      Buffer.from(JSON.stringify(p.segment) + '\n'), compressed ? deflateSync(data) : data,
    ]))];
  })] as Envelope;
}
function changeRecords(fn: (records: any[]) => void): Envelope {
  const e = input();
  const item = e[1].find(i => i[0].type === 'replay_recording')!;
  const text = new TextDecoder().decode(item[1] as Uint8Array);
  const split = text.indexOf('\n'); const records = JSON.parse(text.slice(split + 1));
  fn(records); item[1] = new TextEncoder().encode(text.slice(0, split + 1) + JSON.stringify(records));
  return e;
}

describe('P0 projection', () => {
  it.each([false, true])('accepts actual SDK 0→1→2, compression=%s, without mutating prior state', async compressed => {
    let state = emptyProjectionState();
    for (let segment = 0; segment < 3; segment++) {
      const before = structuredClone(state);
      const result = await projectEnvelope(input(segment, compressed), state);
      expect(result.ok).toBe(true); expect(state).toEqual(before);
      if (!result.ok) throw new Error(result.reason);
      const decoded = parseBrowserEnvelope(Buffer.from(result.value.bytes));
      expect(decoded.items.find((i: any) => i.header.type === 'replay_recording').compressed).toBe(compressed);
      const replay = decoded.items.find((i: any) => i.header.type === 'replay_event').payload;
      expect(replay.urls).toEqual(['https://replay.invalid/ko/vote']);
      expect(replay.error_ids).toEqual([]); expect(replay.trace_ids).toEqual([]);
      expect(replay).not.toHaveProperty('request'); expect(replay).not.toHaveProperty('contexts');
      expect(JSON.stringify(decoded)).not.toContain('127.0.0.1');
      expect(decoded.items.find((i: any) => i.header.type === 'replay_recording').payload.records.some((r: any) => r.type === 5)).toBe(false);
      state = result.value.next;
    }
    expect(state.nextSegment).toBe(3);
    expect(state.nodes.get(10)?.style).toEqual({});
    expect(state.nodes.get(13)?.attrs.disabled).toBe('');
    expect(state.nodes.get(10)?.children).toEqual([11]);
    expect(state.tombstones.size).toBe(0);
  });
  it.each(['gap', 'wrong-id', 'mixed', 'missing-full', 'unknown-node', 'unknown-event', 'cssom'])('rejects %s', async kind => {
    const e = kind === 'gap' ? input(1) : changeRecords(records => {
      if (kind === 'missing-full') records.splice(records.findIndex(r => r.type === 2), 1);
      if (kind === 'unknown-node') records.find(r => r.type === 2).data.node.childNodes.push({ type: 99, id: 900 });
      if (kind === 'unknown-event') records.push({ type: 77, timestamp: records[0].timestamp, data: {} });
      if (kind === 'cssom') records.push({ type: 3, timestamp: records[0].timestamp, data: { source: 13 } });
    });
    if (kind === 'wrong-id') e[0].event_id = '0'.repeat(32);
    if (kind === 'mixed') e[1].push([{ type: 'event' }, { message: 'mixed' }]);
    const state = emptyProjectionState(); const before = structuredClone(state);
    expect((await projectEnvelope(e, state)).ok).toBe(false); expect(state).toEqual(before);
  });
  it('rejects duplicate and second full snapshot after a successful segment', async () => {
    const first = await projectEnvelope(input(), emptyProjectionState());
    if (!first.ok) throw new Error(first.reason);
    expect((await projectEnvelope(input(), first.value.next)).ok).toBe(false);
  });
  it('remasks synthetic text and strips free attributes', async () => {
    const e = changeRecords(records => {
      const root = records.find(r => r.type === 2).data.node;
      const walk = (n: any) => {
        if (n.type === 3 && !n.isStyle) n.textContent = 'alice@example.test';
        if (n.type === 2) { n.attributes['data-secret'] = 'canary-secret'; n.attributes.id = 'canary-id'; }
        n.childNodes?.forEach(walk);
      }; walk(root);
    });
    const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const wire = new TextDecoder().decode(result.value.bytes);
    expect(wire).not.toContain('alice'); expect(wire).not.toContain('canary');
  });
  it('rejects over-budget raw recording before parsing', async () => {
    const e = input(); e[1].find(i => i[0].type === 'replay_recording')![1] = new Uint8Array(8 * 1024 * 1024 + 1);
    expect(await projectEnvelope(e, emptyProjectionState())).toEqual({ ok: false, reason: 'budget' });
  });
  it('removes unknown mutation attribute names as well as values', async () => {
    const e = changeRecords(records => records.push({ type: 3, timestamp: records[0].timestamp,
      data: { source: 0, texts: [], adds: [], removes: [], attributes: [{ id: 10, attributes: { 'data-canary-secret': 'canary-value' } }] } }));
    const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(new TextDecoder().decode(result.value.bytes)).not.toContain('canary');
  });
  it.each([
    ['width:1000px', true], ['width:1001px', false], ['height:0px', true], ['height:-1px', false],
    ['opacity:.50', true], ['opacity:.501', false], ['opacity:1', true], ['opacity:1.01', false],
    ['--banner-current-index:2', true], ['--banner-current-index:3', false], ['--unknown:1', false],
    ['width:var(--secret)', false], ['background:url(https://canary.invalid)', false],
    ['width:1px;width:2px', false], ['width:1e2px', false],
  ])('validates inline style %s', async (css, accepted) => {
    const e = changeRecords(records => {
      const find = (n: any): any => n.id === 10 ? n : n.childNodes?.map(find).find(Boolean);
      find(records.find(r => r.type === 2).data.node).attributes.style = css;
    });
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it.each([[4096, true], [4097, false]])('bounds viewport width %i', async (width, accepted) => {
    const e = changeRecords(r => { r.find(x => x.type === 4).data.width = width; });
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it.each([[65536, true], [-65536, true], [65537, false]])('bounds pointer %i', async (x, accepted) => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp,
      data: { source: 2, type: 2, id: 13, x, y: 0 } }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it.each([[4096, true], [4097, false]])('bounds text length %i', async (length, accepted) => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp,
      data: { source: 0, texts: [{ id: 12, value: 'a'.repeat(length) }], attributes: [], removes: [], adds: [] } }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it.each([[64, true], [65, false]])('bounds class count %i', async (count, accepted) => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp,
      data: { source: 0, texts: [], attributes: [{ id: 10, attributes: { class: Array(count).fill('card').join(' ') } }], removes: [], adds: [] } }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it.each([[10000, true], [10001, false]])('bounds event count %i', async (count, accepted) => {
    const e = changeRecords(r => { while (r.length < count) r.push({ type: 5, timestamp: 0, data: {} }); });
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
  it('rejects a compression bomb and excessively deep custom event before projecting', async () => {
    const e = input(); const data = deflateSync(Buffer.from(' '.repeat(8 * 1024 * 1024 + 1)));
    e[1].find(i => i[0].type === 'replay_recording')![1] = new Uint8Array(Buffer.concat([Buffer.from('{"segment_id":0}\n'), data]));
    expect(await projectEnvelope(e, emptyProjectionState())).toEqual({ ok: false, reason: 'budget' });
    const deep = changeRecords(r => { let data: any = {}; for (let i = 0; i < 81; i++) data = { child: data }; r.push({ type: 5, timestamp: 0, data }); });
    expect(await projectEnvelope(deep, emptyProjectionState())).toEqual({ ok: false, reason: 'budget' });
  });
  it('rejects an SDK mismatch', async () => {
    const e = input(); (e[1].find(i => i[0].type === 'replay_event')![1] as any).sdk.version = '99.0.0';
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(false);
  });
  it('requires a document as the full snapshot root', async () => {
    const e = changeRecords(r => { const d = r.find(x => x.type === 2).data; d.node = d.node.childNodes[1]; });
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(false);
  });
  it.each(['next', 'cycle', 'unknown-target'])('rejects broken mutation references: %s', async kind => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp,
      data: { source: 0, texts: kind === 'unknown-target' ? [{ id: 9999, value: 'masked' }] : [], attributes: [],
        removes: kind === 'cycle' ? [{ id: 10, parentId: 9 }] : [],
        adds: kind === 'unknown-target' ? [] : [{ parentId: kind === 'cycle' ? 11 : 9, nextId: kind === 'next' ? 9999 : null,
          node: { type: 2, id: kind === 'cycle' ? 10 : 100, tagName: 'div', attributes: {}, childNodes: [] } }] } }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(false);
  });
  it.each([0, 1, 3, 4, 6])('accepts supported event/source %i', async source => {
    const e = changeRecords(r => r.push(source === 0 ? { type: 0, timestamp: r[0].timestamp, data: {} } : {
      type: 3, timestamp: r[0].timestamp,
      data: source === 1 || source === 6 ? { source, positions: [{ id: 13, x: 1, y: 2, timeOffset: 0 }] }
        : source === 3 ? { source, id: 13, x: 0, y: 1 } : { source, width: 390, height: 900 },
    }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(true);
  });
  it.each([5, 7, 9, 10, 11, 12, 14])('drops unsupported-but-discardable source %i', async source => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source, canary: 'discard-me' } }));
    const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(new TextDecoder().decode(result.value.bytes)).not.toContain('discard-me');
  });
  it.each([8, 13, 15, 16])('rejects CSSOM/custom element source %i', async source => {
    const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source } }));
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(false);
  });
  it.each([[20000, true], [20001, false]])('bounds node state at %i', async (count, accepted) => {
    const e = changeRecords(r => {
      const root = r.find(x => x.type === 2).data.node;
      // Document, doctype, 9 elements and 4 text nodes: 15 serialized nodes.
      for (let i = 15; i < count; i++) root.childNodes[1].childNodes[1].childNodes.push({
        type: 2, id: 100 + i, tagName: 'div', attributes: {}, childNodes: [],
      });
    });
    expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
  });
});

it.each([[256, true], [257, false]])('bounds one class token at %i', async (length, accepted) => {
  const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0,
    texts: [], removes: [], adds: [], attributes: [{ id: 10, attributes: { class: 'a'.repeat(length) } }] } }));
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it.each([[80, true], [81, false]])('bounds JSON depth at %i', async (depth, accepted) => {
  const e = input(); const meta = e[1].find(i => i[0].type === 'replay_event')![1] as any;
  let value: any = 'leaf'; for (let i = 1; i < depth; i++) value = { child: value };
  meta.extra = value;
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it.each([[200000, true], [200001, false]])('bounds JSON values at %i', async (count, accepted) => {
  const e = input(); const meta = e[1].find(i => i[0].type === 'replay_event')![1] as any;
  const size = (v: any): number => 1 + (v && typeof v === 'object' ? Object.values(v).reduce<number>((n, x) => n + size(x), 0) : 0);
  meta.extra = [];
  meta.extra = Array(count - size(meta)).fill(0);
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it.each([[300000, true], [300001, false]])('bounds event lifetime at %i ms', async (elapsed, accepted) => {
  const e = changeRecords(r => r.push({ type: 0, timestamp: (captured[0].items.find(i => i.header.type === 'replay_event')!.payload as any).replay_start_timestamp * 1000 + elapsed, data: {} }));
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it.each([false, true])('bounds raw and decompressed recording at exactly 8 MiB and +1, compressed=%s', async compressed => {
  const limit = 8 * 1024 * 1024;
  for (const extra of [0, 1]) {
    const e = changeRecords(r => r.push({ type: 5, timestamp: 0, data: { padding: '' } }));
    const item = e[1].find(i => i[0].type === 'replay_recording')!;
    const raw = new TextDecoder().decode(item[1] as Uint8Array); const split = raw.indexOf('\n');
    const records = JSON.parse(raw.slice(split + 1));
    const target = limit + extra - (compressed ? 0 : split + 1);
    records.at(-1).data.padding = 'x'.repeat(target - Buffer.byteLength(JSON.stringify(records)));
    const body = Buffer.from(JSON.stringify(records)); expect(body.byteLength).toBe(target);
    item[1] = new Uint8Array(Buffer.concat([Buffer.from(raw.slice(0, split + 1)), compressed ? deflateSync(body) : body]));
    const result = await projectEnvelope(e, emptyProjectionState());
    expect(result.ok).toBe(extra === 0);
    if (extra) expect(result).toEqual({ ok: false, reason: 'budget' });
  }
});
it('bounds the final serialized output at exactly 8 MiB and +1', async () => {
  const build = (padding: number) => changeRecords(r => {
    for (let i = r.length - 1; i >= 0; i--) if (r[i].type === 5) r.splice(i, 1);
    for (let i = 0; i < 1980; i++) r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0,
      texts: [{ id: 12, value: 'a'.repeat(4096) }], attributes: [], removes: [], adds: [] } });
    while (padding > 0) { const size = Math.min(padding, 4096); padding -= size;
      // Many bounded text mutations fill the output without increasing the node count.
      r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0,
        texts: [{ id: 12, value: 'a'.repeat(size) }], attributes: [], removes: [], adds: [] } });
    }
  });
  // Start below the limit; fill the last existing text with exact output bytes.
  const base = build(0); const first = await projectEnvelope(base, emptyProjectionState());
  expect(first.ok).toBe(true); if (!first.ok) throw new Error(first.reason);
  const remaining = 8 * 1024 * 1024 - first.value.bytes.length;
  expect(remaining).toBeGreaterThan(0);
  // Added events have deterministic JSON punctuation. Determine the last text size by one probe.
  const almost = build(remaining - Math.ceil(remaining / 4096) * 180);
  const probe = await projectEnvelope(almost, emptyProjectionState());
  expect(probe.ok).toBe(true); if (!probe.ok) throw new Error(probe.reason);
  const item = almost[1].find(i => i[0].type === 'replay_recording')!;
  const raw = new TextDecoder().decode(item[1] as Uint8Array); const split = raw.indexOf('\n'); const records = JSON.parse(raw.slice(split + 1));
  const deficit = 8 * 1024 * 1024 - probe.value.bytes.length;
  const text = records.at(-1).data.texts[0]; text.value += 'a'.repeat(deficit);
  expect(text.value.length).toBeLessThanOrEqual(4096);
  for (const extra of [0, 1]) {
    item[1] = new TextEncoder().encode(raw.slice(0, split + 1) + JSON.stringify(records));
    const result = await projectEnvelope(almost, emptyProjectionState()); expect(result.ok).toBe(extra === 0);
    if (result.ok) expect(result.value.bytes.length).toBe(8 * 1024 * 1024);
    else expect(result.reason).toBe('budget');
    text.value += 'a';
  }
// Four near-8-MiB projections validate size, not runtime. Worker deadlines have separate tests.
}, 15000);
it.each([['rr_width', '16384px', true], ['rr_width', '16385px', false], ['rr_height', '1.5px', false],
  ['rr_scrollTop', '65536', true], ['rr_scrollTop', '65537', false], ['rr_scrollLeft', -65536, true],
  ['_cssText', fixture.rawCss, true], ['_cssText', 'canary{background:url(https://canary.invalid)}', false]])('validates special %s=%s', async (key, value, accepted) => {
  const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0,
    texts: [], removes: [], adds: [], attributes: [{ id: 10, attributes: { [key as string]: value } }] } }));
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it('rejects a second full snapshot even with the next valid segment ID', async () => {
  const first = await projectEnvelope(input(), emptyProjectionState()); if (!first.ok) throw new Error(first.reason);
  const e = input(1); const raw = captured[0].items.find(i => i.header.type === 'replay_recording')!.payload as any;
  e[1].find(i => i[0].type === 'replay_recording')![1] = '{"segment_id":1}\n' + JSON.stringify(raw.records);
  expect((await projectEnvelope(e, first.value.next)).ok).toBe(false);
});
it.each(['unknown-field', 'bad-click-type', 'missing-target', 'static-css-canary', 'shadow-root'])('rejects %s without partial state commit', async kind => {
  const e = changeRecords(r => {
    if (kind === 'unknown-field') r.find(x => x.type === 4).data.extra = 'canary';
    else if (kind === 'bad-click-type' || kind === 'missing-target') r.push({ type: 3, timestamp: r[0].timestamp,
      data: { source: 2, type: kind === 'bad-click-type' ? 10 : 2, id: kind === 'missing-target' ? 999999 : 13, x: 0, y: 0 } });
    else {
      const walk = (n: any) => { if (n.isStyle && kind === 'static-css-canary') n.textContent += '/*canary*/';
        if (n.id === 10 && kind === 'shadow-root') n.isShadow = true; n.childNodes?.forEach(walk); };
      walk(r.find(x => x.type === 2).data.node);
    }
  });
  const state = emptyProjectionState(); expect((await projectEnvelope(e, state)).ok).toBe(false); expect(state.nodes.size).toBe(0);
});
it.each([[0, true], [1, true], [2, true], [3, false], [0.5, false]])('validates trusted pointerType=%s', async (pointerType, accepted) => {
  const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp,
    data: { source: 2, type: 2, id: 13, x: 5, y: 6, pointerType } }));
  expect((await projectEnvelope(e, emptyProjectionState())).ok).toBe(accepted);
});
it.each([5, 6])('accepts actual focus/blur type %s without inventing coordinates', async type => {
  const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 2, type, id: 13 } }));
  const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  const decoded = parseBrowserEnvelope(Buffer.from(result.value.bytes));
  expect(decoded.items.find((i: any) => i.header.type === 'replay_recording').payload.records.at(-1).data).toEqual({ source: 2, type, id: 13 });
});
it.each([[19997, true], [19998, false]])('counts node records plus three tombstone records at the 20000 boundary: %s', async (count, accepted) => {
  const e = changeRecords(r => {
    const root = r.find(x => x.type === 2).data.node;
    for (let i = 15; i < count; i++) root.childNodes[1].childNodes[1].childNodes.push({ type: 2, id: 100 + i, tagName: 'div', attributes: {}, childNodes: [] });
    r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0, texts: [], attributes: [], adds: [], removes: [{ id: 10, parentId: 9 }] } });
  });
  const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(accepted);
  if (result.ok) { expect(result.value.next.nodes.size).toBe(count); expect(result.value.next.tombstones.size).toBe(3); }
  else expect(result.reason).toBe('budget');
});
it('strips non-allowlisted class canary while preserving the fixed card token', async () => {
  const e = changeRecords(r => r.push({ type: 3, timestamp: r[0].timestamp, data: { source: 0,
    texts: [], removes: [], adds: [], attributes: [{ id: 10, attributes: { class: 'card canary-account-42' } }] } }));
  const result = await projectEnvelope(e, emptyProjectionState()); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.value.next.nodes.get(10)?.attrs.class).toBe('card');
  expect(new TextDecoder().decode(result.value.bytes)).not.toContain('canary');
});
