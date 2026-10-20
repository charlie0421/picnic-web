// __tests__/scripts/replay-p0/vote-list/contract.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyProjectionState } from '../../../../scripts/replay-p0/contract';
import { createVoteListContract, type VoteListManifest } from '../../../../scripts/replay-p0/contracts/vote-list';
import { projectWithContract } from '../../../../scripts/replay-p0/engine/envelope';
import { el, envelope, findNode, FONT_KEEP, fontWire, MANIFEST, mutation, ORIGIN, outputRecords, outputText, page, T, txt, type RawNode } from './helpers';

const contract = (bannerCount = 5) => createVoteListContract({ manifest: MANIFEST, origin: ORIGIN, bannerCount });
const run = (records: unknown[], compressed = false, c = contract()) => projectWithContract(envelope(records, 0, compressed), emptyProjectionState(), c);
const body = (...nodes: RawNode[]) => page([], nodes);
async function ok(records: unknown[], compressed = false) {
  const result = await run(records, compressed); if (!result.ok) throw new Error(result.reason); return result.value.bytes;
}
async function reason(records: unknown[]) { const r = await run(records); return r.ok ? 'ok' : r.reason; }
const MARK = 'PIIMARK-7f3a';

describe('vote-list contract: construction', () => {
  const make = (manifest: VoteListManifest, origin = ORIGIN) => () => createVoteListContract({ manifest, origin, bannerCount: 5 });
  it('rejects a manifest that is not version 2', () => {
    expect(make({ ...MANIFEST, version: 1 } as unknown as VoteListManifest)).toThrow();
  });
  it.each(['', 'https://www.picnic.fan/', 'https://www.picnic.fan/ko', 'HTTPS://WWW.PICNIC.FAN', 'ftp://x', 'http://x:123456', 'https://user@x'])(
    'rejects origin %j', origin => { expect(make(MANIFEST, origin)).toThrow(); });
  it.each(['https://www.picnic.fan', 'http://127.0.0.1:53931'])('accepts origin %s', origin => {
    expect(make(MANIFEST, origin)).not.toThrow();
  });
  it('rejects one accept text in two entries of a list', () => {
    expect(make({ ...MANIFEST, linkCss: [MANIFEST.linkCss[0], { ...MANIFEST.linkCss[0], asset: '/copy.css' }] })).toThrow();
  });
  it('rejects bannerCount outside 0…100', () => {
    expect(() => contract(101)).toThrow(); expect(() => contract(-1)).toThrow();
  });
});

describe('vote-list contract: head', () => {
  it('keeps charset and the viewport constant and empties other metadata', async () => {
    const charset = el('meta', { charset: 'utf-8' }); const viewport = el('meta', { name: 'viewport', content: MANIFEST.viewport });
    const other = el('meta', { name: 'description', content: MARK }); const title = el('title', {}, [txt(MARK)]);
    const alt = el('link', { rel: 'alternate', href: `https://x/${MARK}`, hreflang: 'en' });
    const bytes = await ok(page([charset, viewport, other, title, alt], []));
    const recs = outputRecords(bytes);
    expect(findNode(recs, charset.id as number).attributes).toEqual({ charset: 'utf-8' });
    expect(findNode(recs, viewport.id as number).attributes).toEqual({ name: 'viewport', content: MANIFEST.viewport });
    expect(findNode(recs, other.id as number).attributes).toEqual({});
    expect(findNode(recs, alt.id as number).attributes).toEqual({});
    expect(findNode(recs, title.id as number).childNodes[0].textContent).toBe('');
    expect(outputText(bytes)).not.toContain(MARK);
  });
  it('rejects a non-constant charset or viewport', async () => {
    expect(await reason(page([el('meta', { charset: 'latin1' })], []))).toBe('schema');
    expect(await reason(page([el('meta', { name: 'viewport', content: 'width=1' })], []))).toBe('schema');
  });
  it('keeps manifest link CSS only', async () => {
    const link = el('link', { rel: null, href: null, crossorigin: null, 'data-precedence': 'next', _cssText: '.a { color: red; }' });
    expect(findNode(outputRecords(await ok(page([link], []))), link.id as number).attributes).toEqual({ _cssText: '.a { color: red; }' });
    expect(await reason(page([el('link', { _cssText: '.a { color: blue; }' })], []))).toBe('schema');
  });
  it('rejects a stylesheet link without inlined CSS', async () => {
    expect(await reason(page([el('link', { rel: 'stylesheet', href: '/x.css' })], []))).toBe('schema');
    expect(await reason(page([el('link', { 'data-precedence': 'next', href: '/x.css' })], []))).toBe('schema');
  });
  it('accepts 0px link placeholders and rejects other placeholder shapes', async () => {
    await ok(page([el('link', { rr_width: '0px', rr_height: '0px' })], []));
    expect(await reason(page([el('link', { rr_width: '1px', rr_height: '0px' })], []))).toBe('schema');
    expect(await reason(page([el('link', { rr_width: '0px', rr_height: '0px', href: '/i.png' })], []))).toBe('schema');
  });
  it('keeps manifest style text and type only', async () => {
    const style = el('style', { type: 'text/css', 'data-styled-jsx': '' }, [{ type: 3, textContent: '.jsx-1.b { display: block; }', isStyle: true, id: 9001 }]);
    const recs = outputRecords(await ok(page([style], [])));
    expect(findNode(recs, style.id as number).attributes).toEqual({ type: 'text/css' });
    const bad = el('style', { type: 'text/css' }, [{ type: 3, textContent: '.x{}', isStyle: true, id: 9002 }]);
    expect(await reason(page([bad], []))).toBe('schema');
  });
  it('rejects a style text mutation outside the manifest', async () => {
    const style = el('style', { type: 'text/css' }, [{ type: 3, textContent: '.jsx-1.b { display: block; }', isStyle: true, id: 9003 }]);
    expect(await reason([...page([style], []), mutation({ texts: [{ id: 9003, value: '.evil{}' }] })])).toBe('schema');
  });
  it('empties title text mutations', async () => {
    const title = el('title', {}, [{ type: 3, textContent: 'x', id: 9004 }]);
    const bytes = await ok([...page([title], []), mutation({ texts: [{ id: 9004, value: MARK }] })]);
    expect(outputText(bytes)).not.toContain(MARK);
  });
  it('emits the manifest output for font CSS, without font URLs', async () => {
    const link = el('link', { rel: null, href: null, 'data-precedence': 'next', _cssText: fontWire() });
    const bytes = await ok(page([link], []));
    expect(findNode(outputRecords(bytes), link.id as number).attributes).toEqual({ _cssText: FONT_KEEP });
    for (const word of ['url(', '127.0.0.1', '.woff2']) expect(outputText(bytes)).not.toContain(word);
  });
  it('maps two links with the same font CSS to the same output', async () => {
    const a = el('link', { _cssText: fontWire() }); const b = el('link', { _cssText: fontWire() });
    const recs = outputRecords(await ok(page([a, b], [])));
    expect(findNode(recs, a.id as number).attributes._cssText).toBe(FONT_KEEP);
    expect(findNode(recs, b.id as number).attributes._cssText).toBe(FONT_KEEP);
  });
  it.each([
    ['another origin', fontWire('https://evil.example')],
    ['a single-quoted URL', fontWire().replace(/url\("([^"]*)"\)/, "url('$1')")],
    ['an unquoted URL', fontWire().replace(/url\("([^"]*)"\)/, 'url($1)')],
    ['an extra font face', `${fontWire()}@font-face { font-family: X; src: url("${ORIGIN}/_next/static/media/ffffffffffffffff-s.woff2") format("woff2"); }`],
  ])('rejects font CSS with %s', async (_name, cssText) => {
    expect(await reason(page([el('link', { _cssText: cssText })], []))).toBe('schema');
  });
  it('emits the manifest output for style text, not the received text', async () => {
    const changed = { ...MANIFEST, styleText: [{ ...MANIFEST.styleText[0], output: { sha256: '0', text: '.jsx-1.b { display: none; }' } }] };
    const c = createVoteListContract({ manifest: changed, origin: ORIGIN, bannerCount: 5 });
    const style = el('style', { type: 'text/css' }, [{ type: 3, textContent: '.jsx-1.b { display: block; }', isStyle: true, id: 9005 }]);
    const r = await run(page([style], []), false, c); if (!r.ok) throw new Error(r.reason);
    expect(findNode(outputRecords(r.value.bytes), 9005).textContent).toBe('.jsx-1.b { display: none; }');
  });
});

describe('vote-list contract: body attributes and text', () => {
  it.each([false, true])('drops free strings, compression=%s', async compressed => {
    const a = el('a', { href: `https://x/${MARK}`, class: 'a', style: 'user-select: none;', 'aria-label': MARK, id: MARK }, [txt(`${MARK} name`)]);
    const bytes = await ok(body(a), compressed);
    expect(outputText(bytes)).not.toContain(MARK);
    expect(findNode(outputRecords(bytes), a.id as number).attributes).toEqual({ class: 'a', style: 'user-select: none;' });
  });
  it('masks text with asterisks', async () => {
    const t = txt('투표 1');
    expect(findNode(outputRecords(await ok(body(el('p', {}, [t])))), t.id as number).textContent).toBe('** *');
  });
  it('normalizes boolean and enumerated states', async () => {
    const b = el('button', { type: 'button', disabled: '', 'aria-pressed': 'true', 'aria-expanded': 'false', role: 'group' });
    expect(findNode(outputRecords(await ok(body(b))), b.id as number).attributes)
      .toEqual({ type: 'button', disabled: '', 'aria-pressed': 'true', 'aria-expanded': 'false', role: 'group' });
    expect(await reason(body(el('button', { 'aria-pressed': 'mixed' })))).toBe('schema');
    expect(await reason(body(el('div', { role: 'dialog' })))).toBe('schema');
    expect(await reason(body(el('button', { type: 'submit' })))).toBe('schema');
  });
  it('keeps only exact manifest class tokens', async () => {
    const d = el('div', { class: 'a\n  b banner-track\u200b Banner-Track jsx-1 unknown' });
    expect(findNode(outputRecords(await ok(body(d))), d.id as number).attributes.class).toBe('a b jsx-1');
  });
  it('rejects unknown tags and extra node fields', async () => {
    expect(await reason(body(el('iframe')))).toBe('schema');
    expect(await reason(body(el('div', {}, [], { rootId: 1 })))).toBe('schema');
    expect(await reason(body(el('div', {}, [], { isSVG: true })))).toBe('schema');
  });
});

describe('vote-list contract: inline style', () => {
  const styled = (style: string) => body(el('div', { style }));
  it.each([
    ['width: 298.5px;', 'width: 298.5px;'],
    ['height: 199.359375px;', 'height: 199.359px;'],
    ['top: 52px; left: 1042px;', 'top: 52px; left: 1042px;'],
    ['background-color: rgb(131, 251, 200);', 'background-color: rgb(131, 251, 200);'],
    ['aspect-ratio: 700 / 356;', 'aspect-ratio: 700 / 356;'],
    ['--banner-current-index: 4;', '--banner-current-index: 4;'],
    ['transform: rotate(180deg); opacity: 0.5;', 'transform: rotate(180deg); opacity: 0.5;'],
    ['width: 0;', 'width: 0;'],
  ])('accepts %s', async (input, expected) => {
    const recs = outputRecords(await ok(styled(input)));
    expect(JSON.stringify(recs)).toContain(JSON.stringify(expected).slice(1, -1));
  });
  it.each([
    'width: 16385px;', 'width: -1px;', 'width: 1e3px;', 'width: 10em;', 'width: 1.1234567px;',
    'background-color: rgb(1, 2, 3);', 'aspect-ratio: 16 / 9;', '--banner-current-index: 5;', '--banner-current-index: 1.0;',
    'transform: translate3d(0,0,0);', 'clip: rect(0px, 0px, 0px, 0px);', 'color: red;', 'width: 1px; width: 2px;',
    'background: url(x);', 'width: 1\\70 x;',
  ])('rejects %s', async input => { expect(await reason(styled(input))).toBe('schema'); });
  it('uses bannerCount for the index bound', async () => {
    const r = await projectWithContract(envelope(styled('--banner-current-index: 0;')), emptyProjectionState(), contract(0));
    expect(r.ok).toBe(true);
    const r2 = await projectWithContract(envelope(styled('--banner-current-index: 1;')), emptyProjectionState(), contract(1));
    expect(r2.ok).toBe(false);
  });
  it('rejects announcer-only properties in a style diff of a normal node', async () => {
    const d = el('div', { style: 'width: 1px;' });
    expect(await reason([...body(d), mutation({ attributes: [{ id: d.id, attributes: { style: { clip: 'rect(0 0 0 0)' } } }] })])).toBe('schema');
  });
  it('applies typed style diffs', async () => {
    const d = el('div', { style: '--banner-current-index: 0;' });
    const recs = outputRecords(await ok([...body(d), mutation({ attributes: [{ id: d.id, attributes: { style: { '--banner-current-index': '2' } } }] })]));
    expect(recs.at(-1).data.attributes[0].attributes.style).toBe('--banner-current-index: 2;');
  });
});

describe('vote-list contract: media placeholders', () => {
  it('normalizes browser subpixel dimensions in snapshots and mutations', async () => {
    // Captured from Chromium's blocked image during the first diagnostic segment.
    const img = el('img', { rr_width: '110px', rr_height: '110.00006103515625px' });
    const recs = outputRecords(await ok([...body(img), mutation({ attributes: [
      { id: img.id, attributes: { rr_width: '109.99993896484375px' } },
    ] })]));
    expect(findNode(recs, img.id as number).attributes.rr_height).toBe('110px');
    expect(recs.at(-1).data.attributes[0].attributes.rr_width).toBe('110px');
  });
  it('accepts twenty fractional digits for blocked img and svg dimensions', async () => {
    const img = el('img', { rr_width: '1.12345678901234567890px', rr_height: '16384.00000000000000000000px' });
    const svg = el('svg', { rr_width: '16px', rr_height: '109.99993896484375px' }, [], { isSVG: true });
    const recs = outputRecords(await ok(body(img, svg)));
    expect(findNode(recs, img.id as number).attributes).toMatchObject({ rr_width: '1.123px', rr_height: '16384px' });
    expect(findNode(recs, svg.id as number).attributes.rr_height).toBe('110px');
  });
  it.each(['16384.000000000001px', '16384.00000000000000000001px'])(
    'rejects a fractional excess above the maximum before floating-point rounding: %s', async value => {
      expect(await reason(body(el('img', { rr_width: value, rr_height: '1px' })))).toBe('schema');
    });
  it.each(['-1px', '16384.0001px', '16385px', 'Infinitypx', 'NaNpx', '1e2px',
    '1.123456789012345678901px', '1px;color:red', ' 1px', '01px'])(
    'rejects invalid or out-of-range media dimensions %j', async value => {
      expect(await reason(body(el('img', { rr_width: value, rr_height: '1px' })))).toBe('schema');
    });
  it('keeps the tighter inline style precision rule', async () => {
    expect(await reason(body(el('div', { style: 'height: 110.00006103515625px;' })))).toBe('schema');
  });
  it('keeps img and svg placeholders with normalized size', async () => {
    const img = el('img', { class: 'a', rr_width: '398px', rr_height: '298.5px' });
    const svg = el('svg', { class: 'b', rr_width: '16px', rr_height: '199.359375px' }, [], { isSVG: true });
    const recs = outputRecords(await ok(body(img, svg)));
    expect(findNode(recs, img.id as number).attributes).toEqual({ class: 'a', rr_width: '398px', rr_height: '298.5px' });
    expect(findNode(recs, svg.id as number)).toMatchObject({ isSVG: true, attributes: { rr_height: '199.359px' } });
  });
  it.each([
    ['src', el('img', { rr_width: '1px', rr_height: '1px', src: '/a.png' })],
    ['rr_src', el('img', { rr_width: '1px', rr_height: '1px', rr_src: '/a.png' })],
    ['alt', el('img', { rr_width: '1px', rr_height: '1px', alt: 'x' })],
    ['missing size', el('img', { class: 'a' })],
    ['child', el('svg', { rr_width: '1px', rr_height: '1px' }, [el('path')], { isSVG: true })],
    ['svg without isSVG', el('svg', { rr_width: '1px', rr_height: '1px' })],
  ])('rejects %s', async (_name, node) => { expect(await reason(body(node))).toBe('schema'); });
  it('rejects adding a child or src to a placeholder later', async () => {
    const img = el('img', { rr_width: '1px', rr_height: '1px' });
    expect(await reason([...body(img), mutation({ adds: [{ parentId: img.id, nextId: null, node: txt('x') }] })])).toBe('schema');
    expect(await reason([...body(img), mutation({ attributes: [{ id: img.id, attributes: { src: '/a.png' } }] })])).toBe('schema');
  });
});

describe('vote-list contract: announcer shadow', () => {
  const announcer = (style = MANIFEST.announcerStyle) => el('next-route-announcer', { style: 'position: absolute;' },
    [el('div', { 'aria-live': 'assertive', id: '__next-route-announcer__', role: 'alert', style }, [], { isShadow: true })], { isShadowHost: true });
  it('keeps the announcer host and shadow root', async () => {
    const host = announcer(); const root = (host.childNodes as RawNode[])[0];
    const recs = outputRecords(await ok(body(host)));
    expect(findNode(recs, host.id as number)).toMatchObject({ isShadowHost: true, attributes: { style: 'position: absolute;' } });
    expect(findNode(recs, root.id as number)).toMatchObject({ isShadow: true, attributes: { role: 'alert', style: MANIFEST.announcerStyle } });
    expect(JSON.stringify(recs)).not.toContain('__next-route-announcer__');
  });
  it('rejects a changed announcer style and misplaced shadow marks', async () => {
    expect(await reason(body(announcer('position: absolute;')))).toBe('schema');
    expect(await reason(body(el('div', {}, [], { isShadowHost: true })))).toBe('schema');
    expect(await reason(body(el('div', {}, [el('div', {}, [], { isShadow: true })])))).toBe('schema');
    expect(await reason(body(el('next-route-announcer', {}, [])))).toBe('schema');
  });
  it('rejects an announcer root without the constant style or role', async () => {
    const root = (attributes: Record<string, unknown>) => el('next-route-announcer', { style: 'position: absolute;' },
      [el('div', attributes, [], { isShadow: true })], { isShadowHost: true });
    expect(await reason(body(root({})))).toBe('schema');
    expect(await reason(body(root({ role: 'alert' })))).toBe('schema');
    expect(await reason(body(root({ style: MANIFEST.announcerStyle })))).toBe('schema');
    expect(await reason([...body(), mutation({ adds: [{ parentId: 5, nextId: null, node: root({ role: 'alert' }) }] })])).toBe('schema');
  });
  it('rejects a second live host but allows reinsertion after removal', async () => {
    const host = announcer();
    expect(await reason([...body(host), mutation({ adds: [{ parentId: 5, nextId: null, node: announcer() }] })])).toBe('schema');
    const again = { ...structuredClone(host) };
    const records = [...body(host), mutation({ removes: [{ parentId: 5, id: host.id }] }, 10), mutation({ adds: [{ parentId: 5, nextId: null, node: again }] }, 20)];
    expect(await reason(records)).toBe('ok');
  });
});

describe('vote-list contract: rrweb events', () => {
  it('drops custom events and keeps the fixed meta URL', async () => {
    const bytes = await ok([...body(), { type: 5, timestamp: T + 5, data: { tag: 'breadcrumb', payload: { message: MARK } } }]);
    const recs = outputRecords(bytes);
    expect(recs.some(r => r.type === 5)).toBe(false);
    expect(recs[0].data.href).toBe('https://replay.invalid/ko/vote');
    expect(outputText(bytes)).not.toContain(MARK);
  });
  it.each([8, 13, 15, 16])('closes on incremental source %i', async source => {
    expect(await reason([...body(), { type: 3, timestamp: T + 5, data: { source } }])).toBe('schema');
  });
});
