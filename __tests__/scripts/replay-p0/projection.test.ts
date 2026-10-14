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
