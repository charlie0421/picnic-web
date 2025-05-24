# 하이브리드 컴포넌트 사용 가이드

## 개요

이 문서는 피크닉 웹앱에서 사용하는 하이브리드 컴포넌트 아키텍처에 대해 설명합니다. 하이브리드 컴포넌트는 서버 컴포넌트와 클라이언트 컴포넌트의 장점을 결합하여 최적의 성능과 사용자 경험을 제공합니다.

## 하이브리드 아키텍처

### 서버 컴포넌트 (권장)
- **빠른 초기 로딩**: 서버에서 데이터가 포함된 HTML을 제공
- **SEO 최적화**: 크롤러가 내용을 완전히 인덱싱
- **번들 크기 감소**: 클라이언트 JavaScript 번들 크기 최소화

### 클라이언트 컴포넌트 (Fallback)
- **동적 상호작용**: 클라이언트 사이드 상태 관리
- **유연성**: 런타임에 데이터 fetching 가능
- **호환성**: 클라이언트 사이드 라우팅 지원

## 사용 가능한 하이브리드 컴포넌트

### 1. Banner 컴포넌트

#### 서버 컴포넌트 (권장)
```tsx
import { BannerListFetcher } from '@/components/server/banner';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState message="배너를 불러오는 중..." />}>
      <BannerListFetcher className="my-4" />
    </Suspense>
  );
}
```

#### 클라이언트 컴포넌트 (Fallback)
```tsx
import { BannerListWrapper } from '@/components/client/banner';

export default function ClientPage() {
  return <BannerListWrapper className="my-4" />;
}
```

### 2. Media 컴포넌트

#### 서버 컴포넌트 (권장)
```tsx
import { MediaListFetcher } from '@/components/server/media';

export default function MediaPage() {
  return (
    <Suspense fallback={<LoadingState message="미디어를 불러오는 중..." />}>
      <MediaListFetcher className="mt-4" />
    </Suspense>
  );
}
```

#### 클라이언트 컴포넌트 (Fallback)
```tsx
import { MediaListWrapper } from '@/components/client/media';

export default function ClientMediaPage() {
  return <MediaListWrapper className="mt-4" />;
}
```

### 3. Reward 컴포넌트

#### 서버 컴포넌트 (권장)
```tsx
import { RewardListFetcher } from '@/components/server/reward';

export default function RewardsPage() {
  return (
    <Suspense fallback={<LoadingState message="리워드를 불러오는 중..." />}>
      <RewardListFetcher showViewAllLink={true} />
    </Suspense>
  );
}
```

#### 클라이언트 컴포넌트 (Fallback)
```tsx
import { RewardListWrapper } from '@/components/client/reward';

export default function ClientRewardsPage() {
  return <RewardListWrapper showViewAllLink={true} />;
}
```

## 통합 사용 예시

### 메인 페이지에서 모든 컴포넌트 사용
```tsx
import { Suspense } from 'react';
import { BannerListFetcher, LoadingState } from '@/components/server';
import { MediaListFetcher } from '@/components/server/media';
import { RewardListFetcher } from '@/components/server/reward';
import Link from 'next/link';

export default function MainPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      {/* 배너 섹션 */}
      <section>
        <Suspense fallback={<LoadingState message="배너를 불러오는 중..." />}>
          <BannerListFetcher />
        </Suspense>
      </section>

      {/* 미디어 섹션 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">최신 미디어</h2>
          <Link href="/media" className="text-blue-600 hover:text-blue-800">
            전체 보기 →
          </Link>
        </div>
        <Suspense fallback={<LoadingState message="미디어를 불러오는 중..." />}>
          <MediaListFetcher className="mb-6" />
        </Suspense>
      </section>

      {/* 리워드 섹션 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">인기 리워드</h2>
          <Link href="/rewards" className="text-blue-600 hover:text-blue-800">
            전체 보기 →
          </Link>
        </div>
        <Suspense fallback={<LoadingState message="리워드를 불러오는 중..." />}>
          <RewardListFetcher showViewAllLink={false} className="mb-6" />
        </Suspense>
      </section>
    </main>
  );
}
```

## 성능 최적화 팁

### 1. 개별 Suspense 경계 사용
각 컴포넌트에 개별 Suspense를 사용하여 점진적 렌더링을 활용하세요:

```tsx
// ✅ 좋은 예: 개별 Suspense
<Suspense fallback={<BannerLoading />}>
  <BannerListFetcher />
</Suspense>
<Suspense fallback={<MediaLoading />}>
  <MediaListFetcher />
</Suspense>

// ❌ 피할 것: 하나의 Suspense로 모든 것을 감싸기
<Suspense fallback={<AllDataLoading />}>
  <BannerListFetcher />
  <MediaListFetcher />
</Suspense>
```

### 2. 적절한 Loading State 사용
각 컴포넌트의 특성에 맞는 로딩 상태를 제공하세요:

```tsx
<Suspense fallback={<LoadingState message="특정 데이터를 불러오는 중..." />}>
  <ComponentFetcher />
</Suspense>
```

### 3. 클라이언트 컴포넌트는 필요시에만
서버 컴포넌트를 기본으로 사용하고, 다음의 경우에만 클라이언트 컴포넌트를 사용하세요:

- 클라이언트 사이드 라우팅에서 동적 로딩이 필요한 경우
- 서버 컴포넌트를 사용할 수 없는 특별한 상황
- 실시간 데이터 업데이트가 필요한 경우

## 문제 해결

### 타입 에러
만약 TypeScript 타입 에러가 발생한다면, 해당 인터페이스가 `/types/interfaces.ts`에 올바르게 정의되어 있는지 확인하세요.

### 데이터 페칭 실패
서버 컴포넌트에서 데이터 페칭이 실패하는 경우, 자동으로 에러 경계나 fallback UI가 표시됩니다. 클라이언트 컴포넌트는 내부적으로 에러 상태를 처리합니다.

### SSR 관련 이슈
서버 사이드 렌더링에서 hydration 에러가 발생한다면, 서버 컴포넌트를 사용하는 것을 권장합니다.

## 디렉토리 구조

```
components/
├── server/                    # 서버 컴포넌트 (권장)
│   ├── banner/
│   │   └── BannerListFetcher.tsx
│   ├── media/
│   │   └── MediaListFetcher.tsx
│   └── reward/
│       └── RewardListFetcher.tsx
├── client/                    # 클라이언트 컴포넌트 (Fallback)
│   ├── banner/
│   │   └── BannerListWrapper.tsx
│   ├── media/
│   │   └── MediaListWrapper.tsx
│   └── reward/
│       └── RewardListWrapper.tsx
```

이 아키텍처를 통해 최적의 성능과 사용자 경험을 제공하면서도 유연성을 유지할 수 있습니다. 