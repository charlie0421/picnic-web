// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildStyleSources, checkCss, traceStyledJsx } from '../../../../scripts/replay-p0/tools/build-css-manifest.cjs';

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
  it('rejects resource references', () => {
    const css = '.a { background: url("x.png"); }';
    expect(() => checkCss(css, css, new Set([css]), 'x')).toThrow(/resource/);
  });
  const chunk = 'x={children:".s.jsx-85d98f{top:0}"};y={dynamic:[1],children:".c.__jsx-style-dynamic-selector{--n:".concat(1,"}@media(min-width:768px){.c.__jsx-style-dynamic-selector{--n:2}}")};';
  it('traces static and literal-dynamic styled-jsx text to build JS', () => {
    const sources = buildStyleSources([chunk]);
    expect(traceStyledJsx('.s.jsx-85d98f{top:0}', sources)).toBe(true);
    expect(traceStyledJsx('.c.jsx-3947{--n:1}@media(min-width:768px){.c.jsx-3947{--n:2}}', sources)).toBe(true);
  });
  it('rejects styled-jsx text that the build does not contain', () => {
    const sources = buildStyleSources([chunk]);
    expect(traceStyledJsx('.s.jsx-85d98f{top:0}:root{--p:"PIIMARK"}', sources)).toBe(false);
    expect(traceStyledJsx('.c.jsx-3947{--n:9}@media(min-width:768px){.c.jsx-3947{--n:2}}', sources)).toBe(false);
  });
});
