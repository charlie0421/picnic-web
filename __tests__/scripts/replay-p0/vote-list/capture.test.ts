// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Envelope } from '@sentry/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { parseBrowserEnvelope } from '../../../../scripts/envelope-test/browser-analyze';
import { emptyProjectionState, type ProjectionState } from '../../../../scripts/replay-p0/contract';
import { createVoteListContract, type VoteListManifest } from '../../../../scripts/replay-p0/contracts/vote-list';
import manifestJson from '../../../../scripts/replay-p0/contracts/vote-list.css-manifest.json';
import { projectWithContract } from '../../../../scripts/replay-p0/engine/envelope';
import { outputText } from './helpers';

const manifest = manifestJson as VoteListManifest;
const dir = join(__dirname, '../../../../scripts/replay-p0/fixtures/vote-list');
const contract = () => createVoteListContract({ manifest, origin: manifest.generatedFrom.origin, bannerCount: 5 });
type Records = any[];
function load(width: number, segment: number, compressed: boolean, edit?: (r: Records) => void): Envelope {
  const e = parseBrowserEnvelope(readFileSync(join(dir, `wire-${width}-${segment + 1}.bin`)));
  return [e.header, e.items.map((i: any) => {
    if (i.header.type !== 'replay_recording') return [i.header, i.payload];
    const records = structuredClone(i.payload.records); edit?.(records);
    const data = Buffer.from(JSON.stringify(records));
    return [{ type: 'replay_recording' }, new Uint8Array(Buffer.concat([
      Buffer.from(JSON.stringify(i.payload.segment) + '\n'), compressed ? deflateSync(data) : data]))];
  })] as Envelope;
}
async function runAll(width: number, compressed: boolean, edit?: { segment: number; fn: (r: Records) => void }) {
  let state: ProjectionState = emptyProjectionState(); const outputs: Uint8Array[] = []; const c = contract();
  for (let s = 0; s < 3; s++) {
    const r = await projectWithContract(load(width, s, compressed, edit?.segment === s ? edit.fn : undefined), state, c);
    if (!r.ok) return { reason: r.reason, segment: s, outputs };
    state = r.value.next; outputs.push(r.value.bytes);
  }
  return { reason: 'ok', segment: 3, outputs };
}
const FORBIDDEN = ['127.0.0.1', '/_next/image', 'http', 'aria-label', '다음 배너', 'Synthetic', '__next-route-announcer__', 'googlesyndication',
  'url(', '/_next/static/media', '.woff2'];
function walkNodes(records: Records, fn: (n: any) => void) {
  JSON.stringify(records, (k, v) => { if (v && typeof v === 'object' && v.type === 2 && 'tagName' in v) fn(v); return v; });
}

describe('vote-list capture', () => {
  it.each([[1280, false], [1280, true], [390, false], [390, true]])('projects segments 0→1→2 for %i px, compressed=%s', async (width, compressed) => {
    const result = await runAll(width, compressed);
    expect(result).toMatchObject({ reason: 'ok', segment: 3 });
    for (const bytes of result.outputs) {
      // The only URL the contract emits is the fixed display URL; remove it before searching for others.
      const text = outputText(bytes).replaceAll('https://replay.invalid/ko/vote', '');
      for (const word of FORBIDDEN) expect(text.includes(word), word).toBe(false);
    }
  });
  it('keeps banner indexes observed in the capture', async () => {
    for (const [width, expected] of [[1280, ['2', '0']], [390, ['1', '2', '3', '4']]] as const) {
      const { outputs } = await runAll(width, false);
      const text = outputs.map(b => outputText(b)).join('');
      const seen = [...text.matchAll(/--banner-current-index: (\d)/g)].map(m => m[1]);
      for (const v of expected) expect(seen).toContain(v);
    }
  });
});

const firstImg = (r: Records) => { let img: any; walkNodes(r, n => { if (!img && n.tagName === 'img') img = n; }); return img; };
const firstSvg = (r: Records) => { let svg: any; walkNodes(r, n => { if (!svg && n.tagName === 'svg') svg = n; }); return svg; };
const firstDiv = (r: Records) => { let div: any; walkNodes(r, n => { if (!div && n.tagName === 'div' && !n.isShadow) div = n; }); return div; };
const snapshotOf = (r: Records) => r.find(x => x.type === 2);
const fontLink = (r: Records) => {
  let link: any;
  JSON.stringify(snapshotOf(r), (k, v) => {
    if (!link && v && v.attributes && typeof v.attributes._cssText === 'string' && v.attributes._cssText.includes('@font-face')) link = v;
    return v;
  });
  return link;
};
const incrementalAt = (r: Records) => r.find(x => x.type === 3)?.timestamp ?? r.at(-1).timestamp;
const TAMPER: [string, number, (r: Records) => void, string][] = [
  ['img src in snapshot', 0, r => { firstImg(snapshotOf(r)).attributes.src = '/x.png'; }, 'schema'],
  ['svg child', 0, r => { firstSvg(snapshotOf(r)).childNodes.push({ type: 2, tagName: 'path', attributes: {}, childNodes: [], id: 999999 }); }, 'schema'],
  ['banner index out of range', 1, r => {
    const m = r.find(x => x.type === 3 && x.data.source === 0 && x.data.attributes.some((a: any) => String(a.attributes.style).includes('banner')));
    m.data.attributes.find((a: any) => String(a.attributes.style).includes('banner')).attributes.style = '--banner-current-index: 9;';
  }, 'schema'],
  ['CSS changed by one byte', 0, r => {
    let done = false;
    JSON.stringify(snapshotOf(r), (k, v) => { if (!done && v && v.attributes && typeof v.attributes._cssText === 'string') { v.attributes._cssText += ' '; done = true; } return v; });
  }, 'schema'],
  ['second shadow host', 0, r => {
    const body = snapshotOf(r).data.node.childNodes[1].childNodes[1];
    body.childNodes.push({ type: 2, tagName: 'next-route-announcer', attributes: {}, isShadowHost: true, childNodes: [
      { type: 2, tagName: 'div', attributes: {}, isShadow: true, childNodes: [], id: 999998 }], id: 999997 });
  }, 'schema'],
  ['unapproved style property', 0, r => { firstDiv(snapshotOf(r)).attributes.style = 'color: red;'; }, 'schema'],
  ['source 8 inserted', 1, r => { r.push({ type: 3, timestamp: incrementalAt(r), data: { source: 8, id: 7, adds: [], removes: [] } }); }, 'schema'],
  ['img src added by mutation', 2, r => {
    const add = r.find(x => x.type === 3 && x.data.source === 0 && x.data.adds.some((a: any) => a.node.tagName === 'img'));
    const img = add.data.adds.find((a: any) => a.node.tagName === 'img').node;
    add.data.attributes.push({ id: img.id, attributes: { src: '/x.png' } });
  }, 'schema'],
  ['font CSS from another origin', 0, r => {
    const l = fontLink(r); l.attributes._cssText = l.attributes._cssText.split('http://127.0.0.1:53931/').join('https://evil.example/');
  }, 'schema'],
  ['font face with a URL added', 0, r => {
    fontLink(r).attributes._cssText += '@font-face { font-family: X; src: url("http://127.0.0.1:53931/_next/static/media/ffffffffffffffff-s.woff2") format("woff2"); }';
  }, 'schema'],
  ['font CSS changed by one byte', 0, r => { fontLink(r).attributes._cssText += ' '; }, 'schema'],
];

describe('vote-list capture counterexamples', () => {
  it.each(TAMPER)('%s → closes', async (_name, segment, fn, expected) => {
    for (const width of [1280, 390]) {
      const result = await runAll(width, false, { segment, fn });
      expect(result.reason).toBe(expected); expect(result.segment).toBe(segment);
    }
  });
  it('src added in segment 1 to an existing snapshot img → closes', async () => {
    for (const width of [1280, 390]) {
      let id = 0;
      load(width, 0, false, r => { id = firstImg(snapshotOf(r)).id; });
      const valid = await runAll(width, false, { segment: 1, fn: r => {
        r.push({ type: 3, timestamp: incrementalAt(r), data: { source: 0, adds: [], removes: [], texts: [], attributes: [{ id, attributes: { class: 'object-cover' } }] } });
      } });
      expect(valid.reason).toBe('ok');
      const result = await runAll(width, false, { segment: 1, fn: r => {
        r.push({ type: 3, timestamp: incrementalAt(r), data: { source: 0, adds: [], removes: [], texts: [], attributes: [{ id, attributes: { src: '/x.png' } }] } });
      } });
      expect(result).toMatchObject({ reason: 'schema', segment: 1 });
    }
  });
  it('segment gap → sequence', async () => {
    const c = contract(); let state = emptyProjectionState();
    const first = await projectWithContract(load(1280, 0, false), state, c); if (!first.ok) throw new Error(first.reason);
    state = first.value.next;
    const skipped = await projectWithContract(load(1280, 2, false), state, c);
    expect(skipped).toEqual({ ok: false, reason: 'sequence' });
  });
});
