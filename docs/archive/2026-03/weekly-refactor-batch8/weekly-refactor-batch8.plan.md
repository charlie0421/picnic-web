# Weekly Refactor Plan: Batch 8 — picnic-web 300줄+ 파일 분해

## Context

이전 배치 완료:
- Batch 1 (top3): 100% | Batch 2: 93% | Batch 3: 95% | Batch 4: 95% | Batch 5: 93% | Batch 6: 93% | Batch 7: 94%

이번 대상: 남은 300줄+ 파일 중 실전 코드 Top 3:
- `utils/auth-redirect.ts` (471줄)
- `components/client/vote/common/VoteRankCard.tsx` (471줄)
- `app/[lang]/(main)/concert2025/page.tsx` (454줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. auth-redirect.ts (471줄 → 3파일)

### 새 파일 트리
```
utils/
├── auth-redirect.ts              (~200줄) 핵심 리다이렉트 로직 + barrel
├── auth-redirect-validators.ts   (~100줄) URL 검증 + 보안 유틸
└── auth-redirect-storage.ts      (~140줄) 스토리지 CRUD + 정리
```

### 심볼 이동맵

**`auth-redirect-validators.ts`** (신규, ~100줄) — 순수 검증 함수:
- `REDIRECT_URL_EXPIRY` const (line 13)
- `isValidRedirectUrl(url)` function (lines 18-83, 66줄)
- `shouldSaveUrl(url)` function (lines 340-355, 16줄)
- `getCurrentLocale()` function (lines 89-101, 13줄)
- Import: `DEFAULT_LANGUAGE` from `@/config/settings`
- 모두 export

**`auth-redirect-storage.ts`** (신규, ~140줄) — 스토리지 작업:
- `REDIRECT_URL_KEY`, `LOGIN_REDIRECT_KEY`, `REDIRECT_TIMESTAMP_KEY` consts (lines 8-10)
- `isRedirectUrlExpired()` function (lines 165-182, 18줄)
- `saveRedirectUrl(url)` function (lines 187-210, 24줄)
- `getRedirectUrl()` function (lines 215-246, 32줄)
- `clearRedirectUrl()` function (lines 251-268, 18줄)
- `clearAllAuthData()` function (lines 424-471, 48줄)
- Import: `isValidRedirectUrl` from `./auth-redirect-validators`
- Import: `normalizeRedirectPath` from `./auth-redirect`
- 모두 export

**`auth-redirect.ts`** (수정, ~200줄) — 리다이렉트 로직 + barrel:
- barrel re-exports from `./auth-redirect-validators`, `./auth-redirect-storage`
- `normalizeRedirectPath(input)` function (lines 107-160, 54줄) — 여기 유지 (storage에서 import)
- `handlePostLoginRedirect(returnToParam?)` function (lines 273-313, 41줄)
- `redirectToLogin(currentUrl?)` function (lines 318-335, 18줄)
- `usePostLoginRedirect()` function (lines 360-369, 10줄)
- `handleSessionTimeout()` function (lines 374-388, 15줄)
- `securityUtils` object (lines 393-418, 26줄) — `isValidRedirectUrl`, `isRedirectUrlExpired`, `handleSessionTimeout` 참조
- Import: `isValidRedirectUrl`, `shouldSaveUrl`, `getCurrentLocale` from `./auth-redirect-validators`
- Import: `saveRedirectUrl`, `getRedirectUrl`, `clearRedirectUrl`, `isRedirectUrlExpired` from `./auth-redirect-storage`

### 순환 의존성 방지
- `auth-redirect-storage.ts` → `auth-redirect.ts` (normalizeRedirectPath) 순환 위험
- 해결: `normalizeRedirectPath`를 `auth-redirect-validators.ts`로 이동하거나, storage에서 validators만 import
- 최종 결정: `normalizeRedirectPath`를 `auth-redirect-validators.ts`에 배치 (getCurrentLocale과 함께)
- 의존 방향: `storage → validators` (단방향), `auth-redirect → validators + storage` (barrel)

### 외부 import 영향
- 15개 소비자 모두 `from '@/utils/auth-redirect'` — barrel 경로 불변

---

## 2. VoteRankCard.tsx (471줄 → 3파일)

### 새 파일 트리
```
components/client/vote/common/
├── VoteRankCard.tsx              (~200줄) 상태 + 핸들러 + static 렌더
├── vote-rank-card-utils.ts       (~70줄) 상수 + 타입 + 스타일 헬퍼
└── VoteRankCardAnimated.tsx      (~210줄) framer-motion 애니메이션 렌더
```

### 심볼 이동맵

**`vote-rank-card-utils.ts`** (신규, ~70줄) — 순수 데이터, React 의존 없음:
- `VOTE_CHANGE_ANIMATION_MS` const (line 14)
- `VoteRankCardProps` interface (lines 16-35, 20줄)
- `getFullWidthSize(rank)` function (lines 135-166, 32줄)
- `getRankStyles(rank, isUpdated)` function — 랭크별 gradient/border 클래스 (3곳 중복 제거, ~15줄 신규)
- 모두 export

**`VoteRankCardAnimated.tsx`** (신규, ~210줄) — 'use client' 컴포넌트:
- `motion.div` 래핑 + 실시간 하이라이트/랭킹 변경 인디케이터
- framer-motion `AnimatePresence` 3개 영역 (highlight, rankChange, voteChange)
- `motion.div`, `motion.h3`, `motion.p` 애니메이션
- Props: 컴포넌트 내부 상태를 props로 전달 (item, rank, sizeClasses, artistName, imageSrc, displayVoteTotal 등)
- Import: `motion, AnimatePresence` from `framer-motion`
- Import: `OptimizedImage` from `@/components/ui/OptimizedImage`
- Import: `AnimatedCount` from `@/components/ui/animations/RealtimeAnimations`
- Import: `getLocalizedString` from `@/utils/api/strings`
- Import: `getRankStyles`, `VoteRankCardProps` from `./vote-rank-card-utils`
- `export default VoteRankCardAnimated`

**`VoteRankCard.tsx`** (수정, ~200줄):
- 상태 관리 (useState, useEffect for voteChange)
- `handleCardClick` 핸들러
- 계산 값 (artistName, imageSrc, displayVoteTotal, sizeClasses, realtimeInfo)
- `!enableMotionAnimations` → static 렌더 (lines 178-259, 인라인)
- `enableMotionAnimations` → `<VoteRankCardAnimated {...computedProps} />`
- Import: `vote-rank-card-utils`에서 상수/타입/헬퍼
- Import: `VoteRankCardAnimated` from `./VoteRankCardAnimated`
- `export { VoteRankCard }` 유지

### DRY 개선
- 랭크별 스타일 3곳 중복 (rank===1, 2, default) → `getRankStyles` 1곳 (~20줄 절감)

### 외부 import 영향
- `common/index.ts`와 `vote/index.ts`에서 re-export — 경로 불변
- 신규 파일은 내부 구현 — barrel에 노출하지 않음

---

## 3. concert2025/page.tsx (454줄 → 3파일)

### 새 파일 트리
```
app/[lang]/(main)/concert2025/
├── page.tsx                    (~200줄) 메인 페이지 컴포넌트
├── concert2025-data.ts         (~100줄) 데이터 상수 + 헬퍼 함수
└── Concert2025Guide.tsx        (~130줄) 안내사항 섹션 컴포넌트
```

### 심볼 이동맵

**`concert2025-data.ts`** (신규, ~100줄) — 순수 데이터, React 의존 없음:
- `Artist` type (line 29)
- `PosterFile` type (line 58)
- `VideoSource`, `VideoGroup` types (lines 103-104)
- `lineup` array (lines 30-37, 6 아티스트)
- `POSTERS_BY_SLUG` object (lines 59-80, 6 슬러그)
- `normalizeKey(s)` function (line 89)
- `slugToArtistName` 빌더 (lines 90-92)
- `pickImageBySlug(slug)` function (lines 95-100)
- `getPosterForVideoKey(key)` function (lines 125-146, 22줄)
- `toKeyFromFilename(name)` function (lines 106-110)
- Import: 없음 (순수 데이터)
- 모두 export

**`Concert2025Guide.tsx`** (신규, ~130줄) — Server Component (no 'use client'):
- 한국어 안내사항 전체 (lines 233-351): seating, booking, pickup, entry, policy, storage, transit
- Props: `{ t: (key: string) => string, mapImagePublicRelative: string }`
- Import: `Image` from `next/image`
- `export default Concert2025Guide`

**`page.tsx`** (수정, ~200줄):
- `generateMetadata` function 유지
- `export default Concert2025Page` 유지
- `concert2025-data`에서 데이터/헬퍼 import
- `Concert2025Guide`에서 안내 섹션 import
- video 빌드 로직 (fs/path) 유지 (서버 전용)
- JSX: Hero, Notice, Info Bar, BookingButtons/CN Ticket, Video, WeChat QR, Posters

### 외부 import 영향
- Next.js convention 파일 — 외부에서 import하지 않음
- `export default` 유지 필수

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **auth-redirect.ts** — `auth-redirect-validators.ts` → `auth-redirect-storage.ts` → barrel 전환
2. **VoteRankCard.tsx** — `vote-rank-card-utils.ts` → `VoteRankCardAnimated.tsx` → 슬림화
3. **concert2025/page.tsx** — `concert2025-data.ts` → `Concert2025Guide.tsx` → 슬림화

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular [files]
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| auth-redirect.ts | 471 | ~200 | 2 | ~440 |
| VoteRankCard.tsx | 471 | ~200 | 2 | ~480 |
| concert2025/page.tsx | 454 | ~200 | 2 | ~430 |

모든 메인 파일이 300줄 이하. 추출된 파일도 250줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| auth-redirect-storage → auth-redirect 순환 | normalizeRedirectPath를 validators에 배치 |
| securityUtils 객체가 여러 파일의 함수 참조 | barrel에서 import 후 조립 |
| VoteRankCardAnimated의 props 수 증가 | 계산된 값을 객체로 묶어 전달 |
| Concert2025Guide가 t() 함수 의존 | props로 t 함수 주입 — Server Component 호환 |
| `export default` 보존 | page.tsx default export 유지 |
