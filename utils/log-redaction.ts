/**
 * 로그 엔트리 redaction.
 *
 * 로그 대상(Sentry 등)으로 나가기 직전에 민감 값을 걷어낸다.
 * 호출부가 무엇을 넣든 여기서 한 번 걸러지도록 중앙에 둔다.
 */
import type { LogEntry } from './logger-types';

/** 통째로 제거할 키. 소문자 비교하며 부분 일치를 쓴다. */
const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'cookie',
  'apikey',
  'api-key',
  'api_key',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'session',
  'auth',
];

const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

/** URL 에서 쿼리스트링을 떼고 경로만 남긴다. */
export function stripQueryString(url: string): string {
  if (!url) return url;
  const withoutHash = url.split('#')[0];
  const [beforeQuery] = withoutHash.split('?');
  try {
    // 절대 URL 이면 경로만 남긴다(호스트는 유지 가치가 낮고 토큰이 섞이기 쉽다).
    const parsed = new URL(beforeQuery);
    return parsed.pathname;
  } catch {
    return beforeQuery;
  }
}

function looksLikeUrl(value: string): boolean {
  return value.includes('?') && (value.startsWith('http') || value.startsWith('/'));
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[Depth limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return looksLikeUrl(value) ? stripQueryString(value) : value;
  }

  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) continue;
    out[k] = redactValue(v, depth + 1, seen);
  }
  return out;
}

function redactHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (isSensitiveKey(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 로그 엔트리에서 민감 값을 제거한 새 엔트리를 만든다.
 * 원본은 변형하지 않는다.
 *
 * 정책:
 * - 요청 헤더: authorization / cookie / apikey 등 민감 키 제거
 * - URL: 쿼리스트링 제거 (토큰이 섞여 들어오는 경로다)
 * - 사용자: id 만 유지. email 제거
 * - IP: 제거
 * - context: 민감 키를 재귀 제거하고 URL 값의 쿼리스트링도 제거
 */
export function redactLogEntry(entry: LogEntry): LogEntry {
  const seen = new WeakSet<object>();

  const user = entry.user ? { ...(entry.user.id ? { id: entry.user.id } : {}) } : undefined;

  let request: LogEntry['request'];
  if (entry.request) {
    const { ip: _ip, url, headers, ...rest } = entry.request;
    request = {
      ...rest,
      ...(url ? { url: stripQueryString(url) } : {}),
      ...(headers ? { headers: redactHeaders(headers) } : {}),
    };
  }

  const context = entry.context
    ? (redactValue(entry.context, 0, seen) as Record<string, unknown>)
    : entry.context;

  return {
    ...entry,
    ...(user ? { user } : {}),
    ...(request ? { request } : {}),
    ...(context ? { context } : {}),
  };
}
