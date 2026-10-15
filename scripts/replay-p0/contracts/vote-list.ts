import type { NodeState, ProjectionState } from '../contract';
import { parseStyle, styleString, type StyleCheck } from '../engine/style';
import type { Contract } from '../engine/types';
import { bag, decimalPx, integer, maskText, Rejected, requireValue, type Bag } from '../engine/values';

export type VoteListManifest = {
  version: 1; buildId: string; sdkVersion: string; release: string; environment: string;
  viewport: string; announcerStyle: string;
  linkCss: { asset: string; sourceSha256: string; wireSha256: string; wire: string }[];
  styleText: { sha256: string; text: string }[];
  classes: string[]; statusColors: string[];
};
export type VoteListOptions = { manifest: VoteListManifest; buildId: string; bannerCount: number };

const TAGS = ['html', 'head', 'body', 'meta', 'title', 'link', 'style', 'div', 'span', 'a', 'button', 'img', 'svg',
  'header', 'main', 'section', 'footer', 'h3', 'p', 'next-route-announcer'];
const ROLES = new Set(['button', 'navigation', 'list', 'listitem', 'alert', 'group', 'status', 'region']);
const PX = new Set(['width', 'height', 'min-height', 'top', 'left']);
const POSITIONS = new Set(['static', 'relative', 'absolute', 'fixed', 'sticky']);
const MEDIA = new Set(['img', 'svg']);
const HEAD_STATIC = new Set(['meta', 'link', 'style', 'title']);
const sameKeys = (a: Bag, keys: string[]) => Object.keys(a).length === keys.length && keys.every(k => Object.hasOwn(a, k));

export function createVoteListContract(o: VoteListOptions): Contract {
  requireValue(o.buildId === o.manifest.buildId);
  const bannerCount = integer(o.bannerCount, 0, 100);
  const m = o.manifest;
  const classes = new Set(m.classes);
  const linkCss = new Set(m.linkCss.map(c => c.wire));
  const styleTexts = new Set(m.styleText.map(s => s.text));
  const colors = new Set(m.statusColors);
  const check: StyleCheck = (property, value, priority) => {
    let out: string;
    if (PX.has(property)) out = value === '0' ? '0' : decimalPx(value);
    else if (property === 'opacity') { requireValue(/^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?|\.\d{1,2})$/.test(value)); out = value; }
    else if (property === 'user-select') { requireValue(['none', 'text', 'auto'].includes(value)); out = value; }
    else if (property === 'transform') { requireValue(value === 'none' || value === 'rotate(180deg)'); out = value; }
    else if (property === 'position') { requireValue(POSITIONS.has(value)); out = value; }
    else if (property === 'background-color') { requireValue(colors.has(value)); out = value; }
    else if (property === 'aspect-ratio') { requireValue(value === '700 / 356'); out = value; }
    else if (property === '--banner-current-index') {
      requireValue(/^(0|[1-9]\d{0,2})$/.test(value) && Number(value) <= Math.max(bannerCount - 1, 0)); out = value;
    } else throw new Rejected('schema');
    return out + (priority ? ' !important' : '');
  };
  const liveHost = (state: ProjectionState, self: NodeState) =>
    Array.from(state.nodes).some(([key, n]) => n !== self && n.shadow === 'host' && !state.tombstones.has(key));
  return {
    name: 'vote-list',
    sdkVersion: m.sdkVersion,
    metadata: { release: m.release, environment: m.environment },
    tags: new Set(TAGS),
    elementExtraKeys: ['isSVG', 'isShadowHost', 'isShadow'],
    elementExtras(raw, entry, parent, state) {
      const tag = entry.tag!; const a = bag(raw.attributes); const out: Bag = {};
      if (tag === 'svg') { requireValue(raw.isSVG === true); entry.svg = true; out.isSVG = true; }
      else requireValue(raw.isSVG === undefined);
      if (tag === 'next-route-announcer') {
        requireValue(raw.isShadowHost === true && !liveHost(state, entry)); entry.shadow = 'host'; out.isShadowHost = true;
      } else requireValue(raw.isShadowHost === undefined);
      if (raw.isShadow !== undefined) {
        requireValue(raw.isShadow === true && tag === 'div' && parent?.shadow === 'host' && parent.children.length === 0);
        entry.shadow = 'root'; out.isShadow = true;
      } else requireValue(parent?.shadow !== 'host');
      if (tag === 'meta') {
        if (Object.hasOwn(a, 'charset')) { requireValue(sameKeys(a, ['charset']) && a.charset === 'utf-8'); entry.mark = 'charset'; }
        else if (a.name === 'viewport') { requireValue(sameKeys(a, ['name', 'content']) && a.content === m.viewport); entry.mark = 'viewport'; }
        else entry.mark = 'other';
      }
      if (tag === 'link') {
        if (Object.hasOwn(a, '_cssText')) entry.mark = 'css';
        else if (Object.hasOwn(a, 'rr_width') || Object.hasOwn(a, 'rr_height')) {
          requireValue(sameKeys(a, ['rr_width', 'rr_height'])); entry.mark = 'placeholder';
        } else { requireValue(a.rel !== 'stylesheet' && !Object.hasOwn(a, 'data-precedence')); entry.mark = 'other'; }
      }
      return out;
    },
    attribute({ tag, key, raw, node, diff }) {
      if (HEAD_STATIC.has(tag) || node.shadow) requireValue(!diff);
      if (MEDIA.has(tag)) requireValue(key === 'class' || key === 'rr_width' || key === 'rr_height');
      if (tag === 'meta') {
        if (node.mark === 'charset' && key === 'charset') return 'utf-8';
        if (node.mark === 'viewport' && key === 'name') return 'viewport';
        if (node.mark === 'viewport' && key === 'content') return m.viewport;
        return undefined;
      }
      if (tag === 'link') {
        if (node.mark === 'css' && key === '_cssText') { requireValue(linkCss.has(raw as string)); return raw as string; }
        if (node.mark === 'placeholder') { requireValue(raw === '0px'); return raw; }
        return undefined;
      }
      if (tag === 'style') { if (key === 'type') { requireValue(raw === 'text/css'); return raw; } return undefined; }
      if (tag === 'title') return undefined;
      if (tag === 'html') { if (key === 'lang') { requireValue(raw === 'ko'); return raw; } return undefined; }
      if (node.shadow === 'root') {
        if (key === 'style') { requireValue(raw === m.announcerStyle); return raw; }
        if (key === 'role') { requireValue(raw === 'alert'); return raw; }
        return undefined;
      }
      const remove = raw === null && diff;
      if (key === 'rr_width' || key === 'rr_height') { requireValue(MEDIA.has(tag) && !remove); return decimalPx(raw); }
      if (key === 'style') {
        node.style = parseStyle(raw, node.style, diff, check);
        return raw === null ? null : styleString(node.style);
      }
      if (remove) return ['class', 'hidden', 'disabled', 'aria-hidden', 'aria-expanded', 'aria-pressed', 'role'].includes(key) ? null : undefined;
      if (key === 'class') {
        requireValue(typeof raw === 'string'); const tokens = raw.split(/\s+/).filter(Boolean);
        requireValue(tokens.length <= 64 && tokens.every(t => t.length <= 256), 'budget');
        return tokens.filter(t => classes.has(t)).join(' ');
      }
      if (key === 'hidden' || key === 'disabled') { requireValue(raw === '' || raw === key); return ''; }
      if (key === 'aria-hidden' || key === 'aria-expanded' || key === 'aria-pressed') { requireValue(raw === 'true' || raw === 'false'); return raw; }
      if (key === 'role') { requireValue(typeof raw === 'string' && ROLES.has(raw)); return raw; }
      if (key === 'type' && tag === 'button') { requireValue(raw === 'button'); return raw; }
      return undefined;
    },
    text(raw, parent) {
      if (parent?.tag === 'title') { requireValue(typeof raw === 'string'); return ''; }
      return maskText(raw);
    },
    styleText(raw) { requireValue(typeof raw === 'string' && styleTexts.has(raw)); return raw; },
    checkElement(entry, state) {
      if (MEDIA.has(entry.tag!)) requireValue(entry.children.length === 0 && 'rr_width' in entry.attrs && 'rr_height' in entry.attrs);
      if (entry.shadow === 'host') {
        requireValue(entry.children.length === 1 && state.nodes.get(entry.children[0])?.shadow === 'root');
      }
      if (entry.tag === 'link' && entry.mark === 'css') requireValue('_cssText' in entry.attrs);
    },
    childAllowed(parent) {
      if (parent.tag === 'title') return true;
      return !MEDIA.has(parent.tag!) && parent.shadow !== 'host' && !HEAD_STATIC.has(parent.tag!);
    },
  };
}
