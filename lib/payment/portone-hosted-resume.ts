import { isServerOrderUuid } from './server-order';

/**
 * Carries a mobile-return order id across a login in this tab. It holds only the order id and a time: never a
 * payment token, continuation, amount or account. The signed-in owner's server lookup decides everything; another
 * account gets a closed result. A corrupt, tampered, stale or unavailable store yields nothing.
 */
const KEY = 'picnic.portone-hosted.resume.v1';
export const HOSTED_RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function read(storage: Store, now: number): string | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const v = d as Record<string, unknown>;
      if (Object.keys(v).length === 3 && v.version === 1 && isServerOrderUuid(v.orderId) && v.orderId === v.orderId.toLowerCase()
        && typeof v.savedAt === 'number' && Number.isSafeInteger(v.savedAt) && v.savedAt <= now + 60_000
        && now - v.savedAt <= HOSTED_RESUME_MAX_AGE_MS) return v.orderId;
    }
  } catch { /* Corrupt values are removed below. */ }
  storage.removeItem(KEY);
  return null;
}

export function saveHostedResume(storage: Store | null, orderId: string, now: number): boolean {
  if (!storage || !isServerOrderUuid(orderId)) return false;
  try { storage.setItem(KEY, JSON.stringify({ version: 1, orderId: orderId.toLowerCase(), savedAt: now })); return true; }
  catch { return false; }
}
export function peekHostedResume(storage: Store | null, now: number): string | null {
  if (!storage) return null;
  try { return read(storage, now); } catch { return null; }
}
export function clearHostedResume(storage: Store | null) {
  try { storage?.removeItem(KEY); } catch { /* Nothing to clear when storage is unavailable. */ }
}
/** Session storage when the browser allows it; null in private modes that block it. */
export function hostedResumeStorage(): Store | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
