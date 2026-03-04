# Weekly Refactor Plan: picnic-web Batch 2 — Top 3 파일 분해

## Context

이전 리팩터링(StarCandyProductsPresenter 953줄, social/service 901줄, goong-hap/new/page 849줄)이 완료됨.
이번에는 남은 300줄+ 파일 중 가장 큰 3개를 분해한다:
- `utils/image-utils.ts` (1,009줄)
- `components/client/vote/detail/VoteDetailPresenter.tsx` (817줄)
- `app/[lang]/(main)/goong-hap/[id]/GoongHapDetailClient.tsx` (802줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. image-utils.ts (1,009줄 → 5파일)

### 현황 분석
- 14개 하위 시스템이 단일 파일에 혼재: URL 파싱, Supabase 통합, 서명 URL, 프리로딩, 프로바이더 추출
- `resolveAvatarUrlClient()` 307줄 모놀리식 함수 (5+ 직교 관심사)
- 순수 유틸리티 — React 의존 없음

### 외부 소비자 (6곳)
| 파일 | 사용 심볼 |
|------|----------|
| `app/api/user/profile/route.ts` | `extractAvatarFromProvider`, `extractSupabaseStorageReference`, `getSafeAvatarUrl` |
| `app/api/storage/signed-url/route.ts` | `extractSupabaseStorageReference`, `AvatarTransformOptions` |
| `components/ui/SafeAvatar.tsx` | `createImageErrorHandler`, `isFailedImageUrl`, `resolveAvatarUrlClient` |
| `components/ui/ProfileImageContainer.tsx` | `resolveAvatarUrlClient` |
| `components/client/media/MediaListPresenter.tsx` | `preloadImage` |
| `lib/supabase/auth-store.ts` | `extractAvatarFromProvider` |

### 새 파일 트리
```
utils/
├── image-utils.ts              (~60줄)  re-export barrel — 기존 import 경로 유지
├── image/
│   ├── types.ts                (~50줄)  인터페이스, 타입, 상수
│   ├── supabase-storage.ts     (~180줄) Supabase URL 파싱 + 서명 URL 생성
│   ├── avatar-resolver.ts      (~320줄) resolveAvatarUrlClient + 디버그 + 프리로딩
│   ├── image-optimizer.ts      (~120줄) getOptimizedSupabaseImageUrl + getProxiedImageUrl + getSafeGoogleImageUrl
│   └── provider-avatar.ts      (~130줄) extractAvatarFromProvider + getSafeAvatarUrl + 에러 핸들러 + 검증
```

### 심볼 이동맵

**`image/types.ts`** (신규, ~50줄):
- `AvatarTransformOptions` 인터페이스
- `AvatarDebugStep`, `AvatarDebugLogPayload` 타입
- `SupabaseStorageReference`, `ResolveAvatarOptions` 인터페이스
- `SUPABASE_RENDER_PATH`, `SUPABASE_RENDER_SIGN_PATH`, `SUPABASE_OBJECT_PATH` 상수
- `ENABLE_AVATAR_DEBUG` 플래그
- `hasTransformOptions()`, `sanitizeDimension()`, `clampQuality()`, `encodePathSegment()` 헬퍼

**`image/supabase-storage.ts`** (신규, ~180줄):
- `getSupabaseBase()` — URL 해석
- `getSupabaseHost()` — 호스트 추출
- `extractSupabaseStorageReference()` — 복합 URL 파싱
- `fetchSignedSupabaseImageUrl()` — 서버 사이드 서명 URL 생성
- `sendAvatarDebugLog()` — 디버그 로그 전송

**`image/avatar-resolver.ts`** (신규, ~320줄):
- `resolveAvatarUrlClient()` — 메인 아바타 해석 엔진 (307줄 함수)
- `preloadImage()` — Promise 기반 이미지 프리로딩

**`image/image-optimizer.ts`** (신규, ~120줄):
- `getOptimizedSupabaseImageUrl()` — Supabase 이미지 최적화 파라미터
- `getProxiedImageUrl()` — 프록시 래퍼
- `getSafeGoogleImageUrl()` — Google 이미지 최적화

**`image/provider-avatar.ts`** (신규, ~130줄):
- `extractAvatarFromProvider()` — 소셜 프로바이더별 아바타 추출
- `getSafeAvatarUrl()` — 메인 공개 함수 (검증 → 최적화 → 프록시)
- `createImageErrorHandler()` — React 이미지 에러 핸들러 팩토리
- `isFailedImageUrl()` — localStorage 실패 URL 체크
- `isValidImageUrl()` — URL 검증

**`image-utils.ts`** (수정, ~60줄):
- 모든 공개 심볼을 `image/` 하위 모듈에서 re-export
- 기존 6곳의 `from '@/utils/image-utils'` import 경로 불변

### DRY 개선
- URL path 파싱 로직 2곳 → `extractSupabaseStorageReference` 1곳으로 통합

---

## 2. VoteDetailPresenter.tsx (817줄 → 5파일)

### 현황 분석
- 18개 useState 훅 — 상태 관리 혼란
- `updateVoteDataPolling()` 294줄 모놀리식 폴링 함수
- 240줄+ JSX 렌더 (헤더, 포디움, 그리드, 알림, 디버거)
- 알림 시스템이 컴포넌트 전체에 산재

### 외부 소비자 (2곳)
| 파일 | 사용 |
|------|------|
| `components/server/vote/VoteDetailFetcher.tsx` | default export |
| `components/client/vote/VoteDetail/VoteDetail.tsx` | default export |

### 새 파일 트리
```
components/client/vote/detail/
├── VoteDetailPresenter.tsx     (~250줄) 상태 오케스트레이션 + 메인 레이아웃
├── vote-detail-types.ts        (~70줄)  인터페이스, 상수
├── useVotePolling.ts           (~300줄) 폴링 + 연결 품질 + 데이터 변환 훅
├── VotePodium.tsx              (~100줄) TOP 3 랭킹 표시
└── VoteNotifications.tsx       (~60줄)  토스트 알림 컴포넌트
```

### 심볼 이동맵

**`vote-detail-types.ts`** (신규, ~70줄):
- `NotificationState`, `DataSourceMode`, `ConnectionState`, `ConnectionQuality`, `ThresholdConfig` 타입
- 상수: `ERROR_RATE_PENALTY`, `CONSECUTIVE_ERROR_PENALTY`, `POLLING_LOG_THROTTLE_MS`, `DEFAULT_NOTIFICATION_DURATION_MS`, `SEARCH_DEBOUNCE_MS`, `HEADER_RECALC_DELAY_MS`
- `VoteDetailPresenterProps` 인터페이스 (export — VoteDetail.tsx에서 사용 가능)

**`useVotePolling.ts`** (신규, ~300줄) — 'use client' 불필요 (훅):
- `updateConnectionQuality()` — 품질 점수 계산
- `updateVoteDataPolling()` — API 호출 + 데이터 변환 + 사용자 투표 조회 (294줄 핵심)
- `startPollingMode()`, `stopPollingMode()` — 인터벌 관리
- 폴링 라이프사이클 effect
- 반환: `{ voteItems, userVote, connectionState, notifications, addNotification, removeNotification, startPolling, stopPolling }`
- 파라미터: `vote`, `voteId`, `userId`, `isActive`

**`VotePodium.tsx`** (신규, ~100줄) — 'use client':
- TOP 3 포디움 렌더링 (현재 592-639줄)
- Props: `topItems`, `currentLanguage`, `onCardClick`
- 그래디언트 보더, 메달 이모지, 애니메이션

**`VoteNotifications.tsx`** (신규, ~60줄) — 'use client':
- 토스트 알림 렌더링 (현재 724-766줄)
- Props: `notifications`, `onRemove`

**`VoteDetailPresenter.tsx`** (수정, ~250줄):
- `useVotePolling()` 훅 호출로 폴링 위임
- 헤더 섹션 인라인 유지 (~50줄, 스티키 + 그래디언트)
- 투표 그리드 인라인 유지 (~80줄, prop drilling 방지)
- `<VotePodium>`, `<VoteNotifications>` 컴포넌트 사용
- `handleCardClick`, `confirmVote`, `cancelVote` 유지 (투표 핸들러)
- 개발 디버거 패널 인라인 유지 (~30줄, dev-only)

### DRY 개선
- 알림 생성/제거 로직 통합 → `useVotePolling` 내부
- 연결 품질 업데이트 로직 → 폴링 훅 내부로 캡슐화

---

## 3. GoongHapDetailClient.tsx (802줄 → 5파일)

### 현황 분석
- 4개 ref로 관리하는 i18n 상태 머신 (i18nInvokedRef, i18nAttemptedRef, i18nFixRef, prevLangRef)
- 결제 플로우 상태 5개가 컴포넌트에 산재
- 300줄+ JSX 렌더 (헤더, 대기화면, 유료/무료 콘텐츠, 구매 다이얼로그)
- 언어 해석 로직 3곳 중복

### 외부 소비자 (1곳)
| 파일 | 사용 |
|------|------|
| `app/[lang]/(main)/goong-hap/[id]/page.tsx` | default export |

### 새 파일 트리
```
app/[lang]/(main)/goong-hap/[id]/
├── GoongHapDetailClient.tsx    (~280줄) 상태 오케스트레이션 + 조건부 렌더
├── goong-hap-detail-utils.ts   (~80줄)  상수, 언어 해석, 스켈레톤 미포함 헬퍼
├── useGoongHapDetail.ts        (~250줄) 데이터 로딩 + i18n + 처리 상태 훅
├── PurchaseDialog.tsx          (~120줄) 별사탕 구매 확인 다이얼로그
└── GoongHapHeader.tsx          (~100줄) 그래디언트 헤더 카드 (아바타 + 점수)
```

### 심볼 이동맵

**`goong-hap-detail-utils.ts`** (신규, ~80줄):
- `STAR_CANDY_COST` 상수
- `getLangCandidates(locale)` — 언어 변형 후보 생성 (중국어 특수 처리)
- `normalizeForServer(locale)` — 서버 호환 언어 코드
- `FullPageSkeleton` 컴포넌트 (66줄, 로딩 UI) — 순수 프레젠테이션

**`useGoongHapDetail.ts`** (신규, ~250줄) — 데이터 + i18n + 처리:
- 데이터 로딩: `refreshDetail()`, 초기 로딩 effect, 캐시 통합
- i18n 관리: 4개 ref 기반 상태 머신, 한글 감지, Edge Function 호출
- 처리 상태: pending 폴링 (15초 간격, 최대 4회), 카운트다운 타이머
- 반환: `{ data, loading, error, mounted, localized, artistName, currentLang, countdown, processing, refreshDetail }`

**`PurchaseDialog.tsx`** (신규, ~120줄) — 'use client':
- 별사탕 구매 확인 모달 (현재 714-797줄)
- Props: `show`, `onClose`, `onConfirm`, `purchasing`, `purchaseError`, `userStarCandy`, `starCandyCost`, `t`, `getLocalizedPath`
- 잔액 표시, 비용 차감 미리보기, 잔액 부족 시 충전 링크

**`GoongHapHeader.tsx`** (신규, ~100줄) — 'use client':
- 그래디언트 헤더 카드 (현재 545-584줄)
- 아티스트 이미지 + 하트 + 사용자 아바타
- 점수 표시 + 요약 텍스트
- Props: `data`, `localized`, `artistName`, `userProfile`, `currentLang`, `t`

**`GoongHapDetailClient.tsx`** (수정, ~280줄):
- `useGoongHapDetail()` 훅으로 데이터/i18n/처리 위임
- 구매 상태 관리: `showPurchaseDialog`, `purchasing`, `purchaseError`, `userStarCandy`
- `handlePurchase()` 핸들러 유지 (Edge Function 호출)
- JSX: 헤더 영역, 에러/대기 배너, `<GoongHapHeader>`, 유료/무료 콘텐츠, `<PurchaseDialog>`
- 유료/무료 콘텐츠 섹션 인라인 유지 (~70줄씩, 조건부 렌더링)
- `export default` 유지 — Next.js 라우팅 계약 보존 아님 (page.tsx가 import)

---

## 실행 순서

3개 파일은 완전 독립적. 병렬 실행 가능:

1. **image-utils.ts** — `image/types.ts` → `image/supabase-storage.ts` → `image/avatar-resolver.ts` → `image/image-optimizer.ts` → `image/provider-avatar.ts` → barrel 슬림화
2. **VoteDetailPresenter.tsx** — `vote-detail-types.ts` → `useVotePolling.ts` → `VotePodium.tsx` → `VoteNotifications.tsx` → 슬림화
3. **GoongHapDetailClient.tsx** — `goong-hap-detail-utils.ts` → `useGoongHapDetail.ts` → `PurchaseDialog.tsx` → `GoongHapHeader.tsx` → 슬림화

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit   # TYPECHECK
cd picnic-web && npm run build       # BUILD
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| image-utils.ts | 1,009 | ~60 (barrel) | 5 | ~860 |
| VoteDetailPresenter.tsx | 817 | ~250 | 4 | ~780 |
| GoongHapDetailClient.tsx | 802 | ~280 | 4 | ~830 |

모든 메인 파일이 300줄 이하. 추출된 파일도 320줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| image-utils barrel re-export 경로 | 기존 `@/utils/image-utils` import 유지, barrel에서 re-export |
| resolveAvatarUrlClient 307줄 함수 이동 | 함수 내부 로직은 변경하지 않고 파일만 이동 |
| VoteDetailPresenter default export | default + named export 모두 유지 |
| useVotePolling 의존성 배열 | 원본 클로저의 의존성 그대로 복사 |
| GoongHapDetailClient i18n ref 상태 | 4개 ref를 훅 내부로 그대로 이동, 로직 변경 없음 |
| 'use client' 누락 | VotePodium, VoteNotifications, PurchaseDialog, GoongHapHeader에 필수 |
| image/ 하위 디렉토리 모듈 해석 | tsconfig paths에 영향 없음 (상대 경로 사용) |

---

## 이전 배치와의 차이점

| 항목 | Batch 1 | Batch 2 |
|------|---------|---------|
| 대상 유형 | 컴포넌트 2 + 서비스 1 | 유틸리티 1 + 컴포넌트 2 |
| 최대 파일 크기 | 953줄 | 1,009줄 |
| 새 전략 | 없음 | barrel re-export (image-utils) |
| 모놀리식 함수 | 없음 | resolveAvatarUrlClient 307줄 (파일 이동만) |
| i18n 복잡도 | 낮음 | 높음 (GoongHapDetail 4-ref 상태 머신) |
