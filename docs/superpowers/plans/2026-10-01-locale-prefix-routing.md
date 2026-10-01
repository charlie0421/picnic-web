# 언어 접두어 라우팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 세그먼트가 정규 언어가 아닌 주소를 middleware 가 307 로 정규 주소·선호 언어 주소에 보내고, middleware 가 닿지 않는 경로는 catch-all route handler 와 `[lang]` 레이아웃 가드가 404 로 받게 한다.

**Architecture:** 판정은 전부 순수 함수 모듈 `lib/i18n/locale-routing.ts` 에 둔다(`decideLocaleRoute` 가 설계 §4.1 의 규칙 일곱 줄). `middleware.ts` 는 맨 앞에서 그 결정을 응답으로 바꾸고, 통과일 때만 기존 흐름(인앱 안내 → `getClaims` → 탈퇴 차단)을 탄다. matcher 가 제외하는 디렉터리 다섯 개에는 404 를 주는 catch-all route handler 를 두고, 남는 구멍은 `app/[lang]/layout.tsx` 의 `notFound()` 가 받는다.

**Tech Stack:** Next.js 15.5.26 (App Router, middleware), TypeScript, Vitest 4.1, `@supabase/ssr`, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-01-locale-prefix-routing-design.md` (초안 5, 사용자 승인 2026-10-01). 이 계획은 설계서를 근거로 한다. 실행자는 둘 다 읽는다.

## Global Constraints

- 워크트리: `/Users/charlie.hyun/Repositories/picnic-web-locale-prefix`, 브랜치 `fix/locale-prefix-routing`. 메인 폴더(`~/Repositories/picnic-web`)에서 작업하지 않는다.
- 새 리다이렉트는 전부 **307** 이다. `permanent: true` 와 308 을 추가하지 않는다.
- middleware 의 새 리다이렉트 응답에는 `Cache-Control: private, no-store` 를 붙이고 `Set-Cookie` 를 싣지 않는다. middleware 는 쿠키를 쓰지 않는다.
- 정규 언어는 `config/settings.ts` 의 `SUPPORTED_LANGUAGES` 12개(`en`, `ko`, `zh-cn`, `zh-tw`, `ja`, `id`, `es`, `bn`, `tl`, `th`, `vi`, `my`)와 글자 하나까지 같은 값이다.
- 선호 언어 순서: 같은 호스트 Referer 의 정규 언어 → `locale` 쿠키 → `Accept-Language` → `en`. `NEXT_LOCALE` 쿠키는 읽지 않는다.
- 홈 `/` 는 바꾸지 않는다(next.config 가 `/en/vote` 로 보낸다).
- 바꾸지 않는 것(설계 §4.7): `(bare)` 리다이렉트 스텁의 동작, `app/[lang]/page.tsx`, `generateStaticParams`, 각 페이지의 `revalidate`, `app/[lang]/sitemap.ts`, `app/open-in-browser/route.ts`, 인앱 판정·`getClaims`·탈퇴 차단의 조건과 언어 순서, 클라이언트 언어 판별, `vercel.json`, `headers()`.
- DB 스키마·마이그레이션을 건드리지 않는다(picnic-supabase 소유). QNA·/media 를 지우지 않는다.
- 로컬 빌드·실행은 `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=` 로 DSN 을 비운다(로컬 실행도 운영 Sentry 에 보고한다).
- 검증 명령: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. 빌드는 `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= npm run build`.
- 커밋은 Conventional Commits, 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push 와 PR 은 Task 7 에서만 한다. `main` 에 직접 커밋하지 않는다.
- middleware 는 인증 세션을 다루므로 고위험이다. 머지 전에 구현과 다른 공급자(Codex gpt-6-sol / high)의 교차 리뷰를 받는다.

## Review Focus

설계가 함의하지만 그대로 두면 테스트가 지나치는 입력이다. 각 줄의 테스트는 괄호 안의 Task 에 넣었다.

1. **세션 쿠키를 가진 사용자의 접두어 없는 요청** — 리다이렉트 응답이 `Set-Cookie` 를 싣거나 `getClaims` 를 불러 세션을 건드리면 안 된다. 세션 갱신은 목적지 요청에서 일어난다. (Task 3)
2. **쿼리에 특수문자가 든 주소**(`/login?next=%2Fko%2Fvote&error=a+b&x=%EA%B0%80`) — 한 글자도 바뀌지 않고 목적지에 남아야 한다. (Task 3)
3. **깨진 헤더** — `Accept-Language: ;;;,,q=`, 항목 수백 개, `Referer: not a url`, `Cookie: locale=%E0%A4%A` 가 예외를 던지지 않고 다음 신호로 넘어가야 한다. (Task 1)
4. **슬래시·인코딩으로 출처를 속이는 경로**(`//evil.com/x`, `/\evil.com`, `/%2F%2Fevil.com/x`, `/ko//x`) — 목적지 경로가 `/{정규 언어}/` 로 시작하고 Location 의 출처가 요청과 같아야 한다. (Task 2, Task 3)
5. **GET 이 아닌 메서드**(`POST /login`, `HEAD /download`) — 307 이어야 하고(302·303 금지) 정규 언어 경로의 POST 는 그대로 통과해야 한다. (Task 3)

---

## File Structure

| 파일 | 역할 | Task |
|---|---|---|
| `lib/i18n/locale-routing.ts` (새 파일) | 언어 정규화, 첫 세그먼트 분류, 선호 언어, 통과 목록, `decideLocaleRoute` | 1, 2 |
| `__tests__/lib/i18n/locale-routing.test.ts` (새 파일) | 위 모듈의 단위 테스트와 연쇄 테스트 | 1, 2 |
| `middleware.ts` | 결정을 응답으로 바꾸는 얇은 층, matcher | 3 |
| `__tests__/middleware/locale-routing.test.ts` (새 파일) | middleware 의 새 리다이렉트 사례 | 3 |
| `__tests__/middleware/locale-headers.test.ts`, `matcher.test.ts` | 기존 사례 수정 | 3 |
| `app/[lang]/layout.tsx` | 정규 언어가 아니면 `notFound()` | 4 |
| `__tests__/app/lang-layout-html.test.tsx` | 가드 단언 | 4 |
| `app/{api,images,locales,favicon,concert2025}/[...slug]/route.ts` (새 파일 5개) | 404 catch-all | 5 |
| `next.config.js` | 개인정보 리다이렉트 2줄, supabase-proxy rewrite 언어 제한 | 5 |
| `public/favicon.ico`, `public/apple-touch-icon.png`, `public/apple-touch-icon-precomposed.png` (새 파일) | 루트 아이콘 | 5 |
| `__tests__/app/catch-all-not-found.test.ts` (새 파일), `__tests__/next-config-redirects.test.ts` | handler·설정 단언 | 5 |
| `__tests__/middleware/pass-through-sync.test.ts` (새 파일) | 파일시스템과 통과 목록·matcher 대조 | 6 |
| `__tests__/app/metadata-utils.test.ts` | referrer 정책 단언 | 6 |
| `app/(bare)/**/page.tsx` 스텁 4개, `__tests__/app/unprefixed-redirect-stubs.test.tsx`, `scripts/rendering-modes.js` | 주석·설명만 | 7 |
| `docs/superpowers/specs/…-design.md`, `docs/audit-2026-09-26/plan.md` | 상태 기록 | 7 |

---

### Task 1: 언어 정규화·분류·선호 언어 (순수 함수)

**Files:**
- Create: `lib/i18n/locale-routing.ts`
- Test: `__tests__/lib/i18n/locale-routing.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE`, `type Language` from `config/settings.ts`
- Produces:
  - `normalizeLanguageTag(tag: string | null | undefined): Language | null`
  - `classifyFirstSegment(raw: string): SegmentClass` — `{ kind: 'canonical'; lang: Language } | { kind: 'variant'; lang: Language } | { kind: 'undecodable' } | { kind: 'other' }`
  - `interface LanguageSignals { referer: string | null; host: string | null; cookieLocale: string | null; acceptLanguage: string | null }`
  - `resolvePreferredLanguage(signals: LanguageSignals): Language`

- [ ] **Step 0: 브랜치를 최신 main 위로 올린다**

```bash
cd /Users/charlie.hyun/Repositories/picnic-web-locale-prefix
git fetch origin && git rebase origin/main
git log --oneline -1 origin/main   # 기대: a623caf2 … (#106) 또는 그 뒤
npx vitest run 2>&1 | grep -E "Test Files|Tests "
```

Expected: 충돌 없이 rebase 되고 전체 테스트가 통과한다(문서 커밋만 올라가 있다). 실패하면 멈추고 보고한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/lib/i18n/locale-routing.test.ts` 를 만든다.

```ts
import { describe, expect, it } from 'vitest';
import {
  classifyFirstSegment,
  normalizeLanguageTag,
  resolvePreferredLanguage,
  type LanguageSignals,
} from '@/lib/i18n/locale-routing';

const signals = (partial: Partial<LanguageSignals> = {}): LanguageSignals => ({
  referer: null,
  host: 'www.picnic.fan',
  cookieLocale: null,
  acceptLanguage: null,
  ...partial,
});

describe('normalizeLanguageTag', () => {
  it.each([
    ['KO', 'ko'],
    ['zh_TW', 'zh-tw'],
    ['ZH-Hant-TW', 'zh-tw'],
    ['zh-Hans-TW', 'zh-cn'],
    ['zh', 'zh-cn'],
    ['zh-HK', 'zh-tw'],
    ['zh-SG', 'zh-cn'],
    ['en-US', 'en'],
    ['es-419', 'es'],
    ['jp', 'ja'],
    ['fil-PH', 'tl'],
    [' ko ', 'ko'],
  ])('%s → %s', (tag, expected) => {
    expect(normalizeLanguageTag(tag)).toBe(expected);
  });

  it.each(['pt-BR', '', '   ', 'xx', 'api'])('%j → null', (tag) => {
    expect(normalizeLanguageTag(tag)).toBeNull();
  });

  it('null·undefined 는 null', () => {
    expect(normalizeLanguageTag(null)).toBeNull();
    expect(normalizeLanguageTag(undefined)).toBeNull();
  });
});

describe('classifyFirstSegment', () => {
  it.each(['en', 'zh-tw', 'my'])('%s 는 canonical', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'canonical', lang: raw });
  });

  it.each([
    ['KO', 'ko'],
    ['zh', 'zh-cn'],
    ['en-US', 'en'],
    ['fil', 'tl'],
    ['fil-PH', 'tl'],
    ['%6Bo', 'ko'],
    ['%7A%68-tw', 'zh-tw'],
    ['zh_TW', 'zh-tw'],
    ['jp', 'ja'],
  ])('%s 는 variant(%s)', (raw, lang) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'variant', lang });
  });

  it.each([
    'xx', 'fr', 'pt-BR', 'login', 'api', 'ads', 'faq', 'wp-admin', '.env', 'favicon.ico',
    'my-page', 'id-card', 'en-route', 'my_page', '',
  ])('%j 는 other', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'other' });
  });

  it('잘못된 percent-encoding 은 undecodable', () => {
    expect(classifyFirstSegment('%E0%A4%A')).toEqual({ kind: 'undecodable' });
  });
});

describe('resolvePreferredLanguage', () => {
  it('호스트가 같은 Referer 의 정규 언어가 쿠키보다 앞선다', () => {
    expect(
      resolvePreferredLanguage(
        signals({ referer: 'https://www.picnic.fan/th/vote', cookieLocale: 'ja', acceptLanguage: 'ko' }),
      ),
    ).toBe('th');
  });

  it.each([
    ['호스트가 다른 Referer', 'https://evil.example/th/vote'],
    ['정규 언어가 아닌 Referer', 'https://www.picnic.fan/KO/vote'],
    ['언어가 없는 Referer', 'https://www.picnic.fan/login'],
    ['해석할 수 없는 Referer', 'not a url'],
  ])('%s 는 무시하고 쿠키로 간다', (_label, referer) => {
    expect(resolvePreferredLanguage(signals({ referer, cookieLocale: 'ja' }))).toBe('ja');
  });

  it('Host 헤더가 없으면 Referer 를 쓰지 않는다', () => {
    expect(
      resolvePreferredLanguage(signals({ referer: 'https://www.picnic.fan/th/vote', host: null, cookieLocale: 'ja' })),
    ).toBe('ja');
  });

  it('쿠키가 Accept-Language 보다 앞선다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'ja', acceptLanguage: 'ko-KR' }))).toBe('ja');
  });

  it('지원하지 않는 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'xx', acceptLanguage: 'ko-KR' }))).toBe('ko');
  });

  it('Accept-Language 는 q 가 큰 순서, 같으면 적힌 순서로 본다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'fr;q=0.9,ja;q=0.8,ko;q=0.95' }))).toBe('ko');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th,vi' }))).toBe('th');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8' }))).toBe('zh-tw');
  });

  it('q=0, *, 숫자가 아닌 q 의 태그는 버린다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th;q=abc,vi;q=0.3' }))).toBe('vi');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'ko;q=0,*;q=0.9,ja;q=0.1' }))).toBe('ja');
  });

  it('신호가 없으면 en', () => {
    expect(resolvePreferredLanguage(signals())).toBe('en');
  });

  // Review Focus 3: 깨진 헤더는 예외 없이 다음 신호로 넘어간다
  it.each([
    [';;;,,q='],
    [',,,,'],
    ['q=1'],
    [Array.from({ length: 500 }, (_, i) => `x${i};q=0.${i % 10}`).join(',')],
  ])('깨진 Accept-Language 는 en 으로 떨어진다', (acceptLanguage) => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage }))).toBe('en');
  });

  it('깨진 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: '%E0%A4%A', acceptLanguage: 'ko' }))).toBe('ko');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/lib/i18n/locale-routing.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/i18n/locale-routing"`.

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/i18n/locale-routing.ts` 를 만든다.

```ts
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/lib/i18n/locale-routing.test.ts && npx tsc --noEmit`
Expected: 테스트 전부 PASS, tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add lib/i18n/locale-routing.ts __tests__/lib/i18n/locale-routing.test.ts
git commit -m "feat(i18n): add language tag normalization and preferred language resolution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 통과 목록과 `decideLocaleRoute`

**Files:**
- Modify: `lib/i18n/locale-routing.ts` (파일 끝에 추가)
- Test: `__tests__/lib/i18n/locale-routing.test.ts` (파일 끝에 추가)

**Interfaces:**
- Consumes: Task 1 의 `classifyFirstSegment`, `resolvePreferredLanguage`, `LanguageSignals`
- Produces:
  - `AUTH_CALLBACK_PATH: RegExp`, `STATIC_ASSET_PATH: RegExp`, `NON_LOCALIZED_PATH: RegExp`
  - `isPassThroughPath(pathname: string): boolean`
  - `type LocaleRouteDecision = { type: 'pass'; lang: Language | null } | { type: 'redirect'; pathname: string }`
  - `decideLocaleRoute(pathname: string, signals: LanguageSignals): LocaleRouteDecision`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/lib/i18n/locale-routing.test.ts` 의 import 를 아래로 바꾸고, 파일 끝에 블록을 추가한다.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_CALLBACK_PATH,
  classifyFirstSegment,
  decideLocaleRoute,
  isPassThroughPath,
  normalizeLanguageTag,
  resolvePreferredLanguage,
  type LanguageSignals,
} from '@/lib/i18n/locale-routing';
```

```ts
describe('isPassThroughPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    '/auth/callback',
    '/auth/callback/',
    '/auth/callback/google',
    '/auth/loading',
    '/ads/shortform/player',
    '/open-in-browser',
    '/supabase-proxy',
    '/supabase-proxy/rest/v1',
    '/api/banners',
    '/_next/data/x.json',
    '/_next/static/chunks/main.js',
    '/_vercel/insights/script.js',
    '/images/logo.webp',
    '/locales/ko.json',
    '/favicon/favicon.ico',
    '/concert2025/image/logo.png',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-0.xml',
    '/sitemap-42.xml',
    '/manifest.json',
    '/firebase-messaging-sw.js',
  ])('%s 는 통과', (pathname) => {
    expect(isPassThroughPath(pathname)).toBe(true);
  });

  it.each([
    '/auth',
    '/auth/foo',
    '/auth/callback/a/b',
    '/ads',
    '/open-in-browser/x',
    '/api',
    '/sitemap-foo.xml',
    '/sitemap-00.xml',
    '/sitemap-123.xml',
    '/.well-known/x',
    '/favicon.ico/vote',
    '/concert2025',
    '/login',
  ])('%s 는 통과가 아니다', (pathname) => {
    expect(isPassThroughPath(pathname)).toBe(false);
  });

  it('/__nextjs 내부 경로는 개발 서버에서만 통과한다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isPassThroughPath('/__nextjs_foo')).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isPassThroughPath('/__nextjs_foo')).toBe(false);
  });

  it('콜백 모양에 맞는 경로는 모두 통과 목록에 있다 (규칙 2 의 목적지가 통과로 끝나는 조건)', () => {
    for (const pathname of ['/auth/callback', '/auth/callback/', '/auth/callback/apple', '/auth/callback/apple/']) {
      expect(AUTH_CALLBACK_PATH.test(pathname)).toBe(true);
      expect(isPassThroughPath(pathname)).toBe(true);
    }
  });
});

describe('decideLocaleRoute', () => {
  const none = signals();

  it('규칙 1: / 는 통과', () => {
    expect(decideLocaleRoute('/', none)).toEqual({ type: 'pass', lang: null });
  });

  it.each([
    ['/ko/auth/callback/google', '/auth/callback/google'],
    ['/ko/auth/callback', '/auth/callback'],
    ['/zh-tw/auth/callback/apple/', '/auth/callback/apple/'],
  ])('규칙 2: %s 는 언어를 뗀 %s 로', (pathname, expected) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'redirect', pathname: expected });
  });

  it.each([
    ['/ko/vote', 'ko'],
    ['/zh-tw/vote/295', 'zh-tw'],
    ['/ko', 'ko'],
    ['/ko/', 'ko'],
    ['/ko/authx', 'ko'],
    ['/ko/auth/callbackx', 'ko'],
    ['/ko/auth/callback/a/b', 'ko'],
    ['/ko//x', 'ko'],
  ])('규칙 3: %s 는 통과(lang=%s)', (pathname, lang) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'pass', lang });
  });

  it('규칙 4: 디코드할 수 없는 첫 세그먼트는 통과', () => {
    expect(decideLocaleRoute('/%E0%A4%A/vote', none)).toEqual({ type: 'pass', lang: null });
  });

  it.each(['/auth/callback/google', '/open-in-browser', '/supabase-proxy/rest/v1', '/_vercel/insights/script.js'])(
    '규칙 5: %s 는 통과',
    (pathname) => {
      expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'pass', lang: null });
    },
  );

  it.each([
    ['/KO/vote', '/ko/vote'],
    ['/zh/vote', '/zh-cn/vote'],
    ['/zh_TW/rewards', '/zh-tw/rewards'],
    ['/en-US/faq', '/en/faq'],
    ['/jp/vote', '/ja/vote'],
    ['/%6Bo/vote', '/ko/vote'],
    ['/fil-PH/vote', '/tl/vote'],
    ['/KO', '/ko'],
    ['/KO/auth/callback/apple/a/b', '/ko/auth/callback/apple/a/b'],
  ])('규칙 6: 표기 변형 %s → %s', (pathname, expected) => {
    expect(decideLocaleRoute(pathname, signals({ cookieLocale: 'ja' }))).toEqual({
      type: 'redirect',
      pathname: expected,
    });
  });

  it.each([
    '/login', '/download', '/rewards/1', '/vote/295', '/vote', '/mypage', '/concert2025',
    '/xx/rewards', '/fr/vote', '/wp-admin', '/.env', '/auth', '/auth/foo', '/ads', '/open-in-browser/x',
    '/api', '/my-page', '/sitemap-foo.xml', '/.well-known/x', '/auth/callback/google/x', '/favicon.ico/vote',
  ])('규칙 7: %s 는 선호 언어를 붙인다', (pathname) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'redirect', pathname: `/en${pathname}` });
    expect(decideLocaleRoute(pathname, signals({ cookieLocale: 'ja' }))).toEqual({
      type: 'redirect',
      pathname: `/ja${pathname}`,
    });
  });

  // Review Focus 4: 출처를 속이려는 경로도 목적지는 /{정규 언어}/ 아래다
  it.each(['//evil.com/x', '/\\evil.com', '/%2F%2Fevil.com/x', '/%5Cevil.com'])(
    '목적지 %s 는 /en/ 으로 시작한다',
    (pathname) => {
      const decision = decideLocaleRoute(pathname, none);
      expect(decision.type).toBe('redirect');
      expect((decision as { pathname: string }).pathname.startsWith('/en/')).toBe(true);
    },
  );
});

describe('리다이렉트 연쇄', () => {
  // next.config.js redirects() 가운데 이 규칙과 만나는 것만 흉내 낸다
  const LANGUAGE_ROOT = /^\/(en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)$/;
  const nextConfigRedirect = (pathname: string): string | null => {
    if (pathname === '/') return '/en/vote';
    const root = pathname.match(LANGUAGE_ROOT);
    if (root) return `/${root[1]}/vote`;
    if (pathname === '/download.html') return '/download';
    if (pathname === '/privacy_en.html') return '/en/privacy';
    if (pathname === '/privacy_ko.html') return '/ko/privacy';
    if (pathname === '/community') return '/vote';
    return null;
  };

  const follow = (start: string): string[] => {
    const seen = [start];
    let current = start;
    for (let hop = 0; hop < 6; hop += 1) {
      const fromConfig = nextConfigRedirect(current);
      const decision = fromConfig === null ? decideLocaleRoute(current, signals()) : null;
      const next = fromConfig ?? (decision?.type === 'redirect' ? decision.pathname : null);
      if (next === null) return seen;
      if (seen.includes(next)) throw new Error(`loop: ${[...seen, next].join(' → ')}`);
      seen.push(next);
      current = next;
    }
    throw new Error(`too long: ${seen.join(' → ')}`);
  };

  it.each([
    '/', '/ko', '/KO', '/login', '/download', '/download.html', '/privacy_en.html', '/privacy_ko.html',
    '/community', '/vote', '/vote/295', '/mypage', '/concert2025', '/rewards/1', '/xx/rewards', '/fr/vote',
    '/KO/vote', '/zh/vote', '/zh_TW/rewards', '/%6Bo/vote', '/wp-admin', '/.env', '/api', '/auth', '/auth/foo',
    '/auth/callback', '/auth/callback/google', '/auth/callback/google/x', '/ko/auth/callback',
    '/ko/auth/callback/google', '/ko/auth/callback/a/b', '/KO/auth/callback/apple', '/KO/auth/callback/apple/a/b',
    '/open-in-browser', '/open-in-browser/x', '/supabase-proxy/x', '/ko/supabase-proxy/x', '/favicon.ico/vote',
    '/sitemap-1.xml/x', '/.well-known/x', '//evil.com/x', '/my-page',
  ])('%s 는 세 번 안에 끝나고 되돌아오지 않는다', (start) => {
    expect(follow(start).length - 1).toBeLessThanOrEqual(3);
  });

  it('/KO 는 두 번(/ko → /ko/vote), /auth/callback/google/x 는 한 번이다', () => {
    expect(follow('/KO')).toEqual(['/KO', '/ko', '/ko/vote']);
    expect(follow('/auth/callback/google/x')).toEqual(['/auth/callback/google/x', '/en/auth/callback/google/x']);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/lib/i18n/locale-routing.test.ts`
Expected: FAIL — `decideLocaleRoute is not a function` (또는 export 없음).

- [ ] **Step 3: 구현을 추가한다**

`lib/i18n/locale-routing.ts` 끝에 붙인다.

```ts
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/lib/i18n/locale-routing.test.ts && npx tsc --noEmit`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add lib/i18n/locale-routing.ts __tests__/lib/i18n/locale-routing.test.ts
git commit -m "feat(i18n): decide locale routing from the first path segment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: middleware 연결과 matcher

**Files:**
- Modify: `middleware.ts` (전체)
- Create: `__tests__/middleware/locale-routing.test.ts`
- Modify: `__tests__/middleware/locale-headers.test.ts:70-97`, `__tests__/middleware/matcher.test.ts`

**Interfaces:**
- Consumes: `STATIC_ASSET_PATH`, `decideLocaleRoute` from `lib/i18n/locale-routing.ts`
- Produces: `middleware(req: NextRequest): Promise<NextResponse>`, `config.matcher` (다른 Task 의 테스트가 `import { config, middleware } from '@/middleware'` 로 쓴다)

- [ ] **Step 1: 새 실패 테스트를 쓴다**

`__tests__/middleware/locale-routing.test.ts` 를 만든다.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getClaimsMock = vi.fn();
const maybeSingleMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: getClaimsMock, signOut: signOutMock },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }),
}));

import { middleware } from '@/middleware';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const KAKAOTALK_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KAKAOTALK 10.0.0';

const request = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'user-agent': BROWSER_UA, host: 'localhost', ...headers },
  });

/** Location 을 경로+쿼리로 돌려준다. 리다이렉트가 아니면 null. 출처가 요청과 다르면 실패시킨다. */
const locationOf = (res: Response): string | null => {
  const header = res.headers.get('location');
  if (!header) return null;
  const url = new URL(header);
  expect(url.origin).toBe('http://localhost');
  return `${url.pathname}${url.search}`;
};

describe('middleware — 언어 접두어 라우팅', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    getClaimsMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['/', '/?error=x'])('%s 는 리다이렉트하지 않는다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  it('접두어 없는 경로는 선호 언어를 붙이고 쿼리를 보존한다', async () => {
    const res = await middleware(request('/login?error=x'));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('/en/login?error=x');
  });

  it.each([
    ['쿠키', { cookie: 'locale=ja' }, '/ja/login?error=x'],
    ['Accept-Language', { 'accept-language': 'ko-KR,ko;q=0.9' }, '/ko/login?error=x'],
    ['같은 호스트 Referer', { referer: 'http://localhost/th/vote', cookie: 'locale=ja' }, '/th/login?error=x'],
    ['다른 호스트 Referer 는 무시', { referer: 'https://evil.example/th/vote', cookie: 'locale=ja' }, '/ja/login?error=x'],
  ])('선호 언어 신호: %s', async (_label, headers, expected) => {
    expect(locationOf(await middleware(request('/login?error=x', headers)))).toBe(expected);
  });

  it.each(['/download', '/rewards/1', '/mypage/qna', '/vote/295', '/vote', '/mypage', '/concert2025'])(
    '%s → /en%s',
    async (path) => {
      expect(locationOf(await middleware(request(path)))).toBe(`/en${path}`);
    },
  );

  it.each([
    ['/KO/vote?a=1', '/ko/vote?a=1'],
    ['/zh-TW/rewards', '/zh-tw/rewards'],
    ['/zh/vote', '/zh-cn/vote'],
    ['/fil-PH/vote', '/tl/vote'],
    ['/%6Bo/vote', '/ko/vote'],
    ['/%65n/vote', '/en/vote'],
    ['/%7A%68-tw/vote/295', '/zh-tw/vote/295'],
    ['/KO', '/ko'],
  ])('표기 변형 %s → %s', async (path, expected) => {
    const res = await middleware(request(path, { cookie: 'locale=ja' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(expected);
  });

  it.each([
    '/xx/rewards', '/fr/vote', '/wp-admin', '/.env', '/auth', '/auth/foo', '/ads', '/open-in-browser/x',
    '/api', '/my-page', '/sitemap-foo.xml', '/.well-known/x', '/auth/callback/google/x',
  ])('정규 언어가 아닌 %s 는 /en 을 붙인다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBe(`/en${path}`);
  });

  it.each([
    ['/ko/auth/callback/google?code=c', '/auth/callback/google?code=c'],
    ['/ko/auth/callback', '/auth/callback'],
  ])('언어가 붙은 콜백 %s 는 언어를 뗀다', async (path, expected) => {
    const res = await middleware(request(path));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(expected);
  });

  it.each(['/ko/authx', '/ko/auth/callbackx', '/ko/auth/callback/a/b'])('%s 는 통과한다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  it.each([
    '/auth/callback', '/auth/callback/apple', '/auth/loading', '/ads/shortform/player', '/open-in-browser',
    '/supabase-proxy/rest/v1', '/_next/data/x.json', '/_vercel/insights/script.js',
  ])('통과 목록 %s 는 리다이렉트하지 않는다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  describe('리다이렉트 응답', () => {
    it('Cache-Control 은 private, no-store 이고 Set-Cookie 가 없다', async () => {
      const res = await middleware(request('/login'));
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    // Review Focus 1: 세션 쿠키가 있어도 리다이렉트는 세션을 건드리지 않는다
    it('세션 쿠키가 있는 요청도 getClaims·프로필 조회 없이 끝난다', async () => {
      getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
      const res = await middleware(
        request('/mypage/qna', { cookie: 'sb-example-auth-token=base64-abc; locale=ko' }),
      );
      expect(locationOf(res)).toBe('/ko/mypage/qna');
      expect(getClaimsMock).not.toHaveBeenCalled();
      expect(maybeSingleMock).not.toHaveBeenCalled();
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    // Review Focus 2: 쿼리는 한 글자도 바뀌지 않는다
    it('특수문자가 든 쿼리를 그대로 보존한다', async () => {
      const query = '?next=%2Fko%2Fvote&error=a+b&x=%EA%B0%80&empty=&flag';
      expect(locationOf(await middleware(request(`/login${query}`)))).toBe(`/en/login${query}`);
    });

    // Review Focus 5: 메서드를 바꾸는 302·303 이 아니다
    it.each(['POST', 'HEAD', 'PUT'])('%s 도 307 이다', async (method) => {
      const res = await middleware(request('/login', {}, method));
      expect(res.status).toBe(307);
      expect(locationOf(res)).toBe('/en/login');
    });

    it('정규 언어 경로의 POST 는 그대로 통과한다', async () => {
      expect(locationOf(await middleware(request('/ko/login', {}, 'POST')))).toBeNull();
    });

    // Review Focus 4: 출처를 속이려는 경로
    it.each(['//evil.com/x', '/%2F%2Fevil.com/x', '/%5Cevil.com'])('%s 의 Location 은 같은 출처다', async (path) => {
      const res = await middleware(request(path));
      const location = new URL(res.headers.get('location')!);
      expect(location.origin).toBe('http://localhost');
      expect(location.pathname.startsWith('/en/')).toBe(true);
    });
  });

  describe('인앱 브라우저', () => {
    it('접두어 없는 주소는 먼저 정규 주소로 간다', async () => {
      const res = await middleware(request('/login', { 'user-agent': KAKAOTALK_UA }));
      expect(locationOf(res)).toBe('/en/login');
    });

    it('정규 주소가 된 뒤에 안내 페이지로 간다', async () => {
      const res = await middleware(request('/en/login', { 'user-agent': KAKAOTALK_UA }));
      expect(locationOf(res)).toBe('/open-in-browser?returnTo=%2Fen%2Flogin');
    });

    it.each(['/auth/callback/apple', '/open-in-browser', '/_vercel/insights/script.js'])(
      '통과 목록 %s 는 인앱에서도 언어 리다이렉트를 하지 않는다',
      async (path) => {
        const location = locationOf(await middleware(request(path, { 'user-agent': KAKAOTALK_UA })));
        expect(location === null || location.startsWith('/open-in-browser')).toBe(true);
      },
    );
  });

  it('탈퇴 계정이 언어 없는 통과 경로를 요청하면 쿠키 언어의 로그인으로 간다 (현행 순서)', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
    maybeSingleMock.mockResolvedValue({ data: { deleted_at: '2026-09-01T00:00:00Z' } });
    const res = await middleware(request('/auth/loading', { cookie: 'locale=ja' }));
    expect(signOutMock).toHaveBeenCalled();
    expect(locationOf(res)).toBe('/ja/login?error=withdrawn');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/middleware/locale-routing.test.ts`
Expected: FAIL — `/login?error=x` 가 리다이렉트되지 않아 `expected 200 to be 307` 등 다수 실패.

- [ ] **Step 3: middleware 를 고친다**

`middleware.ts` 의 맨 위부터 `export async function middleware` 의 첫 줄(`const res = NextResponse.next(…)`)까지를 아래로 바꾼다. `extractLangFromPath`, `STATIC_ASSET_PATH` 상수, `getPreferredLanguageFromHeader`, `getPreferredLanguage` 는 지운다.

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { STATIC_ASSET_PATH, decideLocaleRoute } from './lib/i18n/locale-routing';

function isLoginPath(pathname: string): boolean {
  // /login, /ko/login, /en/login 등
  return /^\/([a-z]{2}(-[a-z]{2})?\/)?login(\/|$)/i.test(pathname);
}

// 경로 기반 요청 헤더는 middleware 만 만든다 — 클라이언트가 보낸 값은 버린다.
// - x-locale: 경로의 정규 언어. 레이아웃은 더 이상 읽지 않는다(<html lang> 은 [lang] 파라미터로 정한다).
//   서버 컴포넌트가 다시 읽으면 그 페이지는 동적 렌더링이 된다 — 제거는 후속 정리.
// - x-pathname / x-url: 더 이상 읽는 곳이 없다(VoteLite·경로 광고 분기 제거). 예전 코드나
//   서드파티가 신뢰하지 않도록 인바운드 값을 계속 지운다.
const ROUTING_REQUEST_HEADERS = ['x-locale', 'x-pathname', 'x-url'] as const;

function buildForwardedRequestHeaders(req: NextRequest, lang: string | null): Headers {
  const headers = new Headers(req.headers);
  for (const name of ROUTING_REQUEST_HEADERS) {
    headers.delete(name);
  }
  if (lang) {
    headers.set('x-locale', lang);
  }
  return headers;
}

export async function middleware(req: NextRequest) {
  // 언어 접두어 판정을 맨 앞에 둔다(인앱 안내·Supabase·getClaims 보다 먼저).
  // 리다이렉트는 Supabase 가 쿠키를 쓰기 전에 나가므로 옮길 쿠키가 없고, 세션 갱신과 탈퇴 차단은
  // 목적지 요청에서 middleware 가 다시 돌 때 적용된다. 규칙은 lib/i18n/locale-routing.ts 에 있다.
  const decision = decideLocaleRoute(req.nextUrl.pathname, {
    referer: req.headers.get('referer'),
    host: req.headers.get('host'),
    cookieLocale: req.cookies.get('locale')?.value ?? null,
    acceptLanguage: req.headers.get('accept-language'),
  });
  if (decision.type === 'redirect') {
    const url = req.nextUrl.clone();
    url.pathname = decision.pathname; // 쿼리는 그대로 남는다
    // 307: 메서드와 본문을 유지한다. 영구 리다이렉트를 쓰지 않아 롤백이 깨끗하다.
    const redirect = NextResponse.redirect(url, 307);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }

  // Create a response that we can modify cookies on
  const res = NextResponse.next({
    request: { headers: buildForwardedRequestHeaders(req, decision.lang) },
  });
```

탈퇴 차단 분기의 언어 계산 한 줄을 바꾼다(순서는 그대로: 경로의 언어, `locale` 쿠키, 기본 언어).

```ts
            const lang =
              decision.lang ||
              req.cookies.get('locale')?.value ||
              DEFAULT_LANGUAGE;
```

파일 끝의 `config` 를 아래로 바꾼다.

```ts
export const config = {
  // 정적 공개 파일은 middleware 대상에서 제외한다(퍼블릭 우선 서빙).
  // - 루트의 파일은 정확한 이름으로 적는다(끝의 `$`). 이름의 앞부분만 보면 /api, /favicon.ico/vote,
  //   /sitemap-foo.xml 같은 없는 경로가 middleware 를 건너뛰어 [lang] 으로 샌다.
  // - sitemap-N.xml 은 next-sitemap 이 만드는 0–99 만 제외한다.
  // - public/ 자산 디렉터리(/images, /locales, /favicon, /concert2025/image·video)와 /api/ 는 통째로 제외한다.
  //   그 아래의 없는 경로는 app/<디렉터리>/[...slug]/route.ts 가 404 로 받는다.
  // - 확장자로 제외하지 않는다 — /ko/vote/295.json 처럼 확장자가 붙은 [lang] 경로도 페이지다.
  // - matcher 는 정적 분석 대상이라 상수를 참조할 수 없다. lib/i18n/locale-routing.ts 의 STATIC_ASSET_PATH 와
  //   같은 기준을 유지한다(동기화는 __tests__/middleware/pass-through-sync.test.ts).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico$|apple-touch-icon(?:-precomposed)?\\.png$|robots\\.txt$|app-ads\\.txt$|ads\\.txt$|sitemap\\.xml$|sitemap-(?:0|[1-9]\\d?)\\.xml$|(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)/sitemap\\.xml$|manifest\\.json$|site\\.webmanifest$|apple-developer-domain-association\\.txt$|images/|locales/|favicon/|concert2025/(?:image|video)/|firebase-messaging-sw\\.js$|emergency-auth-fix\\.js$).*)",
  ],
};
```

`SUPPORTED_LANGUAGES` import 는 탈퇴 분기의 `redirectLang` 검사가 계속 쓴다. 지우지 않는다.

- [ ] **Step 4: 새 테스트의 통과를 확인한다**

Run: `npx vitest run __tests__/middleware/locale-routing.test.ts`
Expected: 전부 PASS.

- [ ] **Step 5: 바뀌는 기존 사례를 고친다**

`__tests__/middleware/locale-headers.test.ts` 에서 아래 네 블록을 바꾼다.

"percent-encoded 로케일 세그먼트 … x-locale" `it.each` 블록을 지운다(같은 사례가 새 파일의 "표기 변형" 에 307 단언으로 있다).

```ts
  // 삭제:
  // it.each([['/%65n/vote', 'en'], ['/%7A%68-tw/vote/295', 'zh-tw'], ['/%6Bo/vote', 'ko']])(
  //   'percent-encoded 로케일 세그먼트 %s 도 Next 라우팅과 같게 x-locale=%s', …)
```

"로케일이 없는 경로" 와 "지원하지 않는 로케일 접두사" 두 `it` 을 아래로 바꾼다.

```ts
  it('로케일이 없는 경로는 선호 언어 주소로 307 한다 (인바운드 x-locale 은 쓰지 않는다)', async () => {
    const res = await middleware(request('/vote', { 'x-locale': 'ja' }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en/vote');
  });

  it('지원하지 않는 로케일 접두사는 선호 언어를 붙여 307 한다', async () => {
    const res = await middleware(request('/xx/vote', { 'x-locale': 'en' }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en/xx/vote');
  });
```

"잘못된 percent-encoding 세그먼트는 x-locale 없이 통과한다" 와 나머지 사례는 그대로 둔다.

`__tests__/middleware/matcher.test.ts` 를 고친다.

"HTML 경로 … 계속 실행한다" 목록 끝에 추가한다.

```ts
    // 이름의 앞부분만 같은 없는 경로는 middleware 가 실행된다
    '/api',
    '/apiary',
    '/favicon.ico/vote',
    '/favicon.icox',
    '/sitemap-1.xml/x',
    '/sitemap-foo.xml',
    '/sitemap-00.xml',
    '/sitemap-123.xml',
    '/manifest.jsonx',
    '/images',
    '/locales',
    '/.well-known/assetlinks.json',
```

"기존 제외 경로" 목록에서 `'/.well-known/assetlinks.json'` 을 지우고 아래를 추가한다.

```ts
    '/api/vote/123',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/sitemap-42.xml',
    '/ads.txt',
    '/app-ads.txt',
    '/apple-developer-domain-association.txt',
```

"matcher 제외 ⇔ 인앱 redirect 정적 자산 판정" 의 목록에서 언어 규칙 때문에 307 이 되는 두 주소를 정규 언어 주소로 바꾼다(인앱 판정을 계속 확인하기 위해서다).

```ts
    // 변경 전: '/vote/sitemap.xml', '/concert2025'
    '/en/vote/sitemap.xml',
    '/en/concert2025',
```

같은 목록의 `'/.well-known/assetlinks.json'` 은 `'/apple-touch-icon.png'` 로 바꾼다(`.well-known` 은 이제 matcher 가 실행하고 언어 규칙으로 307 이 된다).

- [ ] **Step 6: middleware 테스트 전체와 타입을 확인한다**

Run: `npx vitest run __tests__/middleware && npx tsc --noEmit`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add middleware.ts __tests__/middleware
git commit -m "fix(middleware): redirect unprefixed and non-canonical locale paths with 307

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `[lang]` 레이아웃 가드

**Files:**
- Modify: `app/[lang]/layout.tsx:1-16`, `:103-113`
- Test: `__tests__/app/lang-layout-html.test.tsx`

**Interfaces:**
- Consumes: `isSupportedLanguage(value): value is Language`, `getLanguageTag(lang)` from `app/[lang]/utils/metadata-utils.ts`; `notFound` from `next/navigation`
- Produces: `LanguageLayout` 이 정규 언어가 아닌 `lang` 에 `notFound()` 를 던진다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/app/lang-layout-html.test.tsx` 의 `vi.mock('next/font/google', …)` 위에 추가한다.

```ts
class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
  }
}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));
```

"대소문자가 섞인 세그먼트는 정규화한다" 와 "지원하지 않는 세그먼트 %s 는 ko 로 폴백한다" 두 테스트를 아래 하나로 바꾼다.

```ts
  // middleware 를 거치지 않는 요청(/_next/rewards, /sitemap-1.xml)의 마지막 방어선.
  // 표기 변형(ZH-TW)도 middleware 가 정규 주소로 보내므로 여기서는 404 다.
  it.each(['ZH-TW', 'xx', 'login', '_next', 'sitemap-1.xml', '"><script>'])(
    '정규 언어가 아닌 세그먼트 %s 는 notFound 다',
    async (lang) => {
      await expect(render(lang)).rejects.toBeInstanceOf(NotFoundSignal);
    },
  );
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/app/lang-layout-html.test.tsx`
Expected: FAIL — `promise resolved … instead of rejecting` (6건).

- [ ] **Step 3: 가드를 넣는다**

`app/[lang]/layout.tsx` 의 import 를 고친다.

```tsx
import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import './globals.css';
```

```tsx
import {
  DEFAULT_METADATA,
  brandMetadata,
  brandName,
  getLanguageTag,
  getOpenGraphLocale,
  isSupportedLanguage,
  siteDescription,
} from './utils/metadata-utils';
```

`LanguageLayout` 본문의 처음 세 줄을 바꾼다.

```tsx
  const { lang } = await paramsPromise;
  // middleware 를 거치지 않는 요청의 마지막 방어선(matcher 가 건너뛰는 /_next/…, 없는 /sitemap-N.xml).
  // 정규 언어가 아닌 세그먼트는 [lang] 페이지로 렌더하지 않는다. 표기 변형은 middleware 가 정규 주소로 보낸다.
  if (!isSupportedLanguage(lang)) notFound();
  const htmlLang = getLanguageTag(lang) ?? lang;
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/app && npx tsc --noEmit`
Expected: 전부 PASS(12개 언어의 `<html lang>` 사례 포함), tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add "app/[lang]/layout.tsx" __tests__/app/lang-layout-html.test.tsx
git commit -m "fix(layout): return notFound for non-canonical language segments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: catch-all 404 handler, next.config, 루트 아이콘

**Files:**
- Create: `app/api/[...slug]/route.ts`, `app/images/[...slug]/route.ts`, `app/locales/[...slug]/route.ts`, `app/favicon/[...slug]/route.ts`, `app/concert2025/[...slug]/route.ts`
- Create: `public/favicon.ico`, `public/apple-touch-icon.png`, `public/apple-touch-icon-precomposed.png`
- Modify: `next.config.js:170-181` (redirects), `:218` (rewrites)
- Test: `__tests__/app/catch-all-not-found.test.ts` (새 파일), `__tests__/next-config-redirects.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 다섯 route 모듈이 각각 `GET(): Response` (404, `text/plain`)를 export 한다. Task 6 의 동기화 테스트가 이 파일들의 존재를 확인한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/app/catch-all-not-found.test.ts` 를 만든다.

```ts
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * matcher 가 제외하는 디렉터리와 api/ 아래의 없는 경로는 middleware 를 거치지 않는다.
 * catch-all handler 가 없으면 /images/rewards 같은 주소가 [lang]=images 로 렌더되고 ISR 항목이 된다.
 * public/ 파일과 실제 route 는 Next 가 동적 route 보다 먼저 맞추므로 영향을 받지 않는다.
 */
const DIRECTORIES = ['api', 'images', 'locales', 'favicon', 'concert2025'] as const;

describe('catch-all 404 handler', () => {
  it.each(DIRECTORIES)('app/%s/[...slug]/route.ts 의 GET 은 404 텍스트다', async (directory) => {
    const { GET } = await import(`@/app/${directory}/[...slug]/route`);
    const res: Response = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('Not Found');
  });

  it.each(['favicon.ico', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png'])(
    'public/%s 가 있다 (브라우저가 스스로 요청하는 루트 아이콘)',
    (file) => {
      const stat = fs.statSync(path.join(process.cwd(), 'public', file));
      expect(stat.size).toBeGreaterThan(0);
    },
  );
});
```

`__tests__/next-config-redirects.test.ts` 의 `NextConfig` 타입에 `rewrites` 를 더하고, 첫 `describe` 끝에 테스트 세 개를 추가한다.

```ts
type NextConfig = {
  redirects: () => Promise<Redirect[]>;
  rewrites: () => Promise<Array<{ source: string; destination: string }>>;
  experimental?: { staticGenerationRetryCount?: number };
  staticPageGenerationTimeout?: number;
};
```

```ts
  it.each([
    ['/privacy_en.html', '/en/privacy'],
    ['/privacy_ko.html', '/ko/privacy'],
  ])('옛 개인정보 주소 %s 를 %s 로 보낸다', async (source, destination) => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('영구 리다이렉트가 하나도 없다 (Instant Rollback 으로 완전히 되돌릴 수 있어야 한다)', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    expect(redirects.filter((redirect) => redirect.permanent !== false)).toEqual([]);
  });

  it('언어가 붙은 supabase-proxy rewrite 는 정규 언어 12개만 받는다', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const rewrites = await config.rewrites();
    const localized = rewrites.filter(({ source }) => source.startsWith('/:lang') && source.includes('supabase-proxy'));

    expect(localized).toHaveLength(1);
    const match = localized[0].source.match(/^\/:lang\(([^)]+)\)\/supabase-proxy\/:path\*$/);
    expect(match).not.toBeNull();
    expect(match?.[1].split('|')).toEqual([...SUPPORTED_LANGUAGES]);
    expect(rewrites.map(({ source }) => source)).toContain('/supabase-proxy/:path*');
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/app/catch-all-not-found.test.ts __tests__/next-config-redirects.test.ts`
Expected: FAIL — handler import 실패 5건, 아이콘 `ENOENT` 3건, 개인정보 리다이렉트 2건, rewrite 1건. "영구 리다이렉트가 하나도 없다" 는 이미 통과한다.

- [ ] **Step 3: handler 다섯 개를 만든다**

다섯 파일 모두 같은 내용이다. 주석의 디렉터리 이름만 다르다. `app/api/[...slug]/route.ts`:

```ts
// /api/ 아래의 없는 경로. matcher 가 /api/ 를 통째로 제외하므로 middleware 를 거치지 않는다.
// 이 handler 가 없으면 /api/rewards 같은 주소가 [lang]=api 페이지로 렌더되고 ISR 항목이 된다.
// 실제 route(app/api/**/route.ts)는 Next 가 먼저 맞춘다.
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
```

`app/images/[...slug]/route.ts`, `app/locales/[...slug]/route.ts`, `app/favicon/[...slug]/route.ts`:

```ts
// public/<이 디렉터리>/ 아래의 없는 경로. matcher 가 이 디렉터리를 통째로 제외하므로 middleware 를 거치지 않는다.
// 이 handler 가 없으면 /images/rewards 같은 주소가 [lang] 페이지로 렌더되고 ISR 항목이 된다.
// 실제 파일(public/)은 Next 가 먼저 맞춘다.
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
```

`app/concert2025/[...slug]/route.ts`:

```ts
// /concert2025/ 아래의 없는 경로. matcher 는 /concert2025/image/, /concert2025/video/ 를 제외한다.
// 그 아래의 없는 파일이 [lang]=concert2025 페이지로 렌더되지 않게 한다. 실제 파일(public/concert2025/)이 먼저 맞는다.
// /concert2025 자체는 (bare) 페이지이고 이 handler 와 겹치지 않는다(slug 는 한 세그먼트 이상).
export function GET() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
```

- [ ] **Step 4: 루트 아이콘을 복사한다**

```bash
cp public/favicon/favicon.ico public/favicon.ico
cp public/favicon/apple-touch-icon.png public/apple-touch-icon.png
cp public/favicon/apple-touch-icon.png public/apple-touch-icon-precomposed.png
ls -la public/favicon.ico public/apple-touch-icon.png public/apple-touch-icon-precomposed.png
```

Expected: 세 파일 모두 0 바이트보다 크다.

- [ ] **Step 5: next.config.js 를 고친다**

`redirects()` 의 `/:lang/download.html` 항목 바로 뒤(레거시 서비스 경로 주석 앞)에 추가한다.

```js
      // Play 스토어에 등록된 옛 개인정보처리방침 주소
      { source: '/privacy_en.html', destination: '/en/privacy', permanent: false },
      { source: '/privacy_ko.html', destination: '/ko/privacy', permanent: false },
```

`rewrites()` 의 두 번째 항목 source 를 바꾼다.

```js
      {
        // :lang 을 정규 언어로 제한한다. 제한이 없으면 /images/supabase-proxy/… 같은 주소가
        // catch-all handler 에 닿기 전에 Supabase 로 프록시된다(afterFiles rewrite 가 동적 라우트보다 먼저다).
        source: '/:lang(en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)/supabase-proxy/:path*',
        destination: 'https://xtijtefcycoeqludlngc.supabase.co/:path*'
      }
```

`headers()` 의 `/:lang/supabase-proxy/:path*` 는 바꾸지 않는다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run __tests__/app/catch-all-not-found.test.ts __tests__/next-config-redirects.test.ts && npx tsc --noEmit`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add app/api/\[...slug\] app/images app/locales app/favicon app/concert2025 public/favicon.ico public/apple-touch-icon.png public/apple-touch-icon-precomposed.png next.config.js __tests__/app/catch-all-not-found.test.ts __tests__/next-config-redirects.test.ts
git status --short   # 위 경로만 스테이징됐는지 확인
git commit -m "fix(routing): add catch-all 404 handlers, root icons and legacy privacy redirects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 통과 목록 동기화 테스트와 referrer 정책

**Files:**
- Create: `__tests__/middleware/pass-through-sync.test.ts`
- Modify: `__tests__/app/metadata-utils.test.ts` (끝에 추가)

**Interfaces:**
- Consumes: `config` from `@/middleware`; `isPassThroughPath`, `classifyFirstSegment`, `decideLocaleRoute`, `AUTH_CALLBACK_PATH` from `@/lib/i18n/locale-routing`; `DEFAULT_METADATA` from `@/app/[lang]/utils/metadata-utils`; `unstable_doesMiddlewareMatch` from `next/experimental/testing/server`
- Produces: 없음(테스트만)

이 Task 의 테스트는 앞 Task 들이 맞게 됐다면 처음부터 통과한다. 통과 목록·matcher·파일시스템이 어긋나는 순간 실패하도록 고정하는 것이 목적이다. 그래서 Step 2 에서 일부러 어긋나게 만들어 실패를 본다.

- [ ] **Step 1: 테스트를 쓴다**

`__tests__/middleware/pass-through-sync.test.ts` 를 만든다.

```ts
import { execSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { config } from '@/middleware';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import {
  AUTH_CALLBACK_PATH,
  classifyFirstSegment,
  decideLocaleRoute,
  isPassThroughPath,
} from '@/lib/i18n/locale-routing';

/**
 * 통과 목록과 matcher 는 손으로 적는 목록이다. 파일시스템과 어긋나면 실제 경로가 /{언어}/… 로 가서 404 가 된다.
 * 여기서 파일시스템을 읽어 대조한다. 새 public 파일·API route·(bare) 페이지를 추가했는데 이 테스트가 실패하면
 * middleware 의 matcher 와 lib/i18n/locale-routing.ts 의 통과 목록에 그 경로를 넣는다.
 */
const root = process.cwd();
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
const passes = (pathname: string) =>
  decideLocaleRoute(pathname, { referer: null, host: null, cookieLocale: null, acceptLanguage: null }).type === 'pass';

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/** app 아래 파일 경로를 URL 로 바꾼다: 라우트 그룹 괄호를 벗기고 동적 세그먼트를 표본 값으로 채운다. */
const toUrl = (file: string, base: string, dynamicSample: (name: string) => string) =>
  '/' +
  path
    .relative(base, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .map((segment) => {
      const dynamic = segment.match(/^\[(?:\.\.\.)?(.+)\]$/);
      return dynamic ? dynamicSample(dynamic[1]) : segment;
    })
    .join('/');

const publicFiles = execSync('git ls-files public', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map((file) => `/${file.slice('public/'.length)}`);

const CATCH_ALL_DIRECTORIES = ['api', 'images', 'locales', 'favicon', 'concert2025'];
const REDIRECT_STUBS = ['/vote', '/vote/x', '/mypage', '/concert2025'];

describe('통과 목록 ⇔ 파일시스템', () => {
  it('git 이 추적하는 public 파일이 있다', () => {
    expect(publicFiles.length).toBeGreaterThan(50);
    expect(publicFiles).toContain('/favicon.ico');
    expect(publicFiles).toContain('/apple-touch-icon.png');
    expect(publicFiles).toContain('/apple-touch-icon-precomposed.png');
  });

  it('public 의 모든 파일은 matcher 가 제외하고 통과 목록에 있다', () => {
    const notExcluded = publicFiles.filter((url) => matches(encodeURI(url)));
    const notPassing = publicFiles.filter((url) => !isPassThroughPath(url));
    expect(notExcluded).toEqual([]);
    expect(notPassing).toEqual([]);
  });

  it('app/api 의 모든 route 는 matcher 가 제외한다', () => {
    const apiRoutes = walk(path.join(root, 'app/api'))
      .filter((file) => path.basename(file) === 'route.ts')
      .map((file) => toUrl(file, path.join(root, 'app'), () => 'x'));
    expect(apiRoutes.length).toBeGreaterThan(20);
    expect(apiRoutes.filter((url) => matches(url))).toEqual([]);
  });

  it('(bare) 의 페이지는 통과 목록에 있거나 리다이렉트 스텁이다', () => {
    const barePages = walk(path.join(root, 'app/(bare)'))
      .filter((file) => path.basename(file) === 'page.tsx')
      .map((file) => toUrl(file, path.join(root, 'app'), (name) => (name === 'provider' ? 'google' : 'x')));
    expect(barePages.length).toBeGreaterThanOrEqual(8);
    const unexpected = barePages.filter((url) => !passes(url) && !REDIRECT_STUBS.includes(url));
    expect(unexpected).toEqual([]);
    // 스텁은 통과 목록에 없다 — middleware 가 먼저 선호 언어로 보낸다
    expect(REDIRECT_STUBS.filter((url) => passes(url))).toEqual([]);
  });

  it('app/ 바로 아래의 route handler 와 메타데이터 라우트가 통과한다', () => {
    expect(fs.existsSync(path.join(root, 'app/open-in-browser/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'app/sitemap.ts'))).toBe(true);
    expect(passes('/open-in-browser')).toBe(true);
    expect(matches('/sitemap.xml')).toBe(false);
    expect(isPassThroughPath('/sitemap.xml')).toBe(true);
  });

  it('next.config rewrites 의 source 가 통과한다', async () => {
    const require = createRequire(import.meta.url);
    const nextConfig = require(path.join(root, 'next.config.js')) as {
      rewrites: () => Promise<Array<{ source: string }>>;
    };
    const sources = (await nextConfig.rewrites()).map(({ source }) => source);
    expect(sources).toHaveLength(2);
    expect(passes('/supabase-proxy/x')).toBe(true);
    for (const lang of SUPPORTED_LANGUAGES) expect(passes(`/${lang}/supabase-proxy/x`)).toBe(true);
    expect(passes('/xx/supabase-proxy/x')).toBe(false);
  });

  it.each([
    '/api', '/apiary', '/favicon.ico/vote', '/sitemap-1.xml/x', '/sitemap-foo.xml', '/sitemap-00.xml',
    '/sitemap-123.xml', '/manifest.jsonx', '/favicon.icox', '/images', '/locales',
  ])('이름이 비슷한 없는 경로 %s 는 middleware 가 실행된다', (url) => {
    expect(matches(url)).toBe(true);
  });

  it('[lang] 아래 페이지의 첫 세그먼트는 언어로 오인되지 않는다', () => {
    const firstSegments = new Set(
      walk(path.join(root, 'app/[lang]'))
        .filter((file) => path.basename(file) === 'page.tsx')
        .map((file) => toUrl(file, path.join(root, 'app/[lang]'), () => 'x').split('/')[1])
        .filter(Boolean),
    );
    expect(firstSegments.size).toBeGreaterThan(8);
    const misread = [...firstSegments].filter((segment) => classifyFirstSegment(segment).kind !== 'other');
    expect(misread).toEqual([]);
  });

  it('콜백 모양에 맞는 경로는 모두 통과 목록에 있다', () => {
    for (const pathname of ['/auth/callback', '/auth/callback/', '/auth/callback/google', '/auth/callback/google/']) {
      expect(AUTH_CALLBACK_PATH.test(pathname)).toBe(true);
      expect(isPassThroughPath(pathname)).toBe(true);
    }
  });

  it('matcher 가 제외하는 디렉터리마다 catch-all handler 가 있고, 그 밖의 catch-all handler 는 없다', () => {
    for (const directory of CATCH_ALL_DIRECTORIES) {
      expect(fs.existsSync(path.join(root, 'app', directory, '[...slug]', 'route.ts'))).toBe(true);
    }
    const topLevelCatchAlls = fs
      .readdirSync(path.join(root, 'app'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(root, 'app', entry.name, '[...slug]', 'route.ts')))
      .map((entry) => entry.name)
      .sort();
    expect(topLevelCatchAlls).toEqual([...CATCH_ALL_DIRECTORIES].sort());

    // 각 디렉터리 아래의 없는 경로는 middleware 를 건너뛴다(그래서 handler 가 받는다)
    for (const url of ['/api/rewards', '/images/rewards/1', '/locales/faq', '/favicon/notice/1', '/concert2025/image/x.png']) {
      expect(matches(url)).toBe(false);
    }
  });
});
```

`__tests__/app/metadata-utils.test.ts` 끝에 추가한다. 파일에 `DEFAULT_METADATA` import 가 없으면 기존 `@/app/[lang]/utils/metadata-utils` import 에 더한다.

```ts
/**
 * 사이트 안의 접두어 없는 이동(/vote/:id 등)은 Referer 의 언어로 도착한다(lib/i18n/locale-routing.ts).
 * 같은 출처 요청에 전체 주소를 보내는 정책이어야 한다. origin·strict-origin·no-referrer 로 바꾸면
 * 그 신호가 조용히 사라져 보던 언어와 다른 언어로 간다.
 */
describe('referrer 정책', () => {
  it('같은 출처 요청에 전체 주소를 보내는 값이다', () => {
    expect([
      'origin-when-cross-origin',
      'strict-origin-when-cross-origin',
      'no-referrer-when-downgrade',
      'same-origin',
      'unsafe-url',
    ]).toContain(DEFAULT_METADATA.referrer);
  });
});
```

- [ ] **Step 2: 통과를 확인하고, 어긋나면 실패하는지 본다**

Run: `npx vitest run __tests__/middleware/pass-through-sync.test.ts __tests__/app/metadata-utils.test.ts`
Expected: 전부 PASS.

실패 확인(되돌릴 변경):

```bash
touch public/probe-unlisted.txt && git add -N public/probe-unlisted.txt
npx vitest run __tests__/middleware/pass-through-sync.test.ts 2>&1 | grep -E "×|Tests "
git reset -q public/probe-unlisted.txt && rm public/probe-unlisted.txt
```

Expected: "public 의 모든 파일은 matcher 가 제외하고 통과 목록에 있다" 가 FAIL(`/probe-unlisted.txt`). 파일을 지운 뒤 다시 돌리면 PASS.

- [ ] **Step 3: 전체 검증**

Run: `npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL"`
Expected: tsc 0, `No ESLint warnings or errors`, 전체 PASS(결제의 expected fail 6건은 그대로).

- [ ] **Step 4: 커밋**

```bash
git add __tests__/middleware/pass-through-sync.test.ts __tests__/app/metadata-utils.test.ts
git commit -m "test(routing): pin the pass-through list and matcher to the filesystem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 로컬 통합 확인, 주석·문서 정리, PR

**Files:**
- Modify: `app/(bare)/vote/page.tsx`, `app/(bare)/vote/[id]/page.tsx`, `app/(bare)/mypage/page.tsx`, `app/(bare)/concert2025/page.tsx` (주석만)
- Modify: `__tests__/app/unprefixed-redirect-stubs.test.tsx` (설명 주석만), `scripts/rendering-modes.js:66` (주석만)
- Modify: `docs/superpowers/specs/2026-10-01-locale-prefix-routing-design.md` (상태 줄, §9), `docs/audit-2026-09-26/plan.md` (§5.4 후속 줄)

**Interfaces:**
- Consumes: Task 1~6 의 결과 전체
- Produces: PR. 머지는 하지 않는다

- [ ] **Step 1: 스텁의 주석을 고친다 (동작은 그대로)**

네 스텁 파일의 `redirect(…)` 위 주석을 아래로 바꾼다. `app/(bare)/vote/page.tsx`:

```tsx
  // 정상 흐름에서는 닿지 않는다 — middleware 가 접두어 없는 /vote 를 선호 언어 주소로 먼저 보낸다
  // (lib/i18n/locale-routing.ts). middleware 를 거치지 않은 요청을 위한 안전망으로 남겨 둔다.
  redirect(`/${DEFAULT_LANGUAGE}/vote`);
```

나머지 세 파일도 같은 두 줄 주석을 경로 이름만 바꿔 넣는다(`/vote/:id`, `/mypage`, `/concert2025`). `redirect` 호출은 건드리지 않는다.

`scripts/rendering-modes.js` 의 `(bare)` 구역 주석을 고친다.

```js
  // ── app/(bare): 언어 세그먼트 밖 ─────────────────────────────────────────────
  // redirect 스텁 넷은 정상 흐름에서 닿지 않는다(middleware 가 먼저 선호 언어로 보낸다). 첫 배포에서는 남겨 둔다.
```

`__tests__/app/unprefixed-redirect-stubs.test.tsx` 의 첫 `describe` 위에 설명을 더한다(단언은 그대로).

```ts
// 이 스텁들은 middleware 를 거치지 않은 요청의 안전망이다. 정상 요청은 middleware 가 먼저
// /{선호 언어}/… 로 보낸다(__tests__/middleware/locale-routing.test.ts). 여기서는 스텁 자체의 동작만 고정한다.
```

Run: `npx vitest run __tests__/app/unprefixed-redirect-stubs.test.tsx __tests__/app/rendering-mode-contract.test.ts`
Expected: PASS(동작 불변).

- [ ] **Step 2: 빌드한다**

```bash
SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= npm run build 2>&1 | tail -25
git status --short    # public/sitemap*.xml 이 바뀌었으면 git checkout -- public/sitemap.xml public/sitemap-0.xml
```

Expected: 빌드 성공, `verify-rendering-modes` 통과(프리렌더 39, 온디맨드 10 — 설계 §4.5 의 프로브와 같은 수). 수가 다르면 멈추고 보고한다. 빌드가 생성한 sitemap 파일 변경은 커밋하지 않는다.

- [ ] **Step 3: `next start` 로 설계 §2·§5.5 의 표를 확인한다**

```bash
(SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= npx next start -p 3271 > /tmp/locale-prefix-start.log 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:3271/en/vote; do sleep 2; done
B=http://127.0.0.1:3271
check() { printf '%-46s ' "$1"; curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "${@:2}" "$B$1"; }

check '/login?error=x'            # 307 …/en/login?error=x
check /download                   # 307 …/en/download
check /rewards/1                  # 307 …/en/rewards/1
check /vote/295                   # 307 …/en/vote/295
check /xx/rewards                 # 307 …/en/xx/rewards
check /KO/vote                    # 307 …/ko/vote
check /zh/vote                    # 307 …/zh-cn/vote
check /%6Bo/vote                  # 307 …/ko/vote
check /KO                         # 307 …/ko
check /api                        # 307 …/en/api
check /favicon.ico                # 200
check /apple-touch-icon.png       # 200
check /privacy_en.html            # 307 …/en/privacy
check /download.html              # 307 …/download
check /sitemap-1.xml              # 404 (가드)
check /_next/rewards              # 404 (가드)
check /images/rewards/1           # 404 (handler)
check /api/rewards                # 404 (handler)
check /locales/faq                # 404 (handler)
check /images/sitemap.xml         # 404 (handler)
check /.well-known/rewards        # 307 …/en/.well-known/rewards
check /ko/auth/callback/google    # 307 …/auth/callback/google
check /images/supabase-proxy/auth/v1/health   # 404 (handler)
check /en/xx/rewards              # 404
check /en/login                   # 200
check /ko/vote                    # 200
check /ko/rewards                 # 200
check /images/default-artist.png  # 200
check /locales/en.json            # 200
check /api/banners                # 200
check /robots.txt                 # 200
check /ko/sitemap.xml             # 200
check /open-in-browser            # 308 (기존 route handler)
check /login -H 'Cookie: locale=ja'                                  # 307 …/ja/login
check /login -H 'Accept-Language: ko-KR'                             # 307 …/ko/login
check /login -H 'Referer: http://127.0.0.1:3271/th/vote'             # 307 …/th/login
check /login -X POST                                                 # 307 …/en/login
curl -sI "$B/login" | grep -i '^cache-control'                       # cache-control: private, no-store
curl -s -o /dev/null -w '%{http_code} %{header_json}\n' "$B/en/xx/rewards" | grep -o '"x-nextjs-cache":\[[^]]*\]'   # HIT (정적 404)
curl -s "$B/images/rewards/1"                                        # Not Found
grep -c "Could not load translations for images\|Could not load translations for api" /tmp/locale-prefix-start.log   # 0
pkill -f "next start -p 3271"
```

Expected: 각 줄의 주석과 같은 상태·Location. 하나라도 다르면 원인을 찾아 고치고(해당 Task 의 테스트를 먼저 추가한다) 다시 확인한다. `/ko/supabase-proxy/auth/v1/health` 는 Supabase 로 프록시되므로(401) 로컬에서 한 번만 확인한다.

- [ ] **Step 4: 문서를 갱신한다**

설계서 상단의 상태 줄을 바꾼다.

```markdown
- 상태: 승인(2026-10-01). 초안 5 를 사용자가 승인했고 §9 의 확인 1~3 을 받아들였다(Referer 신호 채택, `/_next/`·`/_vercel/` 와 `/sitemap-N.xml` 의 남는 구멍 수용, 인앱 브라우저의 이동 1회 증가 수용). 4번(외부 등록 주소)은 추가로 알려진 주소가 없다. 구현 계획: `docs/superpowers/plans/2026-10-01-locale-prefix-routing.md`
```

설계서 §9 의 "확인이 필요한 것" 제목을 "확인 결과(2026-10-01 승인)" 로 바꾼다. 항목 내용은 그대로 둔다.

`docs/audit-2026-09-26/plan.md` §5.4 의 "후속(위 설계 §7)" 줄에서 아래 구절을 바꾼다.

```markdown
변경 전: (**배포 후 실측: `/xx/rewards`·`/login`·`/wp-admin` 이 ISR 항목으로 캐시됨 — 다음 작업으로 설계 착수**)
변경 후: (**구현 PR 진행 중 — 설계 `docs/superpowers/specs/2026-10-01-locale-prefix-routing-design.md`, 계획 `docs/superpowers/plans/2026-10-01-locale-prefix-routing.md`**)
```

- [ ] **Step 5: 최종 검증과 커밋**

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL"
git status --short --untracked-files=all
git add "app/(bare)" scripts/rendering-modes.js __tests__/app/unprefixed-redirect-stubs.test.tsx docs/superpowers docs/audit-2026-09-26/plan.md
git commit -m "docs(i18n): record locale prefix routing approval and note the stubs as a fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: 전부 통과, 작업 트리에 이 Task 의 파일만 남는다.

- [ ] **Step 6: push 하고 PR 을 만든다 (머지하지 않는다)**

```bash
git push -u origin fix/locale-prefix-routing --force-with-lease
gh pr create --base main --head fix/locale-prefix-routing \
  --title "fix(routing): 언어 접두어 없는 주소와 표기 변형을 307 로 정규 주소에 보낸다" \
  --body-file /tmp/pr-locale-prefix.md
```

PR 본문(`/tmp/pr-locale-prefix.md`)에는 다음을 적는다: 설계서·계획서 경로, 설계 §2 의 "지금 → 변경 후" 표 요약, Step 3 의 로컬 확인 결과(상태·Location 전체), 테스트 수, 머지 직후 확인할 것(설계 §6.2 의 목록), 롤백 신호(설계 §6.3), 고위험이라 Codex gpt-6-sol/high 교차 리뷰가 필요하다는 것. 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

PR 을 만든 뒤 Vercel Preview 코멘트를 최대 8회 × 20초 확인한다(이 레포는 Preview 가 없어 보통 생기지 않는다).

- [ ] **Step 7: 교차 리뷰와 머지 전 기준선 (조정자가 수행)**

- 교차 리뷰: `usage-aware-orchestration` 의 설치된 절차(`ROUTER_CLAUDE_SOURCE=auto route-fresh.sh claude-heavy high auto auto` → capability → `build-launch.sh reviewer` → `/status` 확인)로 Codex gpt-6-sol/high 읽기 전용 리뷰어를 띄운다. 리뷰어에게는 설계서, diff, 테스트 결과만 준다. 지적은 테스트로 확인한 뒤 고치거나 반박하고 같은 리뷰어가 재검증한다.
- 머지 직전: 설계 §6.2 의 Production 기준선(통과 목록 13개, `/login`·`/download`·`/xx/rewards`·`/favicon.ico` 의 현재 응답, ISR HIT 점검)을 찍어 둔다.
- 머지와 배포 뒤 확인(§6.2), 24시간 뒤 지표(§6.4)는 사용자 승인 뒤에 한다.

---

## Self-Review

**1. 설계 범위 대조**

| 설계 | Task |
|---|---|
| §4.1 규칙 1~7, §4.2 언어 결정 | 1, 2 |
| §4.3 middleware 구조·정리 | 3 |
| §4.4 통과 목록·matcher | 2(목록), 3(matcher), 6(동기화) |
| §4.5 레이아웃 가드 | 4 |
| §4.6 리다이렉트 2줄·아이콘 3개·catch-all 5개·rewrite 제한 | 5 |
| §4.7 바꾸지 않는 것 | Global Constraints, Task 7 Step 1(주석만) |
| §5.1 단위·연쇄·목적지 테스트 | 1, 2 |
| §5.2 middleware 사례·바뀌는 기존 사례 | 3 |
| §5.3 동기화 테스트 | 6 |
| §5.4 레이아웃·matcher·next.config·스텁·handler·referrer | 4, 3, 5, 7, 5, 6 |
| §5.5 로컬 통합 확인 | 7 Step 2~3 |
| §6.1 PR 하나·고위험 교차 리뷰 | 7 Step 6~7 |
| §6.2~§6.4 머지 전후 확인·롤백·지표 | 7 Step 7(기준선). 머지 뒤 확인은 사용자 승인 뒤 |
| §7 범위 밖(쿠키 버그 PR, 홈 `/` 전환 등) | 이 계획에 없음(의도) |

Playwright 브라우저 확인(§5.5 의 `router.push`·`window.location.href`·오류 안내)은 설계 §8 이 프로브로 이미 확인한 동작이라 이 계획의 자동 단계에 넣지 않았다. 머지 뒤 Production 확인(§6.2 의 "클라이언트 내비게이션")에서 본다.

**2. 자리표시자 검사** — "TBD", "적절히", "위와 비슷하게" 없음. 다섯 handler 의 코드를 모두 적었다. PR 본문은 항목을 지정했다(실제 확인 결과가 들어가야 해서 본문 전체를 미리 쓸 수 없다).

**3. 타입 일관성** — `LanguageSignals`(Task 1) 를 Task 2·3·6 이 같은 필드 이름(`referer`, `host`, `cookieLocale`, `acceptLanguage`)으로 쓴다. `decideLocaleRoute` 의 반환(`{ type: 'pass', lang }` / `{ type: 'redirect', pathname }`)을 Task 3 의 middleware 와 Task 6 의 `passes()` 가 같은 모양으로 읽는다. `STATIC_ASSET_PATH` 는 Task 2 가 만들고 Task 3 의 middleware 가 import 한다.

**4. Review Focus** — 다섯 줄 모두 테스트가 있다: 1·2·5 는 Task 3 의 "리다이렉트 응답" 블록, 3 은 Task 1 의 "깨진 Accept-Language"·"깨진 쿠키", 4 는 Task 2 의 "목적지 … /en/ 으로 시작" 과 Task 3 의 "Location 은 같은 출처다".
