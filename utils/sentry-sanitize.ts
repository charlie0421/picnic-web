/**
 * Sentry 로 나가는 모든 데이터의 단일 정제 지점.
 *
 * 타겟 하나만 막으면 새어 나간다. Sentry 는 기본 integration 으로
 * Console(브레드크럼)과 RequestData(헤더·쿠키·쿼리스트링)를 자동 수집하는데,
 * 그 경로는 애플리케이션 코드를 거치지 않는다. 따라서 정제는 SDK 의
 * beforeSend / beforeBreadcrumb 에서 해야 모든 경로를 덮는다.
 */

/** 값을 통째로 버릴 키. 단어 경계로 끊어 과잉 매칭을 막는다. */
const SENSITIVE_KEY_RE =
  /(^|[^a-z])(authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer|cookies?|set[-_]?cookie|api[-_]?key|apikey|secret|password|passwd|passphrase|credential|private[-_]?key|session[-_]?id|csrf|otp|pin)([^a-z]|$)/i;

/** 정규화된(공백 구분) 키에서 민감 단어를 찾는다. */
const SENSITIVE_WORD_RE =
  /(^| )(authorization|auth token|access token|refresh token|id token|bearer|cookie|cookies|set cookie|api key|apikey|secret|password|passwd|passphrase|credential|credentials|private key|session id|csrf|otp|pin)( |$)/i;

/** 민감해 보여도 진단에 필요해 남기는 키. */
const ALLOWED_KEY_RE = /^(auth|custom|actor|target|owner)?user[-_]?id$/i;

/** camelCase 와 구분자를 모두 공백으로 펴서 단어 단위 비교가 되게 한다. */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .toLowerCase();
}

export function isSensitiveKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (ALLOWED_KEY_RE.test(key)) return false;
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_RE.test(key) || SENSITIVE_WORD_RE.test(normalized);
}

/** URL 처럼 보이는 문자열에서 쿼리스트링과 프래그먼트를 떼어낸다. */
export function sanitizeUrlValue(value: string): string {
  if (typeof value !== 'string' || !value) return value;
  // 문자열 안에 박힌 URL 도 잡는다.
  return value.replace(/(https?:\/\/[^\s]+|\/[^\s?]*\?[^\s]*)/g, (url) => {
    const noHash = url.split('#')[0];
    return noHash.split('?')[0];
  });
}

/** 이메일처럼 보이는 문자열을 가린다. */
function maskEmails(value: string): string {
  return value.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]');
}

function sanitizeText(value: string): string {
  return maskEmails(sanitizeUrlValue(value));
}

const MAX_DEPTH = 8;

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[Depth limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => safeWalk(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    let raw: unknown;
    try {
      raw = (value as Record<string, unknown>)[key];
    } catch {
      // getter 가 throw 해도 이벤트 전체를 버리지 않는다.
      out[key] = '[Unreadable]';
      continue;
    }
    out[key] = safeWalk(raw, depth + 1, seen);
  }
  return out;
}

function safeWalk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  try {
    return walk(value, depth, seen);
  } catch {
    return '[Unsanitizable]';
  }
}

function sanitizeHeaders(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object') return headers;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(headers as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    let v: unknown;
    try {
      v = (headers as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    // referer 처럼 값 자체가 URL 인 헤더는 값도 정제해야 한다.
    out[key] = typeof v === 'string' ? sanitizeText(v) : safeWalk(v, 1, new WeakSet());
  }
  return out;
}

/** Sentry event 를 정제한다. beforeSend 에서 호출한다. */
export function sanitizeSentryEvent<T extends Record<string, any>>(input: T): T {
  const event = input as Record<string, any>;
  if (!event || typeof event !== 'object') return input;
  const seen = new WeakSet<object>();

  try {
    if (typeof event.message === 'string') {
      event.message = sanitizeText(event.message);
    }

    if (event.user && typeof event.user === 'object') {
      // id 만 남긴다. email / ip_address / username 은 보내지 않는다.
      event.user = event.user.id ? { id: event.user.id } : {};
    }

    if (event.request && typeof event.request === 'object') {
      const req = event.request as Record<string, unknown>;
      if (typeof req.url === 'string') req.url = sanitizeUrlValue(req.url);
      delete req.query_string;
      delete req.cookies;
      delete req.data;
      if (req.headers) req.headers = sanitizeHeaders(req.headers);
    }

    if (event.exception?.values && Array.isArray(event.exception.values)) {
      for (const ex of event.exception.values) {
        if (ex && typeof ex.value === 'string') ex.value = sanitizeText(ex.value);
      }
    }

    if (event.extra) event.extra = safeWalk(event.extra, 0, seen) as Record<string, unknown>;
    if (event.contexts) event.contexts = safeWalk(event.contexts, 0, seen) as Record<string, unknown>;
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((b: unknown) => sanitizeBreadcrumb(b as Record<string, any>));
    }
  } catch {
    // 정제 실패로 이벤트를 잃지 않는다. 원본 대신 최소 정보만 남긴다.
    return { ...event, extra: undefined, contexts: undefined, request: undefined } as unknown as T;
  }

  return event as unknown as T;
}

/** breadcrumb 를 정제한다. beforeBreadcrumb 에서 호출한다. */
export function sanitizeBreadcrumb<T extends Record<string, any>>(input: T): T {
  const crumb = input as Record<string, any>;
  if (!crumb || typeof crumb !== 'object') return input;
  try {
    if (typeof crumb.message === 'string') crumb.message = sanitizeText(crumb.message);
    if (crumb.data) crumb.data = safeWalk(crumb.data, 0, new WeakSet()) as Record<string, unknown>;
  } catch {
    return { ...crumb, data: undefined } as unknown as T;
  }
  return crumb as unknown as T;
}
