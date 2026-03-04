# Weekly Refactor Plan: Batch 4 — picnic-web 300줄+ 파일 분해

## Context

이전 배치 완료:
- Batch 1 (top3): supabase-service, client, auth-provider → 100%
- Batch 2: StarCandyProductsPresenter, social/service, goong-hap/new/page → 93%
- Batch 3: auth-store, error, date → 95%

이번 대상: 남은 300줄+ 파일 중 가장 큰 3개:
- `stores/voteStore.ts` (677줄)
- `app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaDetailClient.tsx` (676줄)
- `lib/data-fetching/server/community-service.ts` (641줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. voteStore.ts (677줄 → 3파일)

### 새 파일 트리
```
stores/
├── voteStore.ts              (~290줄) Zustand create + setter actions
├── vote-store-types.ts       (~150줄) 인터페이스 + 초기 상태
└── vote-store-api.ts         (~240줄) API 액션 + 타이머
```

### 심볼 이동맵

**`vote-store-types.ts`** (신규, ~150줄) — 타입 + 초기 상태, 런타임 로직 없음:
- `VoteSubmissionState` interface (lines 14-20)
- `VoteParticipationState` interface (lines 22-27)
- `VoteResultsState` interface (lines 29-35)
- `VoteDetailState` interface (lines 37-49)
- `VoteStore` interface (lines 52-126)
- `initialVoteDetailState` const (lines 129-136)
- `initialParticipationState` const (lines 138-143)
- `initialSubmissionState` const (lines 145-151)
- `initialResultsState` const (lines 153-159)

**`vote-store-api.ts`** (신규, ~240줄) — API 호출 + 타이머 관리:
- `statusUpdateInterval` 모듈 변수 (line 162)
- `VoteStoreSet` / `VoteStoreGet` 타입 별칭
- `createVoteApiActions(set, get)` 팩토리 함수 반환:
  - `loadVoteDetail` (lines 439-520, 82줄)
  - `loadVoteResults` (lines 522-587, 66줄)
  - `submitUserVote` (lines 589-627, 39줄)
  - `startStatusUpdates` (lines 629-663, 35줄)
  - `stopStatusUpdates` (lines 665-670, 6줄)

**`voteStore.ts`** (수정, ~290줄):
- `vote-store-types`에서 타입 + 초기 상태 import
- `vote-store-api`에서 `createVoteApiActions` import
- 15개 단순 setter actions 인라인 유지 (각 7-12줄)
- `create<VoteStore>()(devtools((set, get) => ({ ...initials, ...setters, ...createVoteApiActions(set, get) })))` 패턴
- `useVoteStore` + 4개 state interface re-export

### 외부 import 영향
- VoteItem.tsx, VoteSubmit.tsx, VoteResults.tsx, VoteList.tsx → `@/stores/voteStore`에서 `useVoteStore` import — 경로 불변
- 4개 state interface는 voteStore.ts barrel에서 re-export

---

## 2. QnaDetailClient.tsx (676줄 → 5파일)

### 새 파일 트리
```
app/[lang]/(mypage)/mypage/qna/[thread_id]/
├── QnaDetailClient.tsx       (~250줄) 메인 컴포넌트 (상태 + JSX)
├── qna-utils.ts              (~80줄) 타입 + 순수 유틸
├── useQnaForm.ts             (~120줄) 폼/첨부파일 핸들링 훅
├── QnaMessageList.tsx         (~170줄) 메시지 렌더링 컴포넌트
└── QnaMediaModal.tsx          (~60줄) 이미지/비디오 라이트박스
```

### 심볼 이동맵

**`qna-utils.ts`** (신규, ~80줄) — 타입 + 순수 함수, React 의존 없음:
- `UiQnaMessage` interface (lines 18-22)
- `QnaDetailClientProps` interface (lines 14-16)
- `formatDate(dateString)` (lines 24-32)
- `formatTime(dateString)` (lines 34-41)
- `generateVideoThumbnail(file)` (lines 43-74)

**`useQnaForm.ts`** (신규, ~120줄) — 'use client' 폼 로직 훅:
- `attachments`, `previewUrls`, `fileObjectUrls` state
- `isSubmitting` state + `submittingRef`
- `fileInputRef`, `formRef` refs
- `handleFileChange(e)` (lines 196-230)
- `removeAttachment(index)` (lines 232-268)
- `formAction(formData)` (lines 270-354)
- `handleSubmit(e)` (lines 356-368)
- 반환: `{ attachments, previewUrls, isSubmitting, fileInputRef, formRef, handleFileChange, removeAttachment, handleSubmit }`

**`QnaMessageList.tsx`** (신규, ~170줄) — 'use client' 컴포넌트:
- `ExpandableText` 내부 컴포넌트 (lines 153-171)
- `renderMessagesWithDateDividers` 로직 (lines 370-496)
- 첨부파일 렌더링 (비디오/이미지/파일)
- Props: `messages`, `thread`, `onSelectImage`, `onSelectVideo`, `t`, `tDynamic`

**`QnaMediaModal.tsx`** (신규, ~60줄) — 'use client' 컴포넌트:
- `selectedImage` 라이트박스 (lines 636-651)
- `selectedVideo` 플레이어 (lines 653-673)
- Escape 키 핸들러 effect (lines 179-194)
- Props: `selectedImage`, `selectedVideo`, `onCloseImage`, `onCloseVideo`

**`QnaDetailClient.tsx`** (수정, ~250줄):
- 훅 초기화: `useQnaForm()` 호출
- categories fetch effect + `getCategoryLabel` (lines 102-127)
- `latestMessage` 계산 + `showAdminSilenceNotice` (lines 130-139)
- `SubmitButton` 인라인 (10줄, 추출 비용 > 이득)
- `scrollToBottom` effect
- JSX: header, `<QnaMessageList>`, footer (form), `<QnaMediaModal>`

### 외부 import 영향
- `page.tsx`: `import QnaDetailClient from './QnaDetailClient'` — default export 유지, 경로 불변
- 신규 파일은 동일 디렉토리 내 구현 상세

---

## 3. community-service.ts (641줄 → 4파일)

### 새 파일 트리
```
lib/data-fetching/server/
├── community-service.ts          (~25줄) barrel re-export
├── community/types.ts            (~70줄) 인터페이스 + 헬퍼
├── community/posts.ts            (~250줄) 게시글 + 댓글 조회
└── community/boards.ts           (~280줄) 게시판 + 북마크 조회
```

### 심볼 이동맵

**`community/types.ts`** (신규, ~70줄) — 타입 + 순수 헬퍼:
- `BoardQueryRow` interface (lines 3-24)
- `extractLocalizedString(value)` (lines 26-33)
- `extractLocalizedStringOrNull(value)` (lines 35-42)
- `mapBoardRowToSummary(b)` (lines 44-60)
- `CommunityArtistInfo` interface (lines 62-67)
- `CommunityPostSummary` interface (lines 69-79)
- `CommunityAuthor` interface (lines 81-84)
- `CommunityPostDetail` interface (lines 86-94)
- `CommunityComment` interface (lines 96-104)
- `FeedResult` interface (lines 106-110)
- `CommunityBoardSummary` interface (lines 112-119)
- `CommunityBoardMeta` interface (lines 121-126)
- `CommunityHotPostSummary` interface (lines 128-130)

**`community/posts.ts`** (신규, ~250줄) — 게시글/댓글 CRUD:
- `getCommunityFeed({ page, limit })` (lines 132-192, 61줄)
- `getCommunityPost(postId)` (lines 194-261, 68줄)
- `getHotCommunityPosts({ limit, days })` (lines 263-336, 74줄)
- `getCommunityComments(postId)` (lines 338-379, 42줄)
- `community/boards`에서 `getBoardsByIds` import (getCommunityFeed, getHotCommunityPosts에서 사용)

**`community/boards.ts`** (신규, ~280줄) — 게시판 + 사용자 북마크:
- `getBoards({ page, limit })` (lines 381-403, 23줄)
- `getBoardPosts(boardId, { page, limit })` (lines 405-446, 42줄)
- `getBoardMeta(boardId)` (lines 448-469, 22줄)
- `searchBoards(query, { limit })` (lines 510-536, 27줄)
- `getBoardsByIds(ids)` (lines 538-556, 19줄)
- `getUserBookmarkedArtistIds()` (lines 471-490, 20줄)
- `getUserBookmarkedBoardIds()` (lines 492-508, 17줄)
- `getBoardsPrioritizedForUser({ page, limit })` (lines 558-608, 51줄)
- `getBoardsForUserFavoritesOnly({ page, limit })` (lines 610-641, 32줄)

**`community-service.ts`** (수정, ~25줄) — barrel re-export:
```ts
// Types
export type { CommunityArtistInfo, CommunityPostSummary, ... } from './community/types';
// Posts
export { getCommunityFeed, getCommunityPost, getHotCommunityPosts, getCommunityComments } from './community/posts';
// Boards
export { getBoards, getBoardPosts, getBoardMeta, searchBoards, getBoardsByIds, ... } from './community/boards';
```

### 의존 방향 (순환 없음)
```
community-service.ts (barrel)
    ├── community/posts.ts → community/types.ts, community/boards.ts (getBoardsByIds)
    └── community/boards.ts → community/types.ts
```

### 외부 import 영향
- 9개 외부 파일 모두 `@/lib/data-fetching/server/community-service`에서 import — barrel 경로 불변
- 모든 export 심볼 보존 (7 interfaces + 13 functions)

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **voteStore.ts** — `vote-store-types.ts` → `vote-store-api.ts` → 슬림화
2. **QnaDetailClient.tsx** — `qna-utils.ts` → `useQnaForm.ts` → `QnaMessageList.tsx` → `QnaMediaModal.tsx` → 슬림화
3. **community-service.ts** — `community/types.ts` → `community/boards.ts` → `community/posts.ts` → barrel 전환

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npm run build
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| voteStore.ts | 677 | ~290 | 2 | ~680 |
| QnaDetailClient.tsx | 676 | ~250 | 4 | ~680 |
| community-service.ts | 641 | ~25 (barrel) | 3 | ~625 |

모든 메인 파일이 300줄 이하. 추출된 파일도 280줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| Zustand `set`/`get` 타입 정합성 | `StateCreator` 기반 타입 별칭 사용 |
| devtools actionName 누락 | API 팩토리 내에서 3번째 인자로 명시 전달 |
| useOptimistic 클로저 참조 | useQnaForm에서 messages/thread를 파라미터로 주입 |
| 'use client' 누락 | QnaMessageList, QnaMediaModal, useQnaForm에 필수 |
| community barrel re-export 누락 | 기존 13 functions + 7 types 체크리스트 작성 |
