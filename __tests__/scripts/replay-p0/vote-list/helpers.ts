// __tests__/scripts/replay-p0/vote-list/helpers.ts
import type { Envelope } from '@sentry/core';
import { deflateSync } from 'node:zlib';
import { parseBrowserEnvelope } from '../../../../scripts/envelope-test/browser-analyze';
import type { VoteListManifest } from '../../../../scripts/replay-p0/contracts/vote-list';

export const ID = 'a'.repeat(32);
export const START = 1_760_000_000;
export const T = START * 1000;
export type RawNode = Record<string, unknown>;
let nextId = 100;
export function el(tagName: string, attributes: Record<string, unknown> = {}, childNodes: RawNode[] = [], extra: RawNode = {}): RawNode {
  return { type: 2, tagName, attributes, childNodes, id: nextId++, ...extra };
}
export function txt(textContent: string): RawNode { return { type: 3, textContent, id: nextId++ }; }
export const ORIGIN = 'http://127.0.0.1:53931';
/** One CSS entry with a single Chromium input. The output defaults to the input. */
const css = (text: string, output = text) => ({ accept: [{ engine: 'chromium', sha256: '0', text }], output: { sha256: '0', text: output } });
export const FONT_FACE = '@font-face { font-family: Inter; src: url("/_next/static/media/0123456789abcdef-s.woff2") format("woff2"); }';
export const FONT_KEEP = '@font-face { font-family: "Inter Fallback"; src: local("Arial"); }.__className_1 { font-family: Inter, "Inter Fallback"; }';
/** Font CSS as rrweb records it: the font URL carries the stylesheet origin. */
export const fontWire = (origin = ORIGIN) => (FONT_FACE + FONT_KEEP).replace('url("/', `url("${origin}/`);
export const MANIFEST: VoteListManifest = {
  version: 2, generatedFrom: { buildId: 'test-build', origin: ORIGIN, commit: '0' },
  sdkVersion: '9.47.1', release: 'r', environment: 'e',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes',
  announcerStyle: 'position: absolute; border: 0px; height: 1px; margin: -1px; padding: 0px; width: 1px; clip: rect(0px, 0px, 0px, 0px); overflow: hidden; white-space: nowrap; overflow-wrap: normal;',
  linkCss: [
    { asset: '/a.css', sourceSha256: '0', ...css('.a { color: red; }') },
    { asset: '/font.css', sourceSha256: '0', ...css(FONT_FACE + FONT_KEEP, FONT_KEEP) },
  ],
  styleText: [css('.jsx-1.b { display: block; }')],
  classes: ['a', 'b', 'banner-track', 'jsx-1'], statusColors: ['rgb(131, 251, 200)'],
};
export function page(head: RawNode[], body: RawNode[]): unknown[] {
  return [
    { type: 4, timestamp: T, data: { href: 'http://127.0.0.1/ko/vote', width: 1280, height: 900 } },
    { type: 2, timestamp: T + 1, data: { initialOffset: { left: 0, top: 0 }, node: { type: 0, id: 1, childNodes: [
      { type: 1, id: 2, name: 'html', publicId: '', systemId: '' },
      { type: 2, id: 3, tagName: 'html', attributes: { lang: 'ko' }, childNodes: [
        { type: 2, id: 4, tagName: 'head', attributes: {}, childNodes: head },
        { type: 2, id: 5, tagName: 'body', attributes: {}, childNodes: body }] }] } } },
  ];
}
export function mutation(change: Partial<Record<'adds' | 'removes' | 'texts' | 'attributes', unknown[]>>, at = 10): unknown {
  return { type: 3, timestamp: T + at, data: { source: 0, adds: [], removes: [], texts: [], attributes: [], ...change } };
}
export function envelope(records: unknown[], segment = 0, compressed = false): Envelope {
  const body = Buffer.from(JSON.stringify(records));
  const payload = new Uint8Array(Buffer.concat([Buffer.from(JSON.stringify({ segment_id: segment }) + '\n'), compressed ? deflateSync(body) : body]));
  const event = { type: 'replay_event', replay_type: 'session', replay_id: ID, event_id: ID, segment_id: segment,
    timestamp: START + 1, replay_start_timestamp: START, sdk: { name: 'sentry.javascript.browser', version: '9.47.1' } };
  return [{ event_id: ID }, [[{ type: 'replay_event' }, event], [{ type: 'replay_recording' }, payload]]] as unknown as Envelope;
}
export function outputRecords(bytes: Uint8Array): any[] {
  const item = parseBrowserEnvelope(Buffer.from(bytes)).items.find((i: any) => i.header.type === 'replay_recording');
  return item.payload.records;
}
export function outputText(bytes: Uint8Array): string {
  return JSON.stringify(outputRecords(bytes)) + new TextDecoder().decode(bytes);
}
export function findNode(records: any[], id: number): any {
  let found: any;
  JSON.stringify(records, (k, v) => { if (v && typeof v === 'object' && v.id === id && 'type' in v) found = v; return v; });
  return found;
}
