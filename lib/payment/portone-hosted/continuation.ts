import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type ContinuationBinding = { actorUserId: string; orderId: string; paymentId: string };
const TOKEN = /^v1\.([1-9][0-9]{0,11})\.([A-Za-z0-9_-]{43})$/;

function signature(secret: string, binding: ContinuationBinding, expiresAtSeconds: number): string {
  return createHmac('sha256', secret)
    .update(['portone-hosted-continuation.v1', binding.actorUserId, binding.orderId, binding.paymentId, String(expiresAtSeconds)].join('|'))
    .digest('base64url');
}

/** A bounded return token for one actor, order and payment. It is not a credential and grants nothing alone. */
export function createHostedContinuation(secret: string, binding: ContinuationBinding, expiresAtMs: number): string {
  const seconds = Math.ceil(expiresAtMs / 1000);
  return `v1.${seconds}.${signature(secret, binding, seconds)}`;
}

export function verifyHostedContinuation(secret: string, token: unknown, binding: ContinuationBinding, nowMs: number): boolean {
  if (typeof token !== 'string') return false;
  const match = TOKEN.exec(token);
  if (!match) return false;
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds) || seconds * 1000 < nowMs) return false;
  // Compare the encoded text, so a change in unused trailing bits is also a mismatch.
  const expected = Buffer.from(signature(secret, binding, seconds), 'utf8');
  const actual = Buffer.from(match[2], 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The server secret for continuations: printable ASCII, at least 32 characters. */
export function readContinuationSecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = env.PORTONE_HOSTED_CONTINUATION_SECRET;
  return value && /^[\x21-\x7e]{32,512}$/.test(value) ? value : null;
}
