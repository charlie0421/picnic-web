/**
 * Anti-abuse 응답 → typed exception 매핑.
 *
 * 매칭 패턴:
 *   - PostgrestError P0001 'RATE_LIMITED:<channel>' → AntiAbuseError
 *   - PostgrestError 42501 → AntiAbusePermissionError (key best-effort)
 *   - Edge fn 429 + nested {success:false, error:{code:'RATE_LIMITED', details:{reason}}} → AntiAbuseError
 *   - Edge fn 429 + flat {code:'RATE_LIMITED', reason} → AntiAbuseError (defensive fallback)
 */

export type AntiAbuseChannel =
  | 'ad_watch'
  | 'signup'
  | 'attendance'
  | 'artist_request';

export class AntiAbuseError extends Error {
  readonly channel: string;
  readonly rawCode: string | null;
  readonly original: unknown;

  constructor(
    channel: string,
    options: { rawCode?: string | null; original?: unknown } = {},
  ) {
    super(`AntiAbuseError(${channel})`);
    this.name = 'AntiAbuseError';
    this.channel = channel;
    this.rawCode = options.rawCode ?? null;
    this.original = options.original;
  }
}

export class AntiAbusePermissionError extends Error {
  readonly requiredKey: string | null;
  readonly original: unknown;

  constructor(requiredKey: string | null, original?: unknown) {
    super(`AntiAbusePermissionError(${requiredKey ?? '?'})`);
    this.name = 'AntiAbusePermissionError';
    this.requiredKey = requiredKey;
    this.original = original;
  }
}

export function mapAntiAbuseError(
  error: unknown,
): AntiAbuseError | AntiAbusePermissionError | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as Record<string, unknown>;

  // PostgrestError P0001 RATE_LIMITED:<channel>
  if (e.code === 'P0001' && typeof e.message === 'string') {
    const msg = e.message;
    if (msg.startsWith('RATE_LIMITED:')) {
      return new AntiAbuseError(msg.slice('RATE_LIMITED:'.length), {
        rawCode: 'P0001',
        original: error,
      });
    }
  }

  // 42501 permission denied (SECURITY DEFINER RPC 거부)
  if (e.code === '42501') {
    let requiredKey: string | null = null;
    try {
      const m = /permission denied:\s*([\w.]+)/m.exec(
        String(e.message ?? ''),
      );
      requiredKey = m?.[1] ?? null;
    } catch {
      /* best-effort */
    }
    return new AntiAbusePermissionError(requiredKey, error);
  }

  // Edge fn 429 — supabase-js FunctionException 의 details 또는 자체 status/response 형태
  const status =
    (typeof e.status === 'number' && e.status) ||
    (typeof e.statusCode === 'number' && e.statusCode) ||
    null;
  if (status === 429) {
    const reason = extractRateLimitedReason(
      (e as { details?: unknown; response?: { data?: unknown }; context?: { json?: unknown } }).details ??
        (e as { response?: { data?: unknown } }).response?.data ??
        (e as { context?: { json?: unknown } }).context?.json,
    );
    if (reason !== null) {
      const channel = reason.replace('_ip_quota', '');
      return new AntiAbuseError(channel, {
        rawCode: 'RATE_LIMITED',
        original: error,
      });
    }
  }

  return null;
}

/**
 * 두 가지 응답 shape 모두 지원:
 *   - nested (실제 서버): `{ success: false, error: { code: 'RATE_LIMITED', details: { reason } } }`
 *   - flat (defensive):    `{ code: 'RATE_LIMITED', reason }`
 */
function extractRateLimitedReason(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const d = details as Record<string, unknown>;
  const err = d.error;
  if (err && typeof err === 'object') {
    const errObj = err as Record<string, unknown>;
    if (errObj.code === 'RATE_LIMITED') {
      const inner = errObj.details;
      if (inner && typeof inner === 'object') {
        const reason = (inner as Record<string, unknown>).reason;
        return typeof reason === 'string' ? reason : '';
      }
      return '';
    }
  }
  if (d.code === 'RATE_LIMITED') {
    const reason = d.reason;
    return typeof reason === 'string' ? reason : '';
  }
  return null;
}
