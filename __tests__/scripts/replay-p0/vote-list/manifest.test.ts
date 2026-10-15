// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../../../../scripts/replay-p0/contracts/vote-list.css-manifest.json';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('vote-list CSS manifest', () => {
  const TAILWIND = '/_next/static/css/253f05d11a58abd2.css';
  const FONT = '/_next/static/css/a5b6ba8786c1e0e2.css';
  it('is a v2 manifest generated from a local real-font build', () => {
    expect(manifest.version).toBe(2);
    expect(manifest.sdkVersion).toBe('9.47.1');
    expect(manifest.generatedFrom.origin).toBe('http://127.0.0.1:53931');
    expect(manifest.generatedFrom.buildId).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(manifest.generatedFrom.commit).toMatch(/^[0-9a-f]{8}$/);
  });
  it('binds the CSS that production serves', () => {
    const by = new Map(manifest.linkCss.map(c => [c.asset, c]));
    expect(Array.from(by.keys()).sort()).toEqual([TAILWIND, FONT]);
    expect(by.get(TAILWIND)!.sourceSha256).toBe('144da3bc057b2042d21dfdc3dc5f33fcbe01fa2e620dc405404d594fbb56239c');
    expect(by.get(TAILWIND)!.accept[0].sha256).toBe('a8df5e2c47eca853c641975b098c2b109880eee7e774c852e430b94695908c3d');
    expect(by.get(TAILWIND)!.output.sha256).toBe('a8df5e2c47eca853c641975b098c2b109880eee7e774c852e430b94695908c3d');
    expect(by.get(FONT)!.sourceSha256).toBe('5d218a3a5e760187de9176137c0738276875a9d597bbf47360eb17c862afb1b8');
    expect(by.get(FONT)!.accept[0].sha256).toBe('b13bd1495a04b1a0fe88743b9a9f01bd0cc13bf7a4bb87645e4bad873fbef32b');
    expect(by.get(FONT)!.output.sha256).toBe('14d9b62f315ae2ac4a19c54ad5fd7aa00910a08204c2170e082e2e5e0748b49c');
    for (const c of [...manifest.linkCss, ...manifest.styleText]) {
      for (const a of c.accept) { expect(a.engine).toBe('chromium'); expect(sha(a.text)).toBe(a.sha256); }
      expect(sha(c.output.text)).toBe(c.output.sha256);
    }
    expect(manifest.styleText.map(s => s.output.sha256).sort()).toEqual([
      '3e3b68082316ca06cd9f0840be46d60a9d0ea3865b525c40003848fbab0b5b4a',
      '40ff023b53d41b6d411d5f308724f2e36649a0eaba6353352d31b984d1048ad8',
      '90da7db75e89a5e6566a2f6bf7278060b018157d549a8714e044e2d4b70160cd',
    ]);
  });
  it('keeps font URLs only in the accepted font CSS', () => {
    const font = manifest.linkCss.find(c => c.asset === FONT)!;
    const urls = Array.from(font.accept[0].text.matchAll(/url\("([^"]*)"\)/g), m => m[1]);
    expect(urls).toHaveLength(7);
    for (const u of urls) expect(u).toMatch(/^\/_next\/static\/media\/[0-9a-f]{16}-s\.woff2$/);
    for (const c of manifest.linkCss.filter(x => x.asset !== FONT)) expect(c.accept[0].text).not.toMatch(/url\(|@import/i);
    for (const c of [...manifest.linkCss, ...manifest.styleText]) expect(c.output.text).not.toMatch(/url\(|@import/i);
    expect(font.output.text).toContain('font-family: "Inter Fallback"');
    expect(font.output.text).toContain('.__className_62543b');
  });
  it('derives class tokens from CSS selectors only', () => {
    expect(manifest.classes).toEqual([...manifest.classes].sort());
    for (const t of ['banner-track', 'banner-slide', '__className_62543b', 'jsx-85d98f9caa448b4d', 'grid-cols-1']) expect(manifest.classes).toContain(t);
    expect(manifest.classes).not.toContain('__className_98b3fa');
    for (const t of ['lucide', 'lucide-menu']) expect(manifest.classes).not.toContain(t);
  });
  it('takes status colors from VoteStatusFilter.tsx', () => {
    expect(manifest.statusColors).toEqual(['rgb(131, 251, 200)', 'rgb(166, 168, 175)', 'rgb(255, 176, 32)', 'rgb(255, 66, 66)']);
    const src = readFileSync('components/client/vote/list/VoteStatusFilter.tsx', 'utf8');
    for (const hex of ['#83FBC8', '#A6A8AF', '#FFB020', '#FF4242']) expect(src).toContain(hex);
  });
  it('normalizes the Next announcer style from Next source', () => {
    expect(manifest.announcerStyle).toBe('position: absolute; border: 0px; height: 1px; margin: -1px; padding: 0px; width: 1px; clip: rect(0px, 0px, 0px, 0px); overflow: hidden; white-space: nowrap; overflow-wrap: normal;');
    expect(manifest.viewport).toBe('width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes');
  });
});
