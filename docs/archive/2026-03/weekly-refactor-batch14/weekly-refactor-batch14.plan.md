# Weekly Refactor Batch 14 Plan

## 대상 파일 (3개, 각 300줄 초과)

| 파일 | Before | After | 신규 파일 |
|------|--------|-------|----------|
| `utils/image/avatar-resolver.ts` | 358 | ~210 | `avatar-resolver-fallback.ts` (~155) |
| `app/[lang]/(main)/goong-hap/[id]/GoongHapDetailClient.tsx` | 358 | ~275 | `useGoongHapPurchase.ts` (~90) |
| `components/client/vote/detail/useVotePolling.ts` | 356 | ~240 | `vote-polling-data.ts` (~125) |

## Hard Constraints
- behavior-preserving, 공개 API 변경 금지
- 새 의존성 금지, 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. avatar-resolver.ts (358줄 → ~210 + ~155)

### Consumer (1)
- `utils/image-utils.ts` → barrel `export { resolveAvatarUrlClient, preloadImage }`

### 신규: `utils/image/avatar-resolver-fallback.ts` (~155줄)
순수 함수, 단일 책임 — 폴백 후보 시도 로직:
- `buildFallbackCandidates(params)` — 폴백 후보 URL 목록 생성 (lines 172-222)
  - params: { reference, wasSigned, originalUrlWithoutTransform, avatarUrl, finalUrl, fallbackUrl, transform, options }
  - returns: Array<{ url: string; isSigned: boolean }>
- `tryLoadCandidates(candidates, options, recordStep)` — 폴백 후보 순회 시도 (lines 224-272)
  - 각 후보 preloadImage 시도, 성공 시 결과 반환
  - AbortError 전파
- `tryObjectUrl(reference, recordStep)` — 공개 오브젝트 URL 시도 (lines 274-317)
  - buildSupabaseObjectUrl + preloadImage
- imports: types, supabase-storage, preloadImage from './avatar-resolver'

### 수정: `avatar-resolver.ts` (~210줄)
- import { buildFallbackCandidates, tryLoadCandidates, tryObjectUrl } from './avatar-resolver-fallback'
- lines 172-317 (폴백 로직 ~146줄) → 3개 함수 호출로 대체 (~15줄)
- resolveAvatarUrlClient, preloadImage export 유지

### 외부 영향: 없음 (barrel 경로 불변)

---

## 2. GoongHapDetailClient.tsx (358줄 → ~275 + ~90)

### Consumer (1)
- `goong-hap/[id]/page.tsx` → `import GoongHapDetailClient from './GoongHapDetailClient'`

### 신규: `app/[lang]/(main)/goong-hap/[id]/useGoongHapPurchase.ts` (~90줄)
구매 상태 + 핸들러 커스텀 훅:
- `useGoongHapPurchase(params)` hook
  - params: { id, t, refreshDetail }
  - 내부 state: showPurchaseDialog, purchasing, purchaseError, userStarCandy, lastPurchaseTime ref
  - fetchUserStarCandy callback (lines 54-68)
  - handleOpenPurchaseDialog callback (lines 71-80)
  - handlePurchase callback (lines 83-127)
  - returns: { showPurchaseDialog, setShowPurchaseDialog, purchasing, purchaseError, userStarCandy, handleOpenPurchaseDialog, handlePurchase }

### 수정: `GoongHapDetailClient.tsx` (~275줄)
- import { useGoongHapPurchase } from './useGoongHapPurchase'
- 구매 관련 state/callback 제거 (lines 47-127, ~81줄)
- useGoongHapPurchase({ id, t, refreshDetail }) 호출로 대체
- 'use client', export default 유지
- JSX 렌더 로직 전부 유지

### 외부 영향: 없음 (import 경로 불변)

---

## 3. useVotePolling.ts (356줄 → ~240 + ~125)

### Consumer (1)
- `components/client/vote/detail/useVoteDetail.ts` → `import { useVotePolling }`

### 신규: `components/client/vote/detail/vote-polling-data.ts` (~125줄)
순수 함수/상수 — React 의존 없음:
- `DEFAULT_THRESHOLDS: ThresholdConfig` — 임계값 상수 (lines 64-71)
- `createInitialConnectionState(): ConnectionState` — 초기 상태 팩토리 (lines 45-51)
- `createInitialConnectionQuality(): ConnectionQuality` — 초기 품질 팩토리 (lines 54-62)
- `computeConnectionQuality(prev, success, responseTime?)` — 품질 계산 순수 함수 (lines 119-143 body)
- `transformVoteItems(items: VoteItem[]): VoteItem[]` — 투표 아이템 변환/정렬 (lines 30-38 + 185-212)
- `buildUserVoteSummary(userVoteData, shouldLog?)` — 사용자 투표 요약 생성 (lines 249-271)
- `UseVotePollingParams` interface (lines 15-21) 이동

### 수정: `useVotePolling.ts` (~240줄)
- import helpers from './vote-polling-data'
- 초기 state → `createInitialConnectionState()`, `createInitialConnectionQuality()` 호출
- thresholds 인라인 → `DEFAULT_THRESHOLDS` import
- updateConnectionQuality useCallback body → `computeConnectionQuality()` 호출로 간소화
- voteItems 변환 로직 → `transformVoteItems()` 호출
- 사용자 투표 처리 → `buildUserVoteSummary()` 호출
- UseVotePollingParams interface 제거 (import로 대체)
- hook return, lifecycle effect 유지

### 외부 영향: 없음 (import 경로 불변)

---

## 실행 순서
3개 파일 완전 독립 → 병렬 에이전트 실행
검증: `npx tsc --noEmit` + `npm run build`
