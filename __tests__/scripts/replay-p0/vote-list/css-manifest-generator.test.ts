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
