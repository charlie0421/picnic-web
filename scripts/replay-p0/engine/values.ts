import type { Reason } from '../contract';

export const MAX_BYTES = 8 * 1024 * 1024;
export const encoder = new TextEncoder();
export const decoder = new TextDecoder('utf-8', { fatal: true });
export type Bag = Record<string, unknown>;
export class Rejected extends Error { constructor(readonly reason: Reason) { super(reason); } }
export function requireValue(value: unknown, reason: Reason = 'schema'): asserts value {
  if (!value) throw new Rejected(reason);
}
export function bag(value: unknown): Bag {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Bag;
}
export function fields(value: unknown, required: readonly string[], optional: readonly string[] = []): Bag {
  const result = bag(value);
  requireValue(required.every(k => Object.hasOwn(result, k))
    && Object.keys(result).every(k => required.includes(k) || optional.includes(k)));
  return result;
}
export function integer(value: unknown, min: number, max: number): number {
  requireValue(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
  return value;
}
export function id(value: unknown): number { return integer(value, 1, 2 ** 31 - 1); }
export function coordinate(value: unknown): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= -65536 && value <= 65536);
  return Math.round(value);
}
export function maskText(value: unknown): string {
  requireValue(typeof value === 'string'); requireValue(value.length <= 4096, 'budget');
  return value.replace(/\S/g, '*');
}
function normalizedPx(value: unknown, grammar: RegExp, max: number): string {
  requireValue(typeof value === 'string' && grammar.test(value));
  const n = Number(value.slice(0, -2)); requireValue(n <= max);
  return `${Number(n.toFixed(3))}px`;
}
/** Finite px value 0…max with at most six decimals; output keeps three decimals without trailing zeros. */
export function decimalPx(value: unknown, max = 16384): string {
  return normalizedPx(value, /^(0|[1-9]\d{0,4})(\.\d{1,6})?px$/, max);
}
/** rrweb's blocked media dimensions can contain subpixel layout precision. Keep only three output decimals. */
export function mediaDimensionPx(value: unknown): string {
  return normalizedPx(value, /^(0|[1-9]\d{0,4})(\.\d{1,20})?px$/, 16384);
}
export function checkTreeBudget(value: unknown) {
  let count = 0;
  const walk = (v: unknown, depth: number) => {
    requireValue(++count <= 200000 && depth <= 80, 'budget');
    if (typeof v === 'string') requireValue(encoder.encode(v).byteLength <= MAX_BYTES, 'budget');
    if (v && typeof v === 'object') for (const child of Object.values(v)) walk(child, depth + 1);
  };
  walk(value, 0);
}
