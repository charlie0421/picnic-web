import postcss from 'postcss';
import { bag, requireValue } from './values';

export type StyleCheck = (property: string, value: string, priority: '' | 'important') => string;
export function parseStyle(value: unknown, previous: Record<string, string>, diff: boolean, check: StyleCheck): Record<string, string> {
  requireValue(diff || typeof value === 'string');
  if (value === null) return {};
  if (typeof value === 'string') {
    requireValue(!value.includes('\\')); const next: Record<string, string> = {};
    for (const node of postcss.parse(value).nodes) {
      requireValue(node.type === 'decl');
      requireValue(!Object.hasOwn(next, node.prop));
      next[node.prop] = check(node.prop, node.value, node.important ? 'important' : '');
    }
    return next;
  }
  requireValue(diff); const next = { ...previous };
  for (const [property, change] of Object.entries(bag(value))) {
    if (change === false) { requireValue(Object.hasOwn(next, property)); delete next[property]; }
    else if (Array.isArray(change)) {
      requireValue(change.length === 2 && typeof change[0] === 'string' && (change[1] === '' || change[1] === 'important'));
      next[property] = check(property, change[0], change[1]);
    } else { requireValue(typeof change === 'string'); next[property] = check(property, change, ''); }
  }
  return next;
}
export function styleString(value: Record<string, string>): string {
  return Object.entries(value).map(([k, v]) => `${k}: ${v};`).join(' ');
}
