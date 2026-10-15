// __tests__/scripts/replay-p0/vote-list/restore-compare.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyFailures, compare, fontEffect } from '../../../../scripts/replay-p0/vote-list-restore.cjs';

const box = (selector: string, index: number, extra: Record<string, number> = {}) =>
  ({ selector, index, x: 0, y: 0, width: 10, height: 10, opacity: 1, ...extra });
describe('restore comparison', () => {
  it('reports box differences above 1px and count differences', () => {
    const a = [box('h3', 0), box('img', 0)]; const b = [box('h3', 0, { y: 1.5 }), box('img', 0, { opacity: 0 })];
    expect(compare(a, b)).toEqual([{ box: 'h3#0', field: 'y', a: 0, b: 1.5 }, { box: 'img#0', field: 'opacity', a: 1, b: 0 }]);
    expect(compare([box('h3', 0)], [])).toContainEqual({ selector: 'h3', kind: 'count', a: 1, b: 0 });
  });
  it('classifies known differences and keeps the rest as other', () => {
    const c = classifyFailures([
      { box: 'img#2', field: 'opacity', a: 1, b: 0 },
      { box: '.grid > *#11', field: 'y', a: 2726.359375, b: 2730.359375 },
      { box: 'svg#4', field: 'y', a: 100, b: 102 },
      { box: 'svg#5', field: 'y', a: 100, b: 103 },
      { box: 'img#3', field: 'opacity', a: 0, b: 1 },
      { box: 'h3#0', field: 'width', a: 100, b: 104 },
      { selector: 'h3', kind: 'count', a: 12, b: 11 },
    ]);
    // The 4px card shift is hover; the capture removes hover before measuring, so here it is 'other'.
    expect([c.mediaOpacity.length, c.svgPlaceholder.length, c.other.length]).toEqual([1, 1, 5]);
  });
  it('measures the font effect between the masked original and the control', () => {
    const masked = [box('h3', 0, { width: 100 }), box('p', 0)]; const control = [box('h3', 0, { width: 103 }), box('p', 0)];
    expect(fontEffect(masked, control)).toEqual({ boxes: 1, maxDelta: 3 });
    expect(fontEffect(masked, masked)).toEqual({ boxes: 0, maxDelta: 0 });
  });
});
