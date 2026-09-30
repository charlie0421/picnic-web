# 루트 레이아웃 `headers()` 제거와 ISR 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 루트 레이아웃의 `headers()` 를 없애 공개 페이지가 ISR/CDN 캐시를 타게 하고, rewards/faq/notice 를 ISR 로 전환하되 어떤 페이지도 의도치 않게 영구 정적으로 굳지 않게 한다.

**Architecture:** `app/layout.tsx` 는 children 만 반환하는 pass-through 가 되고 `app/[lang]/layout.tsx` 가 `<html lang>`·`<body>` 를 소유한다. `[lang]` 밖 페이지는 `app/(bare)/` 그룹의 최소 레이아웃으로 옮기고, 리다이렉트 스텁은 `next.config.js` 로 옮긴다. 레이아웃을 뒤집기 전에 (1) 프리렌더를 깨는 `useSearchParams` 를 걷어내고 (2) 데이터 서비스를 쿠키 없는 공개 클라이언트로 바꾸고 (3) 모든 페이지의 렌더링 모드를 명시해 계약 테스트로 고정한다.

**Tech Stack:** Next.js 15.5 App Router, React 18.3.1, TypeScript, Supabase(`@supabase/supabase-js` 공개 클라이언트), vitest + jsdom, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-30-root-layout-isr-design.md`

## Global Constraints

- 작업 위치: 워크트리 `~/Repositories/picnic-web-root-layout-isr`, 브랜치 `refactor/root-layout-isr`. 메인 폴더에서 작업하지 않는다.
- 빌드는 반드시 `npx next build`. `npm run build` 는 pre/post 훅(gen:types, next-sitemap)이 있어 쓰지 않는다.
- 검증 4종: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npx next build`.
- DB 스키마·마이그레이션 변경 금지(스키마 소유자는 picnic-supabase).
- `<html>` 을 렌더하는 파일은 정확히 네 개다: `app/[lang]/layout.tsx`, `app/(bare)/layout.tsx`, `app/not-found.tsx`, `app/global-error.tsx`.
- `<html lang>` 매핑은 `getLanguageTag(lang.toLowerCase()) ?? 'ko'` (`zh-cn → zh-CN`, `zh-tw → zh-TW`).
- ISR 주기: rewards 60초, rewards/[id]·faq·notice·notice/[id] 300초, download 3600초(기존), sitemap 3600초.
- `/vote/[id]`, `/star-candy`, `/privacy`, `/terms` 는 `export const dynamic = 'force-dynamic'` 을 명시한다.
- AdSense 옵션은 `delayUntilIdle={false}`, `idleTimeout={1200}`, 프로덕션에서만 렌더. `(bare)` 레이아웃에는 광고·쿠키 배너를 두지 않는다.
- 커밋은 Conventional Commits, 본문 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- middleware 동작은 바꾸지 않는다(주석만 수정).
- 미지원 언어 세그먼트의 동작(200 렌더, `lang="ko"` 폴백)은 바꾸지 않는다.

## Review Focus

1. **쿼리가 있는 페이지에서 언어 전환** (`/ko/vote?status=ongoing&area=kpop`): 쿼리가 그대로 보존되고, 쿼리가 없으면 끝에 `?` 가 붙지 않아야 한다. → Task 1 테스트.
2. **프리렌더 중 Supabase 오류·타임아웃**: faq 는 빈 목록, notice 는 `FALLBACK_NOTICES` 를 반환하고 예외를 던지지 않아야 한다(빌드가 실패하면 안 된다). 없는 notice id 는 500 이 아니라 `data: null` 이어야 한다. → Task 2 테스트.
3. **새 페이지를 렌더링 모드 선언 없이 추가**: 계약 테스트가 실패해 선언을 강제해야 한다. → Task 3 테스트.
4. **언어 접두어 없는 딥링크** (`/vote/123`): id 를 보존해 `/en/vote/123` 으로 가야 한다. → Task 4 테스트.
5. **미지원·대소문자 섞인 언어 세그먼트** (`/xx/rewards`, `/ZH-TW/vote`, `/"><script>/vote`): `<html lang>` 이 `ko` 폴백 또는 정규화된 태그여야 하고 세그먼트 값이 그대로 속성에 들어가면 안 된다. → Task 5 테스트.

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `hooks/useLocaleRouter.ts` | 로케일 라우팅 훅 | `useSearchParams` 제거 |
| `app/[lang]/(mypage)/mypage/qna/new/page.tsx` | 문의 작성 | Suspense 경계 |
| `lib/data-fetching/server/policy-service.ts` | 정책·FAQ 조회 | FAQ 2개 함수를 공개 클라이언트로 |
| `lib/data-fetching/server/notice-service.ts` | 공지 조회 | 공개 클라이언트로 |
| `app/[lang]/**/page.tsx` 9개, `app/sitemap.ts`, `app/[lang]/sitemap.ts` | 렌더링 모드 | 세그먼트 설정 명시 |
| `next.config.js` | 리다이렉트 | 스텁 4개 대체 |
| `app/page.tsx`, `app/vote/page.tsx`, `app/vote/[id]/page.tsx`, `app/mypage/page.tsx`, `app/concert2025/page.tsx`, `app/404.tsx` | 스텁·죽은 파일 | 삭제 |
| `app/shell.ts` | 폰트·AdSense 상수 공유 | 신규 |
| `app/layout.tsx` | 루트 | pass-through |
| `app/[lang]/layout.tsx` | 로케일 루트 | `<html>` 소유 |
| `app/(bare)/layout.tsx` | 비로케일 루트 | 신규 |
| `app/(bare)/auth/**`, `app/(bare)/ads/**` | 인증 콜백·광고 플레이어 | `git mv` (URL 불변) |
| `app/not-found.tsx` | 전역 404 | 자체 `<html>` |
| `middleware.ts` | 주석 | `x-locale` 소비자 설명 수정 |
| `__tests__/...` | 테스트 | 아래 각 Task |

---

### Task 1: 프리렌더를 깨는 `useSearchParams` 제거

**Files:**
- Modify: `hooks/useLocaleRouter.ts:3,31,144`
- Modify: `app/[lang]/(mypage)/mypage/qna/new/page.tsx:3,29` (+ 파일 끝)
- Test: `__tests__/hooks/useLocaleRouter.test.ts` (수정)
- Test: `__tests__/app/qna-new-suspense.test.tsx` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `useLocaleRouter()` 의 반환 타입 `LocaleRouterReturn` 은 그대로. `changeLocale(locale, preservePath = true)` 는 전환 시점의 `window.location.search` 를 보존한다. `NewQnaPage`(default export)는 `<Suspense>` 요소를 반환한다.

- [ ] **Step 1: 훅 테스트를 실패하게 고친다**

`__tests__/hooks/useLocaleRouter.test.ts` 에서 `mockUseSearchParams` 선언(10행)과 `beforeEach` 안의 `mockUseSearchParams.mockReturnValue(new URLSearchParams());` 를 지우고, `next/navigation` mock 의 `useSearchParams` 를 아래로 바꾼다.

```ts
  // useLocaleRouter 는 레이아웃(Header·Footer)에서 쓰인다. useSearchParams() 를 부르면
  // 정적 프리렌더가 Suspense 경계를 요구해 빌드가 깨진다.
  useSearchParams: () => {
    throw new Error('useLocaleRouter must not call useSearchParams()');
  },
```

`describe('useLocaleRouter', ...)` 의 마지막에 아래 블록을 추가한다.

```ts
  describe('changeLocale — 쿼리 보존', () => {
    const changeTo = async (locale: 'en' | 'ja') => {
      const { result } = renderHook(() => useLocaleRouter());
      await act(async () => {
        await (result.current.changeLocale(locale) as unknown as Promise<void>);
      });
    };

    it('현재 URL 의 쿼리를 그대로 붙인다', async () => {
      window.history.pushState({}, '', '/ko/votes?status=ongoing&area=kpop');
      await changeTo('en');
      expect(mockPush).toHaveBeenCalledWith('/en/votes?status=ongoing&area=kpop');
    });

    it('쿼리가 없으면 물음표를 붙이지 않는다', async () => {
      window.history.pushState({}, '', '/ko/votes');
      await changeTo('ja');
      expect(mockPush).toHaveBeenCalledWith('/ja/votes');
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/hooks/useLocaleRouter.test.ts`
Expected: FAIL — 거의 모든 케이스가 `useLocaleRouter must not call useSearchParams()` 로 실패.

- [ ] **Step 3: 훅에서 `useSearchParams` 를 없앤다**

`hooks/useLocaleRouter.ts`:

```ts
// 3행
import { usePathname, useRouter } from 'next/navigation';
```

31행 `const searchParams = useSearchParams();` 를 삭제한다.

144행 부근을 아래로 바꾼다.

```ts
    if (preservePath) {
      const currentPath = removeLocaleFromPath(pathname);
      const newPath = getLocalizedPath(currentPath, locale);
      // 쿼리는 전환 시점에 읽는다. useSearchParams() 는 정적 프리렌더에서 Suspense 경계를 요구하는데
      // 이 훅은 레이아웃(Header·Footer)에서 쓰여 경계를 둘 수 없다.
      const query = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
      router.push(query ? `${newPath}?${query}` : newPath);
    } else {
```

- [ ] **Step 4: 훅 테스트 통과를 확인한다**

Run: `npx vitest run __tests__/hooks/useLocaleRouter.test.ts`
Expected: PASS (기존 케이스 + 신규 2개).

- [ ] **Step 5: 문의 작성 페이지의 실패 테스트를 쓴다**

`__tests__/app/qna-new-suspense.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { Suspense, type ReactElement } from 'react';

vi.mock('@/app/actions/qna', () => ({ createQnaThreadAction: vi.fn() }));
vi.mock('@/components/client/qna/AttachmentPicker', () => ({ default: () => null }));
vi.mock('@/hooks/useWithdrawalGuard', () => ({ useWithdrawalGuard: () => vi.fn() }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ currentLanguage: 'ko' }) }));
vi.mock('@/hooks/useTranslations', () => ({ useTranslations: () => ({ tDynamic: (key: string) => key }) }));

import NewQnaPage from '@/app/[lang]/(mypage)/mypage/qna/new/page';

/**
 * 이 페이지는 서버 데이터가 없는 클라이언트 페이지라 정적으로 프리렌더된다.
 * useSearchParams() 를 쓰는 본문이 Suspense 밖에 있으면 next build 가 실패한다.
 */
describe('/mypage/qna/new — 프리렌더 안전성', () => {
  it('default export 는 훅을 쓰지 않고 Suspense 경계를 반환한다', () => {
    const element = (NewQnaPage as () => ReactElement)();
    expect(element.type).toBe(Suspense);
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run __tests__/app/qna-new-suspense.test.tsx`
Expected: FAIL — default export 가 훅을 직접 호출해 TypeError(`useActionState is not a function` 또는 dispatcher null)로 실패.

- [ ] **Step 7: Suspense 경계를 둔다**

`app/[lang]/(mypage)/mypage/qna/new/page.tsx`:

```tsx
// 3행
import React, { Suspense, useRef, useState } from 'react';
```

29행 `export default function NewQnaPage() {` 를 `function NewQnaForm() {` 로 바꾸고, 파일 끝에 추가한다.

```tsx

export default function NewQnaPage() {
  // NewQnaForm 이 useSearchParams() 를 쓴다. 이 페이지는 정적으로 프리렌더되므로 Suspense 경계가 필요하다.
  return (
    <Suspense fallback={null}>
      <NewQnaForm />
    </Suspense>
  );
}
```

- [ ] **Step 8: 통과를 확인하고 커밋한다**

Run: `npx vitest run __tests__/app/qna-new-suspense.test.tsx __tests__/hooks/useLocaleRouter.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음.

```bash
git add hooks/useLocaleRouter.ts "app/[lang]/(mypage)/mypage/qna/new/page.tsx" __tests__/hooks/useLocaleRouter.test.ts __tests__/app/qna-new-suspense.test.tsx
git commit -m "refactor(i18n): read query lazily in useLocaleRouter so layouts can prerender"
```

---

### Task 2: FAQ·공지 서비스를 공개 클라이언트로 전환

**Files:**
- Modify: `lib/data-fetching/server/policy-service.ts:3,44,84`
- Modify: `lib/data-fetching/server/notice-service.ts:3,41,70`
- Test: `__tests__/lib/data-fetching/server/public-client-services.test.ts` (신규)

**Interfaces:**
- Consumes: `createPublicSupabaseServerClient(): SupabaseClient<Database>` (`lib/supabase/server.ts:82`, 동기 함수, 쿠키 없음)
- Produces: `getFaqs(lang)`, `getFaqCategories(lang)`, `getNotices()`, `getNoticeById(id)` 의 시그니처·반환값은 그대로. 요청 시점 API(`cookies()`/`headers()`)를 쓰지 않는다. `getPolicy` 는 쿠키 클라이언트를 계속 쓴다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`__tests__/lib/data-fetching/server/public-client-services.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 테스트 환경의 react 18 에는 cache 가 없다 — 그대로 통과시킨다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));

type Result = { data: unknown; error: { message: string; code?: string } | null };

const results = new Map<string, Result>();
const publicClientFactory = vi.fn();
const cookieClientFactory = vi.fn(() => {
  throw new Error('cookie client must not be used on ISR paths');
});

function createClient() {
  return {
    from: (table: string) => {
      const result = results.get(table) ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        single: () => Promise.resolve(result),
        then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: () => publicClientFactory(),
  createSupabaseServerClient: () => cookieClientFactory(),
  createServerSupabaseClient: () => cookieClientFactory(),
}));

import { getFaqs, getFaqCategories } from '@/lib/data-fetching/server/policy-service';
import { getNotices, getNoticeById } from '@/lib/data-fetching/server/notice-service';

/**
 * faq·notice 페이지는 ISR 이다. 조회가 쿠키 클라이언트(cookies()/headers())를 쓰면
 * 페이지가 다시 동적으로 돌아가거나, 빌드 프리렌더에서 폴백 데이터가 캐시된다.
 */
describe('ISR 경로의 서비스는 공개 클라이언트만 쓴다', () => {
  beforeEach(() => {
    results.clear();
    publicClientFactory.mockReset().mockImplementation(createClient);
    cookieClientFactory.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('getFaqs 는 언어별로 현지화한 목록을 돌려준다', async () => {
    results.set('faqs', {
      data: [{ id: 1, question: { ko: '질문', en: 'Q' }, answer: { ko: '답' }, answer_delta: null, category: 'a', created_at: 'x' }],
      error: null,
    });
    const faqs = await getFaqs('en');
    expect(faqs).toHaveLength(1);
    expect(faqs[0]).toMatchObject({ question: 'Q', answer: '답' });
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getFaqs 는 조회 오류에 빈 목록을 돌려준다 (프리렌더가 실패하지 않는다)', async () => {
    results.set('faqs', { data: null, error: { message: 'boom' } });
    await expect(getFaqs('ko')).resolves.toEqual([]);
  });

  it('getFaqCategories 는 공개 클라이언트로 조회한다', async () => {
    results.set('faq_categories', {
      data: [{ code: 'pay', label: { ko: '결제' }, order_number: 1, active: true }],
      error: null,
    });
    await expect(getFaqCategories('ko')).resolves.toEqual([
      { code: 'pay', label: '결제', order_number: 1, active: true },
    ]);
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNotices 는 공개 클라이언트로 조회한다', async () => {
    const rows = [{ id: 7, title: { ko: '공지' }, content: {}, created_at: '2026-01-01', is_pinned: false }];
    results.set('notices', { data: rows, error: null });
    await expect(getNotices()).resolves.toEqual(rows);
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNotices 는 조회 오류에 폴백 공지를 돌려준다', async () => {
    results.set('notices', { data: null, error: { message: 'boom' } });
    const notices = await getNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0].id).toBe(0);
  });

  it('getNoticeById 는 없는 id 에 예외 없이 data: null 을 돌려준다', async () => {
    results.set('notices', { data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const { data, error } = await getNoticeById(999999);
    expect(data).toBeNull();
    expect(error?.message).toBe('Notice not found');
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNoticeById 는 숫자가 아닌 id 를 조회 없이 거부한다', async () => {
    const { data, error } = await getNoticeById(Number('abc'));
    expect(data).toBeNull();
    expect(error?.message).toBe('Invalid ID');
    expect(publicClientFactory).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/lib/data-fetching/server/public-client-services.test.ts`
Expected: FAIL — `getFaqs`·`getFaqCategories` 는 빈 값(쿠키 클라이언트 예외가 삼켜짐), `getNotices` 는 폴백, `getNoticeById` 는 `cookie client must not be used on ISR paths` 예외.

- [ ] **Step 3: policy-service 를 바꾼다**

`lib/data-fetching/server/policy-service.ts`:

```ts
// 3행
import { createPublicSupabaseServerClient, createServerSupabaseClient } from '@/lib/supabase/server';
```

`getFaqs` 안(44행)과 `getFaqCategories` 안(84행)의

```ts
      const supabase = await createServerSupabaseClient();
```

를 각각 아래로 바꾼다. `getPolicy`(8행)는 건드리지 않는다.

```ts
      // faq 페이지는 ISR 이다 — 쿠키 없는 공개 클라이언트로 조회한다 (faqs: RLS 없음, faq_categories: public SELECT 정책).
      const supabase = createPublicSupabaseServerClient();
```

- [ ] **Step 4: notice-service 를 바꾼다**

`lib/data-fetching/server/notice-service.ts`:

```ts
// 3행
import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
```

`getNotices` 안(41행)과 `getNoticeById` 안(70행)의 `const supabase = await createSupabaseServerClient();` 를 아래로 바꾼다.

```ts
      // notice 페이지와 sitemap 은 ISR 이다 — 쿠키 없는 공개 클라이언트로 조회한다 (notices: RLS 없음).
      const supabase = createPublicSupabaseServerClient();
```

- [ ] **Step 5: 통과를 확인하고 커밋한다**

Run: `npx vitest run __tests__/lib/data-fetching/server/public-client-services.test.ts && npx tsc --noEmit`
Expected: PASS (7개), 타입 오류 없음.

```bash
git add lib/data-fetching/server/policy-service.ts lib/data-fetching/server/notice-service.ts __tests__/lib/data-fetching/server/public-client-services.test.ts
git commit -m "refactor(data): read faq and notice with the cookieless public client"
```

---

### Task 3: 페이지별 렌더링 모드 명시와 계약 테스트

**Files:**
- Modify: `app/[lang]/(main)/rewards/page.tsx`, `app/[lang]/(main)/rewards/[id]/page.tsx`, `app/[lang]/(mypage)/faq/page.tsx`, `app/[lang]/(mypage)/notice/page.tsx`, `app/[lang]/(mypage)/notice/[id]/page.tsx`, `app/[lang]/(main)/vote/page.tsx`, `app/[lang]/(main)/vote/[id]/page.tsx`, `app/[lang]/(main)/star-candy/page.tsx`, `app/[lang]/(main)/privacy/page.tsx`, `app/[lang]/(main)/terms/page.tsx`, `app/sitemap.ts`, `app/[lang]/sitemap.ts`
- Test: `__tests__/app/rendering-mode-contract.test.ts` (신규)

**Interfaces:**
- Consumes: Task 2 의 쿠키 없는 서비스(그래야 faq·notice 가 실제로 ISR 이 된다).
- Produces: 아래 테스트의 `MODES` 표가 `app/[lang]` 모든 페이지의 렌더링 모드 정본이다. 새 페이지는 이 표에 항목을 추가해야 한다.

- [ ] **Step 1: 계약 테스트를 쓴다**

`__tests__/app/rendering-mode-contract.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

/**
 * 루트 레이아웃이 headers() 를 부르지 않으므로, 요청 시점 API 를 쓰지 않는 페이지는
 * Next 가 정적으로 렌더해 (revalidate 가 없으면) 영원히 캐시한다.
 * 모든 페이지는 여기에 렌더링 모드를 선언한다 — 선언 없는 새 페이지는 이 테스트가 막는다.
 */
type Mode =
  | { kind: 'isr'; revalidate: number; onDemand?: true }
  | { kind: 'force-dynamic' }
  | { kind: 'force-static'; revalidate: number }
  /** 서버 데이터가 없는 리다이렉트·클라이언트 셸. 굳어도 되는 페이지만. */
  | { kind: 'static-shell' }
  /** 페이지 파일이 직접 요청 시점 API 를 읽어 동적이다. marker 가 사라지면 다시 판단해야 한다. */
  | { kind: 'request-api'; marker: RegExp };

const LANG_DIR = path.join(process.cwd(), 'app/[lang]');

const MODES: Record<string, Mode> = {
  'page.tsx': { kind: 'static-shell' },
  '(auth)/login/page.tsx': { kind: 'static-shell' },
  '(main)/concert2025/page.tsx': { kind: 'force-static', revalidate: 86400 },
  '(main)/media/page.tsx': { kind: 'force-dynamic' },
  '(main)/privacy/page.tsx': { kind: 'force-dynamic' },
  '(main)/terms/page.tsx': { kind: 'force-dynamic' },
  '(main)/rewards/page.tsx': { kind: 'isr', revalidate: 60 },
  '(main)/rewards/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '(main)/star-candy/page.tsx': { kind: 'force-dynamic' },
  '(main)/vote/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(main)/vote/[id]/page.tsx': { kind: 'force-dynamic' },
  '(mypage)/faq/page.tsx': { kind: 'isr', revalidate: 300 },
  '(mypage)/notice/page.tsx': { kind: 'isr', revalidate: 300 },
  '(mypage)/notice/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '(mypage)/mypage/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/candy-history/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/expiry-guide/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/notifications/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/qna/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(mypage)/mypage/qna/new/page.tsx': { kind: 'static-shell' },
  '(mypage)/mypage/qna/[thread_id]/page.tsx': { kind: 'force-dynamic' },
  '(mypage)/mypage/recharge-history/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(mypage)/mypage/vote-history/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  'download/page.tsx': { kind: 'isr', revalidate: 3600 },
  'open-in-browser/page.tsx': { kind: 'request-api', marker: /headers\(\)/ },
};

function listPages(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listPages(path.join(dir, entry.name), relative);
    return entry.name === 'page.tsx' ? [relative] : [];
  });
}

function readConfig(source: string) {
  const dynamic = source.match(/^export const dynamic = '([a-z-]+)'/m)?.[1] ?? null;
  const revalidateRaw = source.match(/^export const revalidate = (\d+)/m)?.[1];
  return {
    dynamic,
    revalidate: revalidateRaw === undefined ? null : Number(revalidateRaw),
    hasStaticParams: /^export (async )?function generateStaticParams\(/m.test(source),
  };
}

describe('app/[lang] 렌더링 모드 계약', () => {
  it('모든 페이지가 표에 선언돼 있다', () => {
    expect(listPages(LANG_DIR).sort()).toEqual(Object.keys(MODES).sort());
  });

  it.each(Object.entries(MODES))('%s', (relative, mode) => {
    const source = fs.readFileSync(path.join(LANG_DIR, relative), 'utf8');
    const config = readConfig(source);

    switch (mode.kind) {
      case 'isr':
        expect(config).toMatchObject({ dynamic: null, revalidate: mode.revalidate });
        // 동적 세그먼트([id])는 generateStaticParams 가 있어야 요청 시 생성·캐시된다.
        if (mode.onDemand) expect(config.hasStaticParams).toBe(true);
        break;
      case 'force-dynamic':
        expect(config).toMatchObject({ dynamic: 'force-dynamic', revalidate: null });
        break;
      case 'force-static':
        expect(config).toMatchObject({ dynamic: 'force-static', revalidate: mode.revalidate });
        break;
      case 'static-shell':
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        break;
      case 'request-api':
        // 죽은 revalidate 를 두지 않는다 — 동적 페이지에서는 효과가 없어 오해만 부른다.
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        expect(source).toMatch(mode.marker);
        break;
    }
  });

  it.each(['app/sitemap.ts', 'app/[lang]/sitemap.ts'])('%s 는 1시간마다 재생성된다', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(readConfig(source).revalidate).toBe(3600);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/app/rendering-mode-contract.test.ts`
Expected: FAIL — `(main)/privacy`, `(main)/terms`, `(main)/rewards`, `(main)/rewards/[id]`, `(main)/star-candy`, `(main)/vote`, `(main)/vote/[id]`, `(mypage)/faq`, `(mypage)/notice`, `(mypage)/notice/[id]`, sitemap 2개. "모든 페이지가 표에 선언돼 있다" 는 PASS.

- [ ] **Step 3: ISR 페이지를 고친다**

`app/[lang]/(main)/rewards/page.tsx` — `createISRMetadata` import(2행)를 지우고, 13~16행을 아래로 바꾼다.

```ts
// ISR: 60초마다 재생성한다. 조회(getRewards)는 쿠키 없는 공개 클라이언트다.
export const revalidate = 60;
```

`generateMetadata` 안의 `const isrOptions = createISRMetadata(60);` 와 그 위 주석을 지우고 반환을 아래로 바꾼다(메타데이터에 넣은 `revalidate` 는 효과가 없었다).

```ts
  return createPageMetadata(
    t('nav_rewards'),
    t('meta_rewards_description'),
    {
      alternates: {
        canonical: `${SITE_URL}/${lang}/rewards`,
        languages: buildLanguageAlternates('/rewards'),
      },
    },
    lang,
  );
```

`app/[lang]/(main)/rewards/[id]/page.tsx` — 15~16행을 아래로 바꾼다.

```ts
// ISR: 요청 시 생성하고 5분마다 재생성한다. 없는 id 의 404 도 5분 뒤 다시 확인한다.
export const revalidate = 300;

// 빌드에서는 만들지 않는다 — 빈 목록이어야 [id] 가 요청 시 정적 생성(ISR) 대상이 된다.
export async function generateStaticParams() {
  return [];
}
```

`app/[lang]/(mypage)/faq/page.tsx` — 7행 `export const dynamic = 'force-dynamic';` 를 아래로 바꾼다.

```ts
// ISR: 5분마다 재생성한다. 조회(getFaqs·getFaqCategories)는 쿠키 없는 공개 클라이언트다.
export const revalidate = 300;
```

`app/[lang]/(mypage)/notice/page.tsx` — 8행 `export const dynamic = 'force-dynamic';` 를 아래로 바꾼다.

```ts
// ISR: 5분마다 재생성한다. 조회(getNotices)는 쿠키 없는 공개 클라이언트다.
export const revalidate = 300;
```

`app/[lang]/(mypage)/notice/[id]/page.tsx` — import 블록 아래(5행 뒤)에 추가한다.

```ts

// ISR: 요청 시 생성하고 5분마다 재생성한다.
export const revalidate = 300;

// 빌드에서는 만들지 않는다 — 빈 목록이어야 [id] 가 요청 시 정적 생성(ISR) 대상이 된다.
export async function generateStaticParams() {
  return [];
}
```

- [ ] **Step 4: 동적으로 남길 페이지에 명시한다**

아래 네 파일의 import 블록 바로 아래에 각각 추가한다.

`app/[lang]/(main)/vote/[id]/page.tsx`:

```ts

// 동적 유지: 종료 시각·visible_at 판정이 요청 시각에 달려 있다. 조회가 공개 클라이언트라
// 이 선언이 없으면 첫 렌더가 영원히 캐시된다. ISR 전환은 별도 설계(스펙 §7).
export const dynamic = 'force-dynamic';
```

`app/[lang]/(main)/star-candy/page.tsx`:

```ts

// 동적 유지: 상품·가격 조회가 쿠키 클라이언트의 try/catch 에 기대 동적이었다. 우연에 맡기지 않는다.
export const dynamic = 'force-dynamic';
```

`app/[lang]/(main)/privacy/page.tsx` 와 `app/[lang]/(main)/terms/page.tsx`:

```ts

// 동적 유지: getPolicy 가 쿠키 클라이언트를 쓴다. ISR 전환은 범위 밖(스펙 §7).
export const dynamic = 'force-dynamic';
```

`app/[lang]/(main)/vote/page.tsx` — 1행 `export const revalidate = 60;` 를 삭제한다(searchParams 를 읽어 동적이라 죽은 설정).

- [ ] **Step 5: sitemap 에 재생성 주기를 명시한다**

`app/sitemap.ts` 와 `app/[lang]/sitemap.ts` 의 import 블록 아래에 각각 추가한다.

```ts

// getNotices 가 쿠키 없는 클라이언트가 되면 이 라우트는 정적으로 굳는다 — 1시간마다 재생성한다.
export const revalidate = 3600;
```

- [ ] **Step 6: 통과를 확인하고 커밋한다**

Run: `npx vitest run __tests__/app/rendering-mode-contract.test.ts __tests__/app && npx tsc --noEmit && npm run lint`
Expected: PASS, 타입·린트 오류 없음. (`createISRMetadata` 미사용 경고가 나오면 `app/[lang]/utils/rendering-utils.ts` 의 export 는 그대로 둔다 — 정리는 스펙 §7 후속.)

```bash
git add "app/[lang]" app/sitemap.ts __tests__/app/rendering-mode-contract.test.ts
git commit -m "refactor(rendering): declare every page's rendering mode and pin it with a contract test"
```

---

### Task 4: 리다이렉트 스텁을 `next.config.js` 로 옮긴다

**Files:**
- Modify: `next.config.js:156-162` (`redirects()` 앞부분)
- Delete: `app/page.tsx`, `app/vote/page.tsx`, `app/vote/[id]/page.tsx`, `app/mypage/page.tsx`, `app/concert2025/page.tsx`, `app/404.tsx`
- Test: `__tests__/next-config-redirects.test.ts` (확장)

**Interfaces:**
- Consumes: 없음
- Produces: `/vote`, `/vote/:id`, `/mypage`, `/concert2025` 는 `next.config.js` 가 `/en/...` 로 보낸다(307). Task 5 의 pass-through 루트 아래에 `<html>` 없는 페이지가 남지 않는다.

- [ ] **Step 1: 실패 테스트를 추가한다**

`__tests__/next-config-redirects.test.ts` — import 를 아래로 바꾸고 `describe` 안에 케이스를 추가한다.

```ts
import fs from 'fs';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/config/settings';
```

```ts
  // 예전에는 app/vote/page.tsx 같은 스텁 페이지가 redirect() 했다. 루트 레이아웃이 pass-through 가 되면
  // [lang] 밖 페이지는 <html> 을 받지 못하므로, 함수 호출 없는 설정 리다이렉트로 옮겼다.
  it.each([
    ['/vote', '/vote'],
    ['/vote/:id', '/vote/:id'],
    ['/mypage', '/mypage'],
    ['/concert2025', '/concert2025'],
  ])('언어 접두어 없는 %s 는 기본 언어로 보낸다', async (source, rest) => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    const matches = redirects.filter((redirect) => redirect.source === source);

    expect(matches).toEqual([
      { source, destination: `/${DEFAULT_LANGUAGE}${rest}`, permanent: false },
    ]);
  });

  it.each([
    'app/page.tsx',
    'app/vote/page.tsx',
    'app/vote/[id]/page.tsx',
    'app/mypage/page.tsx',
    'app/concert2025/page.tsx',
  ])('%s 스텁은 남아 있지 않다 (<html> 없는 페이지가 된다)', (file) => {
    expect(fs.existsSync(path.join(process.cwd(), file))).toBe(false);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/next-config-redirects.test.ts`
Expected: FAIL — 신규 9개(리다이렉트 없음 4, 스텁 존재 5).

- [ ] **Step 3: 리다이렉트를 추가하고 스텁을 지운다**

`next.config.js` `redirects()` 의 `/:lang(...)` 항목 바로 아래에 추가한다.

```js
      // 언어 접두어 없는 진입 — 예전 app/{vote,mypage,concert2025} 스텁 페이지를 대체한다.
      // 기본 언어(config/settings DEFAULT_LANGUAGE = 'en')와의 일치는 테스트가 검증한다.
      { source: '/vote',        destination: '/en/vote',        permanent: false },
      { source: '/vote/:id',    destination: '/en/vote/:id',    permanent: false },
      { source: '/mypage',      destination: '/en/mypage',      permanent: false },
      { source: '/concert2025', destination: '/en/concert2025', permanent: false },
```

```bash
git rm app/page.tsx app/vote/page.tsx "app/vote/[id]/page.tsx" app/mypage/page.tsx app/concert2025/page.tsx app/404.tsx
```

- [ ] **Step 4: 통과를 확인하고 커밋한다**

Run: `npx vitest run __tests__/next-config-redirects.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음.

```bash
git add next.config.js __tests__/next-config-redirects.test.ts
git commit -m "refactor(routing): replace unprefixed redirect stub pages with config redirects"
```

---

### Task 5: 레이아웃 재구성 — pass-through 루트, `[lang]` 이 `<html>` 소유

**Files:**
- Create: `app/shell.ts`, `app/(bare)/layout.tsx`
- Modify: `app/layout.tsx` (전체 교체), `app/[lang]/layout.tsx`, `app/not-found.tsx:15` (+ 파일 끝), `middleware.ts:96`
- Move: `app/auth` → `app/(bare)/auth`, `app/ads` → `app/(bare)/ads`
- Test: `__tests__/app/lang-layout-html.test.tsx` (신규), `__tests__/app/root-layout-passthrough.test.tsx` (신규), `__tests__/app/bare-layout.test.tsx` (신규)
- Delete: `__tests__/app/root-layout-lang.test.tsx`

**Interfaces:**
- Consumes: Task 1(레이아웃 훅이 프리렌더 안전), Task 3(모드 명시), Task 4(스텁 없음).
- Produces:
  - `app/shell.ts`: `inter`(next/font 인스턴스, `.className`), `ADSENSE_CLIENT_ID: string`, `ADSENSE_META: { 'google-adsense-account': string }`, `VIEWPORT: Viewport`.
  - `app/layout.tsx`: `RootLayout({ children })` 는 `children` 을 그대로 반환.
  - `app/[lang]/layout.tsx`: default export 가 `<html lang>` 요소를 반환.

- [ ] **Step 1: 실패 테스트 세 개를 쓴다**

`__tests__/app/lang-layout-html.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

// 이 레이아웃이 요청 시점 API 를 부르면 모든 페이지가 다시 동적 렌더링이 된다.
vi.mock('next/headers', () => ({
  headers: () => {
    throw new Error('headers() must not be called in the [lang] layout');
  },
  cookies: () => {
    throw new Error('cookies() must not be called in the [lang] layout');
  },
}));

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('@/app/[lang]/ClientLayout', () => ({ default: () => null }));
vi.mock('@/components/client/ads/ConsentAwareAdsense', () => ({ default: () => null }));
vi.mock('@/components/client/ads/CookieConsentBanner', () => ({ default: () => null }));

import LanguageLayout, { generateMetadata } from '@/app/[lang]/layout';
import ClientLayout from '@/app/[lang]/ClientLayout';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';
import CookieConsentBanner from '@/components/client/ads/CookieConsentBanner';

type AnyElement = ReactElement<{ children?: unknown; [key: string]: unknown }>;

const flatten = (children: unknown): AnyElement[] =>
  (Array.isArray(children) ? children : [children]).filter(
    (child): child is AnyElement => typeof child === 'object' && child !== null && 'type' in child,
  );

const render = async (lang: string) =>
  (await LanguageLayout({ children: 'page', params: Promise.resolve({ lang }) })) as AnyElement;

const bodyOf = (html: AnyElement) => flatten(html.props.children).find((child) => child.type === 'body')!;

describe('[lang] 레이아웃 — <html lang>', () => {
  it.each([
    ['en', 'en'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['zh-cn', 'zh-CN'],
    ['zh-tw', 'zh-TW'],
    ['tl', 'tl'],
    ['my', 'my'],
  ])('/%s → lang="%s"', async (lang, expected) => {
    const html = await render(lang);
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe(expected);
  });

  it('대소문자가 섞인 세그먼트는 정규화한다', async () => {
    expect((await render('ZH-TW')).props.lang).toBe('zh-TW');
  });

  it.each(['xx', 'login', '"><script>'])('지원하지 않는 세그먼트 %s 는 ko 로 폴백한다', async (lang) => {
    expect((await render(lang)).props.lang).toBe('ko');
  });

  it('body 안에서 ClientLayout 이 경로 언어를 받아 페이지를 감싼다', async () => {
    const body = bodyOf(await render('ja'));
    const wrapper = flatten(body.props.children).find((child) => child.type === 'div')!;
    const client = flatten(wrapper.props.children).find((child) => child.type === ClientLayout)!;
    expect(body.props.className).toBe('font-inter');
    expect(client.props.initialLanguage).toBe('ja');
    expect(client.props.children).toBe('page');
  });
});

describe('[lang] 레이아웃 — 광고', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const adsIn = async () => {
    const children = flatten(bodyOf(await render('en')).props.children);
    return {
      adsense: children.find((child) => child.type === ConsentAwareAdsense),
      banner: children.find((child) => child.type === CookieConsentBanner),
    };
  };

  describe('프로덕션', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('AdSense 를 지연 없이·1.2초 idle 로 싣고 쿠키 배너를 렌더한다', async () => {
      const { adsense, banner } = await adsIn();
      expect(adsense?.props).toMatchObject({
        clientId: 'ca-pub-1539304887624918',
        delayUntilIdle: false,
        idleTimeout: 1200,
      });
      expect(banner).toBeDefined();
    });
  });

  it('프로덕션이 아니면 광고와 배너를 렌더하지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { adsense, banner } = await adsIn();
    expect(adsense).toBeUndefined();
    expect(banner).toBeUndefined();
  });

  it('AdSense 계정 메타 태그는 [lang] 메타데이터가 싣는다', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'ko' }) });
    expect(metadata.other).toMatchObject({ 'google-adsense-account': 'ca-pub-1539304887624918' });
  });
});
```

`__tests__/app/root-layout-passthrough.test.tsx`:

```tsx
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import RootLayout from '@/app/layout';

/**
 * 루트 레이아웃은 [lang] 파라미터를 받을 수 없다. 여기서 <html lang> 을 정하려고 headers() 를 읽으면
 * 모든 페이지가 동적 렌더링이 되므로, <html> 은 [lang]/(bare) 레이아웃과 not-found 가 렌더한다.
 */
describe('루트 레이아웃 — pass-through', () => {
  it('children 을 그대로 반환한다', () => {
    const children = { marker: true } as unknown as React.ReactNode;
    expect(RootLayout({ children })).toBe(children);
  });

  it('요청 시점 API 를 import 하지 않는다', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(source).not.toMatch(/next\/headers/);
  });
});
```

`__tests__/app/bare-layout.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import BareLayout, { metadata } from '@/app/(bare)/layout';
import GlobalNotFound from '@/app/not-found';

type HtmlElement = ReactElement<{ lang: string; children: ReactElement<{ className?: string }> }>;

describe('[lang] 밖 문서 뼈대', () => {
  it('(bare) 레이아웃은 <html lang="ko"><body> 를 렌더한다', () => {
    const html = BareLayout({ children: 'page' }) as HtmlElement;
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect(html.props.children.type).toBe('body');
    expect(html.props.children.props.className).toBe('font-inter');
  });

  it('(bare) 레이아웃도 AdSense 계정 메타 태그를 싣는다', () => {
    expect(metadata.other).toMatchObject({ 'google-adsense-account': 'ca-pub-1539304887624918' });
  });

  it('전역 not-found 는 자체 <html><body> 를 렌더한다 (루트 레이아웃이 pass-through)', () => {
    const html = (GlobalNotFound as () => HtmlElement)();
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect(html.props.children.type).toBe('body');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/app/lang-layout-html.test.tsx __tests__/app/root-layout-passthrough.test.tsx __tests__/app/bare-layout.test.tsx`
Expected: FAIL — `[lang]` 레이아웃이 `html` 이 아니라 `ClientLayout` 을 반환, 루트가 `next/headers` 를 import, `@/app/(bare)/layout` 모듈 없음.

- [ ] **Step 3: 공유 상수 파일을 만든다**

`app/shell.ts`:

```ts
import type { Viewport } from 'next';
import { Inter } from 'next/font/google';

/**
 * <html> 을 렌더하는 레이아웃([lang], (bare))이 함께 쓰는 문서 뼈대 상수.
 * next/font 로더는 모듈 스코프에서 한 번만 호출해야 한다.
 */
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

export const ADSENSE_CLIENT_ID = 'ca-pub-1539304887624918';

/** AdSense 계정 확인용 메타 태그 (metadata.other). */
export const ADSENSE_META = { 'google-adsense-account': ADSENSE_CLIENT_ID } as const;

export const VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};
```

- [ ] **Step 4: 루트 레이아웃을 pass-through 로 바꾼다**

`app/layout.tsx` 전체를 아래로 교체한다.

```tsx
import type { ReactNode } from 'react';

/**
 * 루트 레이아웃은 아무것도 렌더하지 않는다.
 *
 * <html lang> 은 경로의 언어에 달려 있는데 루트 레이아웃은 [lang] 파라미터를 받을 수 없다.
 * 예전에는 middleware 의 x-locale 헤더를 headers() 로 읽었고, 그 한 줄이 모든 페이지를 동적 렌더링으로
 * 만들어 ISR 이 하나도 동작하지 않았다. 이제 <html>·<body> 는 아래 네 곳이 렌더한다:
 *   app/[lang]/layout.tsx · app/(bare)/layout.tsx · app/not-found.tsx · app/global-error.tsx
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
```

- [ ] **Step 5: `[lang]` 레이아웃이 `<html>` 을 소유하게 한다**

`app/[lang]/layout.tsx` — import 블록을 아래로 바꾼다.

```tsx
import { ReactNode } from 'react';
import './globals.css';
import { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';
import CookieConsentBanner from '@/components/client/ads/CookieConsentBanner';
import { ADSENSE_CLIENT_ID, ADSENSE_META, VIEWPORT, inter } from '@/app/shell';
import {
  DEFAULT_METADATA,
  brandMetadata,
  brandName,
  getLanguageTag,
  getOpenGraphLocale,
  siteDescription,
} from './utils/metadata-utils';
```

`viewport` export 를 아래로 바꾼다.

```tsx
// Next.js 15에서 요구하는 viewport 내보내기
export const viewport: Viewport = VIEWPORT;
```

`generateMetadata` 의 `other` 에 AdSense 메타를 추가한다.

```tsx
    other: {
      ...ADSENSE_META,
      'msapplication-TileColor': '#4F46E5',
      'theme-color': '#ffffff',
      '1password-ignore': 'true',
      'lastpass-ignore': 'true',
      'dashlane-ignore': 'true',
      'bitwarden-ignore': 'true',
    },
```

default export 를 아래로 교체한다.

```tsx
const cdnOrigin = (() => {
  const rawCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!rawCdnUrl) return null;
  try {
    return new URL(rawCdnUrl).origin;
  } catch {
    return null;
  }
})();

/**
 * 로케일 페이지의 문서 뼈대. <html lang> 을 경로 파라미터로 정한다 — 요청 시점 API(headers/cookies)를
 * 부르지 않으므로 하위 페이지가 정적/ISR 로 렌더될 수 있다. 여기서 headers() 를 부르면 전부 동적이 된다.
 */
export default async function LanguageLayout({
  children,
  params: paramsPromise,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await paramsPromise;
  // 라우트 파라미터는 대소문자가 섞일 수 있다(/zh-TW). 지원하지 않는 값은 ko 로 폴백한다.
  const htmlLang = getLanguageTag(lang.toLowerCase()) ?? 'ko';

  // 경로 기반 광고 분기(투표 라우트 지연·/download 제외)는 한 번도 켜진 적이 없다.
  // 정책 결정(#5) 전까지 실제 동작(지연 없음·1.2s idle)을 그대로 명시한다.
  const shouldLoadAds = process.env.NODE_ENV === 'production';

  return (
    <html lang={htmlLang}>
      <head>
        {cdnOrigin && (
          <>
            <link rel="preconnect" href={cdnOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={cdnOrigin} />
          </>
        )}
      </head>
      <body className={inter.className}>
        {/* Google AdSense (Auto ads) - 프로덕션에서만 */}
        {shouldLoadAds && (
          <ConsentAwareAdsense
            clientId={ADSENSE_CLIENT_ID}
            delayUntilIdle={false}
            idleTimeout={1200}
          />
        )}
        <div className="bg-white">
          <ClientLayout initialLanguage={lang}>{children}</ClientLayout>
        </div>
        {/* Cookie Consent Banner - 프로덕션에서만 */}
        {shouldLoadAds && <CookieConsentBanner />}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: `(bare)` 그룹을 만들고 `[lang]` 밖 페이지를 옮긴다**

```bash
mkdir -p "app/(bare)"
git mv app/auth "app/(bare)/auth"
git mv app/ads "app/(bare)/ads"
```

`app/(bare)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import '@/app/[lang]/globals.css';
import { ADSENSE_META, VIEWPORT, inter } from '@/app/shell';

export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
  other: ADSENSE_META,
};

export const viewport: Viewport = VIEWPORT;

/**
 * 언어 세그먼트가 없는 페이지(/auth/*, /ads/*)의 문서 뼈대.
 * 루트 레이아웃이 pass-through 라 여기서 <html>·<body> 를 렌더한다. 콘텐츠 페이지가 아니므로
 * AdSense 와 쿠키 배너는 싣지 않는다. 그룹 폴더는 URL 에 나타나지 않는다.
 */
export default function BareLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: 전역 not-found 가 자체 `<html>` 을 렌더하게 한다**

`app/not-found.tsx` — 15행 `export default function GlobalNotFound() {` 를 `function GlobalNotFoundContent() {` 로 바꾼다. 언어 감지 `useEffect` 바로 아래에 추가한다.

```tsx
  // 서버 HTML 은 lang="ko" 로 나간다(루트 not-found 는 경로 파라미터를 받지 못한다). 감지 후 맞춘다.
  useEffect(() => {
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-cn' : currentLanguage;
  }, [currentLanguage]);
```

파일 끝에 추가한다.

```tsx

/**
 * 루트 레이아웃이 pass-through 라 이 파일이 문서 뼈대까지 렌더한다.
 * 본문은 인라인 스타일만 써서 전역 CSS 가 필요 없다.
 */
export default function GlobalNotFound() {
  return (
    <html lang="ko">
      <body>
        <GlobalNotFoundContent />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: middleware 주석을 고치고 옛 테스트를 지운다**

`middleware.ts:96`:

```ts
// - x-locale: 경로의 지원 로케일. 레이아웃은 더 이상 읽지 않는다(<html lang> 은 [lang] 파라미터로 정한다).
//   서버 컴포넌트가 다시 읽으면 그 페이지는 동적 렌더링이 된다 — 제거는 후속 정리.
```

```bash
git rm __tests__/app/root-layout-lang.test.tsx
```

- [ ] **Step 9: 단위 테스트·타입·린트를 확인한다**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 전체 PASS, 타입·린트 오류 없음.

- [ ] **Step 10: 빌드 라우트 표를 확인한다**

Run: `npx next build 2>&1 | tee .next-build.log | tail -80`

Expected (기호: `○` 정적, `●` SSG/ISR, `ƒ` 동적):

| 라우트 | 기대 |
|---|---|
| `/[lang]/rewards` | `●`, Revalidate 1m, `/en`·`/ko`·`/my` 프리렌더 |
| `/[lang]/faq`, `/[lang]/notice` | `●`, Revalidate 5m |
| `/[lang]/rewards/[id]`, `/[lang]/notice/[id]` | `●`, Revalidate 5m (프리렌더 경로 없음) |
| `/[lang]/download` | `●`, Revalidate 1h |
| `/[lang]/login`, `/[lang]/mypage/qna/new`, `/[lang]` | `●` |
| `/[lang]/vote`, `/[lang]/vote/[id]`, `/[lang]/star-candy`, `/[lang]/privacy`, `/[lang]/terms`, `/[lang]/media`, `/[lang]/mypage/**`(qna/new 제외), `/[lang]/open-in-browser` | `ƒ` |
| `/auth/loading`, `/ads/shortform/player` | `○` |
| `/auth/callback`, `/auth/callback/[provider]` | `ƒ` |
| `/sitemap.xml`, `/[lang]/sitemap.xml` | Revalidate 1h |

빌드가 `useSearchParams() should be wrapped in a suspense boundary at page "<경로>"` 로 실패하면: 메시지가 지목한 페이지에서 `useSearchParams` 를 쓰는 클라이언트 컴포넌트를 찾아, Task 1 Step 7 과 같은 방식으로 그 컴포넌트를 `<Suspense fallback={null}>` 로 감싸고 다시 빌드한다.

`/[lang]/rewards/[id]` 가 `DYNAMIC_SERVER_USAGE` 로 실패하면: 오류가 지목한 호출을 확인하고, 요청 시점 API 가 실제로 필요하면 그 페이지를 `export const dynamic = 'force-dynamic'` 으로 되돌리고 `rendering-mode-contract.test.ts` 의 해당 항목을 `{ kind: 'force-dynamic' }` 로, 스펙 §4.3 표를 같이 고친다.

```bash
rm .next-build.log
```

- [ ] **Step 11: 커밋한다**

```bash
git add -A app middleware.ts __tests__/app
git status --short
git commit -m "refactor(layout): render <html> from the [lang] layout so pages can be cached

The root layout read the x-locale header via headers() to set <html lang>,
which forced every route into dynamic rendering. The root layout is now a
pass-through and the [lang] layout owns the document shell."
```

---

### Task 6: 로컬 실환경 검증, 문서, PR

**Files:**
- Modify: `docs/audit-2026-09-26/plan.md` (§5.4 아래 결과 기록)
- Modify: `docs/superpowers/specs/2026-09-30-root-layout-isr-design.md` (상태 줄)

**Interfaces:**
- Consumes: Task 1~5 전체.
- Produces: 검증 기록과 PR.

- [ ] **Step 1: 프로덕션 서버를 띄운다**

Run: `npx next build && (npx next start -p 3100 > .next-start.log 2>&1 &) && sleep 5 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/ko/rewards`
Expected: `200`

- [ ] **Step 2: 캐시 헤더와 `<html lang>` 을 확인한다**

```bash
B=http://localhost:3100
for p in /ko/rewards /en/faq /my/notice /ko/download; do
  printf '%s -> ' "$p"; curl -sI "$B$p" | grep -i '^cache-control' ; done
for p in /ko/vote /ko/star-candy /ko/privacy; do
  printf '%s -> ' "$p"; curl -sI "$B$p" | grep -i '^cache-control' ; done
for p in /zh-cn/vote /en/rewards /my/faq /ja/notice; do
  printf '%s -> ' "$p"; curl -s "$B$p" | grep -oE '<html[^>]*>' ; done
```

Expected:
- ISR 4개: `s-maxage=60`(rewards), `s-maxage=300`(faq·notice), `s-maxage=3600`(download), 모두 `stale-while-revalidate` 포함.
- 동적 3개: `private, no-cache, no-store, max-age=0, must-revalidate`.
- `<html lang="zh-CN">`, `<html lang="en">`, `<html lang="my">`, `<html lang="ja">`.

- [ ] **Step 3: 리다이렉트·`[lang]` 밖 페이지·404 를 확인한다**

```bash
B=http://localhost:3100
for p in / /vote /vote/295 /mypage /concert2025 "/vote?status=ongoing"; do
  printf '%s -> ' "$p"; curl -sI "$B$p" | grep -iE '^(HTTP|location)' | tr '\n' ' '; echo; done
for p in /auth/loading /ads/shortform/player /ko/login /ko/mypage/qna/new; do
  printf '%s -> %s ' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; curl -s "$B$p" | grep -oE '<html[^>]*>' | head -1; done
printf '404 -> %s ' "$(curl -s -o /dev/null -w '%{http_code}' $B/ko/no/such/page)"; curl -s $B/ko/no/such/page | grep -oE '<html[^>]*>' | head -1
VOTE=$(curl -s $B/sitemap.xml | grep -oE '/ko/vote/[0-9]+' | head -1)
printf '%s -> %s ' "$VOTE" "$(curl -s -o /dev/null -w '%{http_code}' "$B$VOTE")"; curl -sI "$B$VOTE" | grep -i '^cache-control'
```

Expected:
- `/` → 307 `/en/vote`; `/vote` → 307 `/en/vote`; `/vote/295` → 307 `/en/vote/295`; `/mypage` → 307 `/en/mypage`; `/concert2025` → 307 `/en/concert2025`; `/vote?status=ongoing` → 307 `/en/vote?status=ongoing`.
- `/auth/loading`, `/ads/shortform/player` → 200 `<html lang="ko">`; `/ko/login`, `/ko/mypage/qna/new` → 200 `<html lang="ko">`.
- `/ko/no/such/page` → 404 `<html lang="ko">`.
- 투표 상세 → 200, `private, no-cache, no-store`.

- [ ] **Step 4: 브라우저 스모크**

`http://localhost:3100` 에서 Playwright(또는 수동)로 확인한다.
1. `/ko/vote?status=ongoing` 에서 언어를 English 로 바꾸면 `/en/vote?status=ongoing` 이 된다.
2. `/ko/login` 이 렌더되고 소셜 로그인 버튼과 언어 선택기가 보인다. 콘솔에 hydration 오류가 없다.
3. `/ko/rewards`, `/ko/faq`, `/ko/notice`, 공지 하나의 상세가 데이터와 함께 렌더된다(폴백 "공지사항을 불러오지 못했습니다" 가 아니다).
4. `/auth/loading` 이 스타일이 적용된 로딩 화면으로 보인다.
5. `/ko/mypage` 는 비로그인 시 기존과 같은 동작(로그인 유도)을 한다.

Run (종료): `pkill -f "next start -p 3100"; rm -f .next-start.log`

- [ ] **Step 5: 문서에 결과를 기록한다**

`docs/superpowers/specs/2026-09-30-root-layout-isr-design.md` 의 상태 줄을 `- 상태: 구현 완료 (PR 참조)` 로 바꾼다.

`docs/audit-2026-09-26/plan.md` — §5.4 의 남은 항목 목록에서 `- 루트 \`headers()\` 제거·ISR(결정 #8)은 별도 설계` 줄을 아래로 바꾼다(빌드 표 수치는 Step 1 의 실제 출력으로 채운다).

```markdown
- ~~루트 `headers()` 제거·ISR(결정 #8)~~ **구현(2026-09-30)**: 루트 레이아웃 pass-through, `[lang]` 레이아웃이 `<html lang>` 소유, `[lang]` 밖 페이지는 `app/(bare)/`. rewards 60s, rewards/[id]·faq·notice·notice/[id] 300s, download·sitemap 3600s ISR. `/vote/[id]`·`/star-candy`·`/privacy`·`/terms` 는 `force-dynamic` 명시. 모든 페이지의 렌더링 모드는 `__tests__/app/rendering-mode-contract.test.ts` 가 고정. 설계 `docs/superpowers/specs/2026-09-30-root-layout-isr-design.md`. 후속: `/vote/[id]` ISR, 미지원 언어 404·접두어 없는 경로 리다이렉트, middleware `x-locale` 제거
```

- [ ] **Step 6: 전체 검증 후 커밋·푸시·PR**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 전부 통과.

```bash
git status --short --untracked-files=all
git add docs/audit-2026-09-26/plan.md docs/superpowers/specs/2026-09-30-root-layout-isr-design.md docs/superpowers/plans/2026-09-30-root-layout-isr.md
git commit -m "docs(audit): record root layout restructure and ISR rollout"
git push -u origin refactor/root-layout-isr
gh pr create --title "refactor(layout): remove root headers() and enable ISR for rewards/faq/notice" --body-file <(cat <<'EOF'
## 요약
- 루트 레이아웃의 `headers()` 를 없애 공개 페이지가 ISR/CDN 캐시를 탄다 (PERF-01, 결정 #8).
- `<html lang>` 은 `[lang]` 레이아웃이 경로 파라미터로 렌더한다. `[lang]` 밖 페이지는 `app/(bare)/` 로 이동 (URL 불변).
- rewards 60s, rewards/[id]·faq·notice·notice/[id] 300s ISR. `/vote/[id]` 등은 `force-dynamic` 명시.
- 모든 페이지의 렌더링 모드를 계약 테스트로 고정.

## 검증
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npx next build` 통과
- `next start` 에서 캐시 헤더·`<html lang>`·리다이렉트·404·`/auth/*` 확인 (계획 Task 6)

## 머지 후 확인
- Production 에서 `/ko/rewards` 두 번째 요청이 `x-vercel-cache: HIT`
- 로그인/로그아웃, Sentry 신규 이슈

설계: `docs/superpowers/specs/2026-09-30-root-layout-isr-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

Vercel Preview 는 이 레포에서 생성되지 않으므로 Preview 확인 단계는 건너뛴다. 교차 리뷰(반대 공급자)는 PR 생성 후 usage-aware-orchestration 게이트를 거쳐 배정하고, 승인 전에는 머지하지 않는다.
