// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildStyleSources, checkCss, normalizeCssOrigin as normalizeCjs, splitFontRules, summarizeManifest, traceStyledJsx } from '../../../../scripts/replay-p0/tools/build-css-manifest.cjs';
import { normalizeCssOrigin } from '../../../../scripts/replay-p0/contracts/vote-list';

describe('CSS manifest generator checks', () => {
  const wire = new Set(['.a { color: red; }']);
  it('accepts CSS whose build, live and wire forms agree', () => {
    expect(checkCss('.a { color: red; }', '.a { color: red; }', wire, 'x')).toBe('.a { color: red; }');
  });
  it('rejects a rule injected into the live CSSOM', () => {
    const injected = '.a { color: red; }:root { --private: "PIIMARK"; }';
    expect(() => checkCss('.a { color: red; }', injected, new Set([injected]), 'x')).toThrow(/build/);
  });
  it('rejects CSS missing from the wire capture', () => {
    expect(() => checkCss('.b { color: red; }', '.b { color: red; }', wire, 'x')).toThrow(/wire/);
  });
  // Shape of compiled styled-jsx in the Next build: {id, dynamic?, children}.
  const chunk = 'x={id:"85d98f",children:".s.jsx-85d98f{top:0}"};y={id:"abc123",dynamic:[1],children:".c.__jsx-style-dynamic-selector{--n:".concat(1,"}@media(min-width:768px){.c.__jsx-style-dynamic-selector{--n:2}}")};';
  const dynamic = (a: string, b = a) => `.c.${a}{--n:1}@media(min-width:768px){.c.${b}{--n:2}}`;
  const HASH = 'jsx-300526313';
  it('traces static text and dynamic text with the styled-jsx computed class', () => {
    const sources = buildStyleSources([chunk]);
    expect(traceStyledJsx('.s.jsx-85d98f{top:0}', sources)).toBe(true);
    expect(traceStyledJsx(dynamic(HASH), sources)).toBe(true);
  });
  it('rejects styled-jsx text that the build does not generate', () => {
    const sources = buildStyleSources([chunk]);
    expect(traceStyledJsx('.s.jsx-85d98f{top:0}:root{--p:"PIIMARK"}', sources)).toBe(false);
    expect(traceStyledJsx(dynamic(HASH).replace('--n:1', '--n:9'), sources)).toBe(false);
    expect(traceStyledJsx(dynamic('jsx-3947864466'), sources)).toBe(false);
    expect(traceStyledJsx(dynamic('jsx-01012345678010123456780'), sources)).toBe(false);
    expect(traceStyledJsx(dynamic('jsx-01012345678', HASH), sources)).toBe(false);
  });
});

const face = (src: string) => ({ kind: 'font-face', cssText: `@font-face { font-family: Inter; src: ${src}; }`, src });
const URL_OK = 'url("/_next/static/media/0123456789abcdef-s.woff2") format("woff2")';
describe('font rules', () => {
  it('removes font faces that load build font files and keeps the rest', () => {
    const rules = [face(URL_OK), face('local("Arial")'), { kind: 'other', cssText: '.__className_1 { font-family: Inter; }', src: '' }];
    const r = splitFontRules(rules, 'x');
    expect(r).toEqual({ accept: rules.map(x => x.cssText).join(''), output: rules[1].cssText + rules[2].cssText, removed: 1 });
  });
  it('removes one font face that lists several build font files', () => {
    const src = 'url("/_next/static/media/0123456789abcdef-s.p.woff2") format("woff2"), url("/_next/static/media/fedcba9876543210.woff2") format("woff2")';
    expect(splitFontRules([face(src)], 'x').removed).toBe(1);
  });
  it.each([
    ['another path', 'url("/images/0123456789abcdef-s.woff2") format("woff2")'],
    ['an external host', 'url("https://fonts.gstatic.com/s/inter/v1/x.woff2") format("woff2")'],
    ['a data URI', 'url("data:font/woff2;base64,AAAA") format("woff2")'],
    ['another format', 'url("/_next/static/media/0123456789abcdef-s.woff") format("woff")'],
    ['no format', 'url("/_next/static/media/0123456789abcdef-s.woff2")'],
    ['a short hash', 'url("/_next/static/media/0123-s.woff2") format("woff2")'],
    ['url and local together', `${URL_OK}, local("Arial")`],
    ['an allowed and a disallowed URL', `${URL_OK}, url("/images/x.woff2") format("woff2")`],
  ])('fails on a font face with %s', (_name, src) => {
    expect(() => splitFontRules([face(src)], 'x')).toThrow();
  });
  it('fails on url( outside @font-face and on @import', () => {
    expect(() => splitFontRules([{ kind: 'other', cssText: '.a { background: url("/x.png"); }', src: '' }], 'x')).toThrow(/resource/);
    expect(() => splitFontRules([{ kind: 'import', cssText: '@import url("/x.css");', src: '' }], 'x')).toThrow(/@import/);
  });
});

describe('origin normalization', () => {
  it('is the same function as the contract', () => {
    for (const [text, origin] of [
      ['@font-face { src: url("http://127.0.0.1:53931/_next/static/media/a.woff2") format("woff2"); }', 'http://127.0.0.1:53931'],
      ['a{b:url("https://www.picnic.fan/x")} c{d:url("https://www.picnic.fan/y")}', 'https://www.picnic.fan'],
      ['url("https://evil.example/x")', 'https://www.picnic.fan'],
      ['url(https://www.picnic.fan/x)', 'https://www.picnic.fan'],
    ] as const) expect(normalizeCjs(text, origin)).toBe(normalizeCssOrigin(text, origin));
  });
  it('rewrites only double-quoted URLs that start with the origin and a slash', () => {
    expect(normalizeCssOrigin('url("https://www.picnic.fan/x") url("https://www.picnic.fan.evil/x") url(https://www.picnic.fan/y)', 'https://www.picnic.fan'))
      .toBe('url("/x") url("https://www.picnic.fan.evil/x") url(https://www.picnic.fan/y)');
  });
});

describe('review summary', () => {
  const v1 = { version: 1, classes: ['a', '__className_old'], styleText: [{ sha256: 'j1', text: '' }],
    linkCss: [{ asset: '/a.css', sourceSha256: 's1', wireSha256: 'w1', wire: '' }, { asset: '/f.css', sourceSha256: 's2', wireSha256: 'w2', wire: '' }] };
  const one = (h: string, o = h) => ({ accept: [{ engine: 'chromium', sha256: h, text: '' }], output: { sha256: o, text: '' } });
  const v2 = { version: 2, classes: ['a', '__className_new'], styleText: [one('j1')],
    linkCss: [{ asset: '/a.css', sourceSha256: 's1', ...one('w1') }, { asset: '/g.css', sourceSha256: 's3', ...one('w3', 'o3') }] };
  it('reports asset, style and class changes from a v1 manifest', () => {
    const s = summarizeManifest(v1, v2);
    expect(s.links).toEqual([{ asset: '/a.css', status: 'same' }, { asset: '/f.css', status: 'removed' }, { asset: '/g.css', status: 'added' }]);
    expect(s.styles).toEqual({ added: [], removed: [] });
    expect(s.classes).toEqual({ added: ['__className_new'], removed: ['__className_old'] });
  });
  it('reports a changed asset between two v2 manifests', () => {
    const changed = { ...v2, linkCss: [{ ...v2.linkCss[0], ...one('w1', 'o9') }, v2.linkCss[1]] };
    expect(summarizeManifest(v2, changed).links[0]).toEqual({ asset: '/a.css', status: 'changed' });
  });
});
