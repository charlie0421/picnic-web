import manifest from '../fixtures/sdk-contract.json';
import { parseStyle, styleString } from '../engine/style';
import type { Contract } from '../engine/types';
import { integer, maskText, requireValue } from '../engine/values';

function cssValue(property: string, value: string, priority: '' | 'important'): string {
  let valid = false;
  if (property === 'width' || property === 'height') valid = /^(0|[1-9]\d{0,3})px$/.test(value) && parseInt(value, 10) <= 1000;
  if (property === 'opacity') valid = /^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?|\.\d{1,2})$/.test(value);
  if (property === '--banner-current-index') valid = /^[012]$/.test(value);
  requireValue(valid);
  return value + (priority ? ' !important' : '');
}
function staticCss(value: unknown): string {
  requireValue(value === manifest.rawCss || value === manifest.normalizedCss); return manifest.rawCss;
}
/** Only the synthetic P0 schema. Never use as a general Replay transport. */
export const p0FixtureContract: Contract = {
  name: 'p0-fixture',
  sdkVersion: manifest.sdkVersion,
  metadata: { release: 'replay-p0-fixture', environment: 'replay-p0-local' },
  tags: new Set(manifest.tags),
  elementExtraKeys: [],
  elementExtras: () => ({}),
  attribute({ key, raw, node, diff }) {
    if (key === 'style') {
      node.style = parseStyle(raw, node.style, diff, cssValue);
      return raw === null ? null : styleString(node.style);
    }
    if (key === 'class') {
      if (raw === null && diff) return null;
      requireValue(typeof raw === 'string'); const tokens = raw.split(/\s+/).filter(Boolean);
      requireValue(tokens.length <= 64 && tokens.every(t => t.length <= 256), 'budget');
      return tokens.filter(t => manifest.classes.includes(t)).join(' ');
    }
    if (key === 'disabled' || key === 'aria-expanded') {
      if (raw === null && diff) return null;
      if (key === 'disabled') { requireValue(raw === '' || raw === 'disabled'); return ''; }
      requireValue(raw === 'true' || raw === 'false'); return raw;
    }
    if (key === 'rr_width' || key === 'rr_height') {
      requireValue(typeof raw === 'string' && /^(0|[1-9]\d*)px$/.test(raw) && parseInt(raw, 10) <= 16384); return raw;
    }
    if (key === 'rr_scrollLeft' || key === 'rr_scrollTop') {
      const n = typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : raw;
      return String(integer(n, -65536, 65536));
    }
    if (key === '_cssText') return staticCss(raw);
    return undefined;
  },
  text: raw => maskText(raw),
  styleText: staticCss,
  checkElement: () => undefined,
  childAllowed: () => true,
};
