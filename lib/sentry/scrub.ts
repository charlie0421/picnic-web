/**
 * Sentry 로 나가는 이벤트에서 요청 데이터, URL 쿼리, 토큰 모양 값을 지운다.
 *
 * 설계: docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.1, §4.5, §4.7.
 * 서버(sentry.server.config.js)와 edge(sentry.edge.config.js)가 같은 함수를 쓴다.
 *
 * - edge 번들에 들어가므로 Node API 를 쓰지 않는다.
 * - 입력 길이에 선형인 코드만 둔다. 예외 메시지와 요청 경로는 외부 입력이라 길이를 믿을 수 없다.
 * - 필드 이름 목록으로 URL 을 찾지 않는다. 이벤트의 모든 문자열에 같은 규칙을 건다.
 *   SDK 가 새 속성을 만들어도 같은 규칙을 탄다. 실제로 남는 것이 없는지는 envelope 테스트가 본다
 *   (npm run test:envelope).
 */

export const TRIPWIRE_KEY = 'redaction.tripwire';

const REDACTED_JWT = '[redacted-jwt]';
const REDACTED_BEARER = 'Bearer [redacted]';
const REDACTED_EMAIL = '[redacted-email]';

/** Sentry 가 메시지에 두는 상한과 같다. 그보다 긴 부분은 어차피 버려진다. */
const MAX_FREE_TEXT_LENGTH = 8192;
const MIN_JWT_SEGMENT = 10;
const MIN_TOKEN_TEXT_LENGTH = 20;

/** 값 전체가 쿼리인 속성. 어디에 있든 키째로 지운다. */
const QUERY_ONLY_KEYS = new Set(['url.query', 'http.query', 'url.fragment', 'http.fragment']);

/** `?`·`#` 바로 뒤가 `키=` 모양인가. 최대 66자만 본다. */
const QUERY_PAIR = /^[?#][\w.%[\]-]{1,64}=/;
const QUERY_PAIR_WINDOW = 66;
/** `Bearer` 뒤의 토큰. 숫자가 하나 이상 있고 16자 이상이어야 한다("Bearer token is missing" 을 건드리지 않는다). */
const BEARER_TOKEN = /\bbearer\s+(?=[\w.~+/-]*\d)[\w.~+/-]{16,}=*/gi;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;

type Bag = Record<string, unknown>;
type Walk = { tripwire: boolean; seen: WeakSet<object> };

function isBag(value: unknown): value is Bag {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 토큰에서 잘라낼 위치. 표시(`?`·`#`) 앞에 `/` 가 있거나 표시 바로 뒤가 `키=` 모양일 때만 자른다. */
function queryCutIndex(token: string): number {
  let sawSlash = false;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code === 47) {
      sawSlash = true;
    } else if ((code === 63 || code === 35) && (sawSlash || QUERY_PAIR.test(token.slice(i, i + QUERY_PAIR_WINDOW)))) {
      return i;
    }
  }
  return -1;
}

/**
 * 문자열 안의 URL 에서 `?`·`#` 뒤를 버린다. 공백으로 나눈 토큰마다 본다.
 * 공백이 없는 URL 하나는 토큰이 하나이므로 표시 뒤가 전부 사라진다.
 */
export function stripUrlQueries(text: string): string {
  if (text.indexOf('?') === -1 && text.indexOf('#') === -1) return text;
  return text.replace(/\S+/g, (token) => {
    const cut = queryCutIndex(token);
    return cut === -1 ? token : token.slice(0, cut);
  });
}

const isBase64Url = (code: number): boolean =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || code === 95;

/** `eyJ….….…`(base64url 세 덩어리)을 고정 문자열로 바꾼다. 실패한 지점부터 다시 찾으므로 선형이다. */
function redactJwtShapes(text: string): string {
  let start = text.indexOf('eyJ');
  if (start === -1) return text;

  let out = '';
  let copied = 0;
  while (start !== -1) {
    let cursor = start;
    let segments = 0;
    for (;;) {
      const segmentStart = cursor;
      while (cursor < text.length && isBase64Url(text.charCodeAt(cursor))) cursor++;
      if (cursor - segmentStart < MIN_JWT_SEGMENT) break;
      segments++;
      if (segments === 3 || text.charCodeAt(cursor) !== 46) break;
      cursor++;
    }
    if (segments === 3) {
      out += text.slice(copied, start) + REDACTED_JWT;
      copied = cursor;
    }
    start = text.indexOf('eyJ', Math.max(cursor, start + 3));
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/**
 * 토큰 모양(JWT, `Bearer <토큰>`)을 고정 문자열로 바꾼다. 정제 수단이 아니라 경보다(§4.5).
 * 값이 바뀌었다면 수집 축소나 호출부에 구멍이 있다는 뜻이다.
 */
export function redactTokenShapes(text: string): string {
  if (text.length < MIN_TOKEN_TEXT_LENGTH) return text;
  return redactJwtShapes(text).replace(BEARER_TOKEN, REDACTED_BEARER);
}

/** 예외 메시지 같은 자유 문장. 길이를 묶고 이메일을 가린다. URL 쿼리와 토큰 모양은 뒤의 순회가 처리한다. */
function scrubFreeText(text: string): string {
  const capped = text.length > MAX_FREE_TEXT_LENGTH ? `${text.slice(0, MAX_FREE_TEXT_LENGTH)}…` : text;
  return capped.indexOf('@') === -1 ? capped : capped.replace(EMAIL, REDACTED_EMAIL);
}

function scrubString(value: string, walk: Walk): string {
  const stripped = stripUrlQueries(value);
  const redacted = redactTokenShapes(stripped);
  if (redacted !== stripped) walk.tripwire = true;
  return redacted;
}

/** 값 안의 모든 문자열에 규칙을 건다. 받은 객체를 고친다. */
function scrubNode(node: unknown, walk: Walk): void {
  if (node === null || typeof node !== 'object' || walk.seen.has(node)) return;
  walk.seen.add(node);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const item: unknown = node[i];
      if (typeof item === 'string') {
        const next = scrubString(item, walk);
        if (next !== item) node[i] = next;
      } else {
        scrubNode(item, walk);
      }
    }
    return;
  }

  if (!isBag(node)) return;
  for (const key of Object.keys(node)) {
    if (QUERY_ONLY_KEYS.has(key)) {
      delete node[key];
      continue;
    }
    const value = node[key];
    if (typeof value === 'string') {
      const next = scrubString(value, walk);
      if (next !== value) node[key] = next;
    } else {
      scrubNode(value, walk);
    }
  }
}

/** request 에는 url 과 method 만 남긴다. 헤더·쿠키·쿼리·본문은 수집 옵션이 이미 뺐고, 이것은 두 번째 문이다. */
function keepRequestUrlAndMethod(event: Bag): void {
  if (event.request === undefined) return;
  const request = event.request;
  if (!isBag(request)) {
    delete event.request;
    return;
  }
  const kept: Bag = {};
  if (typeof request.method === 'string') kept.method = request.method;
  if (typeof request.url === 'string') kept.url = request.url;
  event.request = kept;
}

function scrubMessages(event: Bag): void {
  if (typeof event.message === 'string') event.message = scrubFreeText(event.message);
  const values = isBag(event.exception) ? event.exception.values : undefined;
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (isBag(value) && typeof value.value === 'string') value.value = scrubFreeText(value.value);
  }
}

/** beforeSendSpan 이 span 에 남긴 표식이 있는가. */
function hasMarkedSpan(event: Bag): boolean {
  const marked = (data: unknown): boolean => isBag(data) && data[TRIPWIRE_KEY] === '1';
  const trace = isBag(event.contexts) ? event.contexts.trace : undefined;
  if (isBag(trace) && marked(trace.data)) return true;
  return Array.isArray(event.spans) && event.spans.some((span: unknown) => isBag(span) && marked(span.data));
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

/**
 * beforeSend·beforeSendTransaction 용. 받은 객체를 고쳐서 그대로 돌려준다.
 * 가리다가 실패하면 이벤트를 버린다 — 가리지 못한 이벤트를 보내지 않는다.
 */
export function scrubEvent<T extends object>(event: T): T | null {
  try {
    const bag = event as unknown as Bag;
    keepRequestUrlAndMethod(bag);
    scrubMessages(bag);

    const walk: Walk = { tripwire: false, seen: new WeakSet() };
    scrubNode(bag, walk);
    if (walk.tripwire || hasMarkedSpan(bag)) {
      bag.tags = { ...(isBag(bag.tags) ? bag.tags : {}), [TRIPWIRE_KEY]: '1' };
    }
    return event;
  } catch (error) {
    // 원본 오류의 메시지는 찍지 않는다. 가리려던 값이 들어 있을 수 있다.
    console.error('[sentry] 이벤트를 가리지 못해 버린다:', errorName(error));
    return null;
  }
}

/** beforeSendSpan 용. span 은 버릴 수 없으므로 실패하면 설명과 속성을 비운다. */
export function scrubSpan<T extends object>(span: T): T {
  const bag = span as unknown as Bag;
  try {
    const walk: Walk = { tripwire: false, seen: new WeakSet() };
    scrubNode(bag, walk);
    if (walk.tripwire) bag.data = { ...(isBag(bag.data) ? bag.data : {}), [TRIPWIRE_KEY]: '1' };
  } catch (error) {
    console.error('[sentry] span 을 가리지 못해 설명과 속성을 비운다:', errorName(error));
    bag.description = undefined;
    bag.data = {};
  }
  return span;
}
