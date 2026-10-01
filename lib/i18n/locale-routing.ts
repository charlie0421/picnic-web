import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '../../config/settings';

/**
 * 언어 접두어 라우팅의 판정 함수. middleware(Edge)가 쓰므로 config/settings 만 import 한다.
 * 설계: docs/superpowers/specs/2026-10-01-locale-prefix-routing-design.md
 */

const SUPPORTED = new Set<string>(SUPPORTED_LANGUAGES);

// 지원 언어를 가리키는 다른 표기
const ALIASES: Record<string, Language> = { zh: 'zh-cn', jp: 'ja', fil: 'tl' };

const aliasOf = (value: string): Language | null =>
  Object.hasOwn(ALIASES, value) ? ALIASES[value] : null;

/** 언어 태그를 지원 언어로 바꾼다. 못 바꾸면 null. */
export function normalizeLanguageTag(tag: string | null | undefined): Language | null {
  if (typeof tag !== 'string') return null;
  const value = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!value) return null;
  if (SUPPORTED.has(value)) return value as Language;

  const direct = aliasOf(value);
  if (direct) return direct;

  const [primary, ...subtags] = value.split('-');
  if (primary === 'zh') {
    if (subtags.includes('hans')) return 'zh-cn';
    if (subtags.includes('hant')) return 'zh-tw';
    if (subtags.some((subtag) => subtag === 'tw' || subtag === 'hk' || subtag === 'mo')) return 'zh-tw';
    return 'zh-cn';
  }
  return aliasOf(primary) ?? (SUPPORTED.has(primary) ? (primary as Language) : null);
}

export type SegmentClass =
  | { kind: 'canonical'; lang: Language }
  | { kind: 'variant'; lang: Language }
  | { kind: 'undecodable' }
  | { kind: 'other' };

// 정규화를 시도할 후보만 거른다. 주 언어 두세 글자(세 글자는 별칭 fil), script 는 hans·hant 뿐이라
// /my-page, /id-card, /en-route 가 언어로 오인되지 않는다.
const LANGUAGE_TAG_SHAPE = /^[a-z]{2,3}(?:[-_](?:[a-z]{2}|\d{3}|hans|hant))?(?:[-_][a-z]{2})?$/i;

/** 경로의 첫 세그먼트(인코딩된 그대로)를 분류한다. */
export function classifyFirstSegment(raw: string): SegmentClass {
  if (SUPPORTED.has(raw)) return { kind: 'canonical', lang: raw as Language };

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { kind: 'undecodable' };
  }
  if (!LANGUAGE_TAG_SHAPE.test(decoded)) return { kind: 'other' };

  const lang = normalizeLanguageTag(decoded);
  return lang ? { kind: 'variant', lang } : { kind: 'other' };
}

export interface LanguageSignals {
  referer: string | null;
  host: string | null;
  cookieLocale: string | null;
  acceptLanguage: string | null;
}

// 사이트 안에서 접두어 없는 주소로 이동한 경우, 보던 페이지의 언어를 쓴다.
// 비교 대상은 Host 헤더다 — 로컬 next start 의 nextUrl.origin 은 localhost 로 고정이라 어긋난다.
function languageFromReferer(referer: string | null, host: string | null): Language | null {
  if (!referer || !host) return null;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  if (url.host.toLowerCase() !== host.toLowerCase()) return null;
  const first = url.pathname.split('/')[1] ?? '';
  return SUPPORTED.has(first) ? (first as Language) : null;
}

const Q_VALUE = /^\d+(?:\.\d+)?$/;

function languageFromAcceptLanguage(header: string | null): Language | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((entry, index) => {
      const [rawTag, ...params] = entry.trim().split(';');
      let q = 1;
      for (const param of params) {
        const match = param.trim().match(/^q=(.*)$/i);
        if (match) q = Q_VALUE.test(match[1].trim()) ? Number(match[1]) : Number.NaN;
      }
      return { tag: rawTag.trim(), q, index };
    })
    .filter(({ tag, q }) => tag !== '' && tag !== '*' && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of candidates) {
    const lang = normalizeLanguageTag(tag);
    if (lang) return lang;
  }
  return null;
}

/** 주소에 언어가 없을 때 쓸 언어: 같은 호스트 Referer → locale 쿠키 → Accept-Language → 기본 언어. */
export function resolvePreferredLanguage(signals: LanguageSignals): Language {
  return (
    languageFromReferer(signals.referer, signals.host) ??
    normalizeLanguageTag(signals.cookieLocale) ??
    languageFromAcceptLanguage(signals.acceptLanguage) ??
    (DEFAULT_LANGUAGE as Language)
  );
}

// 규칙 2(정규 언어 + 콜백 → 언어를 뗀다)와 통과 목록이 같이 쓴다. 둘이 어긋나면 연쇄가 끝나지 않는다.
export const AUTH_CALLBACK_PATH = /^\/auth\/callback(?:\/[^/]+)?\/?$/;

// 정적 자산: Next 내부 경로, public/ 의 자산 디렉터리, 루트의 정확한 파일, 로케일 sitemap.
// middleware 의 config.matcher 제외 목록과 같은 기준이다(matcher 는 정적 분석 대상이라 이 상수를 못 쓴다 —
// 동기화는 __tests__/middleware/pass-through-sync.test.ts 가 확인한다). 확장자로 판정하지 않는다.
export const STATIC_ASSET_PATH =
  /^\/(?:_next\/|images\/|locales\/|favicon\/|concert2025\/(?:image|video)\/|(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)\/sitemap\.xml$|(?:favicon\.ico|apple-touch-icon(?:-precomposed)?\.png|robots\.txt|ads\.txt|app-ads\.txt|sitemap(?:-(?:0|[1-9]\d?))?\.xml|manifest\.json|site\.webmanifest|apple-developer-domain-association\.txt|firebase-messaging-sw\.js|emergency-auth-fix\.js)$)/;

// 언어 세그먼트 밖의 실제 라우트. (bare) 페이지는 첫 세그먼트가 아니라 라우트 단위로 적는다 —
// auth 를 통째로 통과시키면 /auth/rewards 가 [lang]=auth 로 샌다.
export const NON_LOCALIZED_PATH =
  /^\/(?:api\/|_vercel\/|supabase-proxy(?:\/|$)|open-in-browser\/?$|auth\/callback(?:\/[^/]+)?\/?$|auth\/loading\/?$|ads\/shortform\/player\/?$)/;

/** middleware 가 불렸지만 언어 규칙을 적용하지 않을 경로. */
export function isPassThroughPath(pathname: string): boolean {
  if (STATIC_ASSET_PATH.test(pathname) || NON_LOCALIZED_PATH.test(pathname)) return true;
  // 개발 서버의 내부 경로. Production 에는 없다.
  return process.env.NODE_ENV !== 'production' && pathname.startsWith('/__nextjs');
}

export type LocaleRouteDecision =
  | { type: 'pass'; lang: Language | null }
  | { type: 'redirect'; pathname: string };

/**
 * 첫 세그먼트를 한 번 판정한다(설계 §4.1 의 규칙 1~7, 위에서부터 처음 맞는 줄).
 * redirect 의 pathname 은 항상 /{정규 언어}/… 또는 콜백 라우트다. 쿼리는 호출자가 보존한다.
 */
export function decideLocaleRoute(pathname: string, signals: LanguageSignals): LocaleRouteDecision {
  if (pathname === '/') return { type: 'pass', lang: null };

  const first = pathname.split('/')[1] ?? '';
  const rest = pathname.slice(first.length + 1); // '' 또는 '/…'
  const segment = classifyFirstSegment(first);

  if (segment.kind === 'canonical') {
    if (AUTH_CALLBACK_PATH.test(rest)) return { type: 'redirect', pathname: rest };
    return { type: 'pass', lang: segment.lang };
  }
  if (segment.kind === 'undecodable' || isPassThroughPath(pathname)) return { type: 'pass', lang: null };
  if (segment.kind === 'variant') return { type: 'redirect', pathname: `/${segment.lang}${rest}` };
  return { type: 'redirect', pathname: `/${resolvePreferredLanguage(signals)}${pathname}` };
}
