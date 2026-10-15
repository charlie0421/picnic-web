// __tests__/scripts/replay-p0/vote-list/production-check.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareProduction, extractPageRefs } from '../../../../scripts/replay-p0/tools/check-production-css.cjs';

const HTML = [
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
  '<link rel="stylesheet" href="/_next/static/css/253f05d11a58abd2.css" data-precedence="next"/>',
  '<link rel="stylesheet" href="/_next/static/css/a5b6ba8786c1e0e2.css" data-precedence="next"/>',
  '<script src="/_next/static/chunks/26-38f2440c05da76a3.js" async=""></script>',
  '<script src="/_next/static/chunks/app/%5Blang%5D/(main)/vote/page-d3e69ec772ec2941.js" async=""></script>',
  '<script>self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"nGXugIVZRSFy4ga95YQAZ\\"}"])</script>',
].join('');
const MANIFEST = {
  viewport: 'width=device-width, initial-scale=1',
  linkCss: [{ asset: '/_next/static/css/253f05d11a58abd2.css', sourceSha256: 't' }, { asset: '/_next/static/css/a5b6ba8786c1e0e2.css', sourceSha256: 'f' }],
  styleText: [{ accept: [{ engine: 'chromium', sha256: 'x', text: '.a{}' }], output: { sha256: 'x', text: '.a{}' } }],
};
const sha = (entries: [string, string][]) => new Map(entries);
const PAGE = 'https://www.picnic.fan/ko/vote';

describe('production page references', () => {
  it('extracts stylesheets, scripts, inline styles, viewport and build ID', () => {
    expect(extractPageRefs(HTML, PAGE)).toEqual({
      css: ['/_next/static/css/253f05d11a58abd2.css', '/_next/static/css/a5b6ba8786c1e0e2.css'], foreignCss: [],
      chunks: ['/_next/static/chunks/26-38f2440c05da76a3.js', '/_next/static/chunks/app/%5Blang%5D/(main)/vote/page-d3e69ec772ec2941.js'],
      foreignScripts: [], inlineStyles: 0,
      viewport: 'width=device-width, initial-scale=1', buildId: 'nGXugIVZRSFy4ga95YQAZ' });
  });
});

describe('production comparison', () => {
  const refs = extractPageRefs(HTML, PAGE);
  const good = sha([['/_next/static/css/253f05d11a58abd2.css', 't'], ['/_next/static/css/a5b6ba8786c1e0e2.css', 'f']]);
  it('passes when CSS bytes, styled-jsx and viewport match', () => {
    expect(compareProduction(MANIFEST, refs, good, new Set(['.a{}']))).toEqual({ ok: true, reasons: [] });
  });
  it('fails with a reason for each difference', () => {
    const bad = sha([['/_next/static/css/253f05d11a58abd2.css', 't'], ['/_next/static/css/a5b6ba8786c1e0e2.css', 'other']]);
    const r = compareProduction({ ...MANIFEST, viewport: 'width=1' }, { ...refs, css: [...refs.css, '/_next/static/css/ffffffffffffffff.css'] }, bad, new Set());
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([
      'served CSS not in manifest: /_next/static/css/ffffffffffffffff.css',
      'CSS bytes differ: /_next/static/css/a5b6ba8786c1e0e2.css',
      'styled-jsx not derivable from served chunks: x',
      'viewport differs',
    ]);
  });
  it('fails when stylesheets come from another origin or an extra sheet is served', () => {
    const html = HTML.replace(/href="\/_next\/static\/css\//g, 'href="https://cdn.example/_next/static/css/')
      + '<link rel="stylesheet" href="/extra.css"/>';
    const other = extractPageRefs(html, PAGE);
    expect(other.css).toEqual(['/extra.css']);
    const r = compareProduction(MANIFEST, other, good, new Set(['.a{}']));
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([
      'cross-origin stylesheet: https://cdn.example/_next/static/css/253f05d11a58abd2.css',
      'cross-origin stylesheet: https://cdn.example/_next/static/css/a5b6ba8786c1e0e2.css',
      'served CSS not in manifest: /extra.css',
      'manifest CSS not served: /_next/static/css/253f05d11a58abd2.css',
      'manifest CSS not served: /_next/static/css/a5b6ba8786c1e0e2.css',
    ]);
  });
  it('fails on inline styles and cross-origin scripts in the page HTML', () => {
    const other = extractPageRefs(`${HTML}<style>.x{}</style><script src="https://other.example/a.js"></script>`, PAGE);
    expect(compareProduction(MANIFEST, other, good, new Set(['.a{}'])).reasons).toEqual([
      'cross-origin script: https://other.example/a.js', 'inline <style> in page HTML: 1']);
  });
  it('fails when manifest CSS is not served', () => {
    const r = compareProduction(MANIFEST, { ...refs, css: ['/_next/static/css/253f05d11a58abd2.css'] }, good, new Set(['.a{}']));
    expect(r.reasons).toEqual(['manifest CSS not served: /_next/static/css/a5b6ba8786c1e0e2.css']);
  });
});
