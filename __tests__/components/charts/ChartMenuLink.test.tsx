import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { render } from '@testing-library/react';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import tailwindcss from 'tailwindcss';
import { describe, expect, it, vi } from 'vitest';
import ChartMenuLink from '@/components/charts/ChartMenuLink';
import { createVoteListContract, type VoteListManifest } from '../../../scripts/replay-p0/contracts/vote-list';

vi.mock('next/navigation', () => ({ usePathname: () => '/ko/vote' }));
vi.mock('@/hooks/useTranslations', () => ({
  useTranslations: () => ({ tDynamic: (_key: string, fallback: string) => fallback }),
}));

const root = process.cwd();
const tailwindConfig = createRequire(path.join(root, 'package.json'))('./tailwind.config.js');
const manifest = JSON.parse(
  readFileSync(path.join(root, 'scripts/replay-p0/contracts/vote-list.css-manifest.json'), 'utf8'),
) as VoteListManifest;

/** The class names that Tailwind writes for one source text. Tailwind reads comments too. */
async function tailwindClasses(source: string): Promise<string[]> {
  const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: source, extension: 'tsx' }] })])
    .process('@tailwind components; @tailwind utilities;', { from: undefined });
  const names = new Set<string>();
  result.root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test((rule.parent as postcss.AtRule).name)) return;
    selectorParser(selectors => selectors.walkClasses(node => { names.add(node.value); })).processSync(rule.selector);
  });
  return [...names].sort();
}

// The shared header shows ChartMenuLink on every page, and the vote list is one of them.
// The Replay checks for the vote list accept only what they already know.
describe('ChartMenuLink in the shared header', () => {
  // Tailwind writes a utility into the global CSS file only when a source file uses it.
  // A utility that no other file uses changes that file, and the Replay build check
  // (scripts/replay-diagnostic/verify-build.cjs) stops with "Vote route CSS set changed".
  it('adds no utility to the pinned vote-route CSS', async () => {
    const source = readFileSync(path.join(root, 'components/charts/ChartMenuLink.tsx'), 'utf8');
    const pinned = new Set(manifest.classes);
    const written = await tailwindClasses(source);

    expect(written).toContain('inline-flex');
    expect(written.filter(name => !pinned.has(name))).toEqual([]);
  });

  // The vote-list contract closes the replay when an inline style has a property or a
  // value that it does not accept. Then the diagnostic sends no segment.
  it('uses only the inline styles that the vote-list contract accepts', () => {
    const contract = createVoteListContract({ manifest, origin: manifest.generatedFrom.origin, bannerCount: 0 });
    const { container } = render(<ChartMenuLink />);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    const styled = [link!, ...link!.querySelectorAll('*')].filter(element => element.hasAttribute('style'));

    expect(link!.getAttribute('style')).toBe('min-height: 40px;');
    for (const element of styled) {
      const tag = element.tagName.toLowerCase();
      const input = { tag, key: 'style', raw: element.getAttribute('style'), node: { tag, style: {} }, diff: false };
      expect(() => contract.attribute(input as Parameters<typeof contract.attribute>[0])).not.toThrow();
    }
  });
});
