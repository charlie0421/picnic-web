// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../../../../scripts/replay-p0/contracts/vote-list.css-manifest.json';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('vote-list CSS manifest', () => {
  it('is bound to the inventoried build and SDK', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.buildId).toBe('WaMOsqHZc2V7cxWT91IY0');
    expect(manifest.sdkVersion).toBe('9.47.1');
  });
  it('stores wire CSS whose hashes match the inventory', () => {
    expect(manifest.linkCss.map(c => c.wireSha256).sort()).toEqual([
      '7049b8a01ed4f0c8a91b3e8d230ce1df08344969ed453cb1cc084fca6524b22f',
      'a8df5e2c47eca853c641975b098c2b109880eee7e774c852e430b94695908c3d',
    ]);
    for (const c of manifest.linkCss) expect(sha(c.wire)).toBe(c.wireSha256);
    expect(manifest.styleText.map(s => s.sha256).sort()).toEqual([
      '3e3b68082316ca06cd9f0840be46d60a9d0ea3865b525c40003848fbab0b5b4a',
      '40ff023b53d41b6d411d5f308724f2e36649a0eaba6353352d31b984d1048ad8',
      '90da7db75e89a5e6566a2f6bf7278060b018157d549a8714e044e2d4b70160cd',
    ]);
    for (const s of manifest.styleText) expect(sha(s.text)).toBe(s.sha256);
  });
  it('contains no resource references', () => {
    for (const css of [...manifest.linkCss.map(c => c.wire), ...manifest.styleText.map(s => s.text)]) {
      expect(css).not.toMatch(/url\(|@import/i);
    }
  });
  it('derives class tokens from CSS selectors only', () => {
    expect(manifest.classes).toEqual([...manifest.classes].sort());
    for (const t of ['banner-track', 'banner-slide', '__className_98b3fa', 'jsx-85d98f9caa448b4d', 'grid-cols-1']) expect(manifest.classes).toContain(t);
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
