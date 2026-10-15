// __tests__/scripts/replay-p0/vote-list/engine-compare.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cssRules, diffCssRules } from '../../../../scripts/replay-p0/tools/compare-engine-css';

describe('engine CSS comparison', () => {
  it('splits serialized CSS into top-level rules', () => {
    expect(cssRules('.a { color: red; }@media (min-width: 1px) { .b { top: 0px; } }'))
      .toEqual(['.a { color: red; }', '@media (min-width: 1px) { .b { top: 0px; } }']);
  });
  it('counts rules present in only one serialization', () => {
    const d = diffCssRules('.a { color: red; }.x { -webkit-a: 1; }', '.a { color: red; }.y { b: 2; }');
    expect(d).toEqual({ onlyEngine: 1, onlyChromium: 1, examples: { onlyEngine: ['.x { -webkit-a: 1; }'], onlyChromium: ['.y { b: 2; }'] } });
    expect(diffCssRules('.a { color: red; }', '.a { color: red; }')).toMatchObject({ onlyEngine: 0, onlyChromium: 0 });
  });
});
