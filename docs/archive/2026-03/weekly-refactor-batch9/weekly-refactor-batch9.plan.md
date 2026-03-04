# Weekly Refactor Batch 9 Plan

## Target Files

| File | Lines | Category |
|------|:-----:|----------|
| `app/api/payment/portone/webhook/route.ts` | 452 | API Route (Webhook) |
| `components/ui/animations/RealtimeAnimations.tsx` | 451 | UI Components |
| `components/client/vote/list/VoteCard.tsx` | 451 | Client Component |

## Hard Constraints

- Behavior-preserving: 기존 동작 100% 유지
- 공개 API/export 변경 금지
- 새 의존성 금지
- 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. portone/webhook/route.ts (452줄 → 2파일)

### 새 파일 트리
```
app/api/payment/portone/webhook/
├── route.ts              (~280줄) POST 핸들러 + 메인 로직
└── webhook-helpers.ts    (~170줄) 타입, 상수, 검증/처리 헬퍼
```

### 심볼 이동맵

**`webhook-helpers.ts`** (신규, ~170줄):
- `PortOneV2PaymentResponse` interface (25줄)
- `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, `paymentClient` 상수 초기화
- `createServiceRoleSupabaseClient()` 함수 (20줄)
- `verifyWebhookSignature(body, signature, secret)` 함수 (35줄)
- `verifyPortOnePayment(paymentId)` 함수 (35줄)
- `createReceipt(supabase, paymentData)` — receipt 생성 로직 추출 (~40줄)
- `updateStarCandyBalance(supabase, userId, amount)` — 잔액 업데이트 추출 (~30줄)

**`route.ts`** (수정, ~280줄):
- `POST` export default 핸들러 유지
- `webhook-helpers`에서 import
- 메인 플로우 오케스트레이션만 남김: 서명 검증 → 결제 조회 → DB 처리 → 응답

### 외부 import 영향
- `route.ts`의 `export async function POST` 유지 — Next.js API route 계약 보존
- `lib/payment/portone.ts`에서 `portone/webhook` 문자열 참조 — import가 아님, 영향 없음

### 순환 의존성 리스크: 없음
- `webhook-helpers.ts` → 외부 패키지만 의존 (supabase, portone SDK)
- `route.ts` → `webhook-helpers.ts` (단방향)

---

## 2. RealtimeAnimations.tsx (451줄 → 3파일)

### 새 파일 트리
```
components/ui/animations/
├── RealtimeAnimations.tsx      (~120줄) barrel re-export + AnimatedCount, RealtimePulse, MotionProgressBar
├── AnimatedVoteComponents.tsx  (~190줄) AnimatedVoteItem, VoteSkeleton, AnimatedVoteList
└── ConnectionStatus.tsx        (~90줄)  ConnectionStatus 단독
```

### 심볼 이동맵

**`AnimatedVoteComponents.tsx`** (신규, ~190줄, 'use client'):
- `AnimatedVoteItemProps` interface + `AnimatedVoteItem` (96줄)
- `VoteSkeletonProps` interface + `VoteSkeleton` (73줄)
- `AnimatedVoteListProps` interface + `AnimatedVoteList` (18줄)
- Vote 관련 애니메이션 그룹핑

**`ConnectionStatus.tsx`** (신규, ~90줄, 'use client'):
- `ConnectionStatusProps` interface + `ConnectionStatus` (82줄)
- 독립적 UI — vote와 무관한 연결 상태 표시

**`RealtimeAnimations.tsx`** (수정, ~120줄):
- 'use client' 유지
- `AnimatedCount` (50줄), `RealtimePulse` (19줄), `MotionProgressBar` (28줄) 인라인 유지
- barrel re-export:
  ```ts
  export { AnimatedVoteItem, AnimatedVoteList, VoteSkeleton } from './AnimatedVoteComponents';
  export type { AnimatedVoteItemProps, AnimatedVoteListProps, VoteSkeletonProps } from './AnimatedVoteComponents';
  export { ConnectionStatus } from './ConnectionStatus';
  export type { ConnectionStatusProps } from './ConnectionStatus';
  ```

### 외부 import 영향
- 3개 consumer 모두 `from '@/components/ui/animations/RealtimeAnimations'` → barrel 유지, 변경 없음
- `AnimatedCount`는 가장 많이 사용 (3곳) → `RealtimeAnimations.tsx`에 인라인 유지

### 순환 의존성 리스크: 없음
- `AnimatedVoteComponents.tsx`, `ConnectionStatus.tsx` → 외부 패키지만 (framer-motion)
- `RealtimeAnimations.tsx` → 신규 파일 re-export (단방향)

---

## 3. VoteCard.tsx (451줄 → 2파일)

### 새 파일 트리
```
components/client/vote/list/
├── VoteCard.tsx           (~250줄) memo 컴포넌트 + timer effect
└── vote-card-utils.ts     (~180줄) 상수, 타입, 순수 헬퍼 함수
```

### 심볼 이동맵

**`vote-card-utils.ts`** (신규, ~180줄):
- `VoteCardProps` interface
- `VOTE_STATUS` 상수 객체
- `STATUS_TAG_COLORS` 매핑
- `TIMELINE_TONES` 매핑
- `CATEGORY_COLORS` 매핑
- `SUB_CATEGORY_COLORS` 매핑
- `STATUS_LABEL_FALLBACK` 매핑
- `computeVoteStatus(vote)` — 투표 상태 계산
- `computeTimeLeft(endDate)` — 남은 시간 계산
- `getStatusText(status)` — 상태 텍스트
- `toTitleCase(str)` — 문자열 변환
- `getCategoryLabel(category)` — 카테고리 라벨
- `getSubCategoryLabel(subCategory)` — 서브카테고리 라벨

**`VoteCard.tsx`** (수정, ~250줄):
- `vote-card-utils`에서 모든 상수/헬퍼 import
- `VoteCard` memo 컴포넌트 유지 (타이머 useEffect + JSX 렌더)
- `export default VoteCard` 유지

### 외부 import 영향
- `VoteListPresenter.tsx`에서 `import VoteCard from './VoteCard'` → default export 유지, 변경 없음
- `vote-card-utils.ts`는 내부 구현 — barrel 노출 불필요

### 순환 의존성 리스크: 없음
- `vote-card-utils.ts` → 의존성 없음 (순수 함수)
- `VoteCard.tsx` → `vote-card-utils.ts` (단방향)

---

## 실행 순서

3개 파일 완전 독립. 병렬 실행 가능:

1. **portone/webhook/route.ts** — `webhook-helpers.ts` 생성 → `route.ts` 슬림화
2. **RealtimeAnimations.tsx** — `AnimatedVoteComponents.tsx` + `ConnectionStatus.tsx` 생성 → barrel화
3. **VoteCard.tsx** — `vote-card-utils.ts` 생성 → 컴포넌트 슬림화

검증:
```bash
cd picnic-web && npx tsc --noEmit   # TYPECHECK
cd picnic-web && npx madge --circular --extensions ts,tsx .  # CIRCULAR DEP
cd picnic-web && VERCEL=1 npm run build  # BUILD
```

## 최종 줄 수 요약

| File | Before | After (Main) | New Files | Total |
|------|--------|-------------|-----------|-------|
| portone/webhook/route.ts | 452 | ~280 | 1 (~170) | ~450 |
| RealtimeAnimations.tsx | 451 | ~120 | 2 (~280) | ~400 |
| VoteCard.tsx | 451 | ~250 | 1 (~180) | ~430 |

모든 파일 300줄 이하 목표 달성.

## 리스크

| Risk | Mitigation |
|------|------------|
| Webhook 서명 검증 순서 중요 | route.ts 내 호출 순서 유지, 헬퍼는 stateless |
| 'use client' 누락 | AnimatedVoteComponents, ConnectionStatus에 필수 |
| PortOne SDK 초기화 타이밍 | 모듈 스코프 초기화를 webhook-helpers에서 유지 |
| barrel re-export 타입 누락 | interface + component 모두 re-export 필수 |
