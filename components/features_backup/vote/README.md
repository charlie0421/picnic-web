# Vote Feature Module

투표 기능과 관련된 모든 컴포넌트를 포함하는 도메인 모듈입니다.

## 폴더 구조

```
vote/
├── server/          # 서버 전용 컴포넌트 (데이터 페칭)
├── client/          # 클라이언트 전용 컴포넌트 (인터랙션)
├── common/          # 투표 도메인 공통 컴포넌트
├── types.ts         # 투표 관련 타입 정의
├── utils.ts         # 투표 관련 유틸리티 함수
└── index.ts         # 공개 API
```

## 컴포넌트 분류 가이드

### Server Components (`server/`)

데이터 페칭과 서버 사이드 렌더링을 담당:

```typescript
// server/VoteListFetcher.tsx
export async function VoteListFetcher({ status }: { status?: VoteStatus }) {
  const votes = await fetchVotes(status);
  return <VoteListPresenter votes={votes} />;
}

// server/VoteDetailFetcher.tsx
export async function VoteDetailFetcher({ id }: { id: string }) {
  const vote = await fetchVoteById(id);
  return <VoteDetailPresenter vote={vote} />;
}
```

### Client Components (`client/`)

사용자 인터랙션과 동적 기능을 담당:

```typescript
// client/VoteButton.tsx
'use client';
export function VoteButton({ voteId, itemId }: VoteButtonProps) {
  const handleVote = async () => {
    // 투표 로직
  };
  return <Button onClick={handleVote}>투표하기</Button>;
}

// client/VoteTimer.tsx
'use client';
export function VoteTimer({ endTime }: { endTime: string }) {
  // 실시간 카운트다운 로직
}
```

### Common Components (`common/`)

투표 도메인 내에서 서버/클라이언트 모두 사용:

```typescript
// common/VoteCard.tsx
export function VoteCard({ vote }: { vote: Vote }) {
  return (
    <Card>
      <VoteStatus status={vote.status} />
      <h3>{vote.title}</h3>
      {/* ... */}
    </Card>
  );
}
```

## 현재 컴포넌트 재분류

### Server로 이동할 컴포넌트
- `BannerList.tsx` → `server/VoteBannerFetcher.tsx`
- 데이터 페칭 로직이 있는 부분들

### Client로 이동할 컴포넌트
- `VoteDetailContent.tsx` → `client/VoteDetailInteractive.tsx`
- `CurrentTime.tsx` → `client/VoteTimer.tsx`
- `VoteSearch.tsx` → `client/VoteSearch.tsx`
- `Menu.tsx` → `client/VoteMenu.tsx`
- dialogs/* → `client/dialogs/*`

### Common으로 이동할 컴포넌트
- `VoteRankCard.tsx` → `common/VoteRankCard.tsx`
- `BannerItem.tsx` → `common/VoteBannerItem.tsx`
- `UpcomingVoteItems.tsx` → `common/VoteItemList.tsx`
- `CompletedVoteItems.tsx` → 통합
- `OngoingVoteItems.tsx` → 통합

## 타입 정의 (`types.ts`)

```typescript
export interface Vote {
  id: string;
  title: string;
  description: string;
  status: VoteStatus;
  startTime: string;
  endTime: string;
  items: VoteItem[];
}

export interface VoteItem {
  id: string;
  voteId: string;
  title: string;
  imageUrl?: string;
  voteCount: number;
}

export type VoteStatus = 'upcoming' | 'ongoing' | 'completed';
```

## 유틸리티 함수 (`utils.ts`)

```typescript
export function calculateVotePercentage(item: VoteItem, totalVotes: number): number {
  return totalVotes > 0 ? (item.voteCount / totalVotes) * 100 : 0;
}

export function getVoteStatus(vote: Vote): VoteStatus {
  const now = new Date();
  const start = new Date(vote.startTime);
  const end = new Date(vote.endTime);
  
  if (now < start) return 'upcoming';
  if (now > end) return 'completed';
  return 'ongoing';
}

export function formatRemainingTime(endTime: string): string {
  // 시간 포맷팅 로직
}
```

## 공개 API (`index.ts`)

```typescript
// Server components
export { VoteListFetcher } from './server/VoteListFetcher';
export { VoteDetailFetcher } from './server/VoteDetailFetcher';

// Client components
export { VoteButton } from './client/VoteButton';
export { VoteTimer } from './client/VoteTimer';
export { VoteSearch } from './client/VoteSearch';

// Common components
export { VoteCard } from './common/VoteCard';
export { VoteStatus } from './common/VoteStatus';

// Types and utils
export * from './types';
export * from './utils';
```

## 사용 예시

```typescript
// app/[lang]/(main)/vote/page.tsx
import { VoteListFetcher } from '@/components/features/vote';

export default function VotePage() {
  return <VoteListFetcher status="ongoing" />;
}

// app/[lang]/(main)/vote/[id]/page.tsx
import { VoteDetailFetcher } from '@/components/features/vote';

export default function VoteDetailPage({ params }: { params: { id: string } }) {
  return <VoteDetailFetcher id={params.id} />;
}
```

## 마이그레이션 단계

1. **Phase 1**: 타입과 유틸리티 정의
2. **Phase 2**: 컴포넌트 분류 및 이동
3. **Phase 3**: import 경로 업데이트
4. **Phase 4**: 중복 제거 및 최적화
5. **Phase 5**: 테스트 작성

## 테스트 전략

- **Server Components**: 데이터 페칭 모킹, 렌더링 결과 테스트
- **Client Components**: 사용자 인터랙션, 상태 변화 테스트  
- **Common Components**: Props 기반 렌더링 테스트
- **Utils**: 순수 함수 단위 테스트 