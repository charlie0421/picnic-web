# 피크닉 앱 렌더링 전략 가이드

이 문서는 피크닉 웹 애플리케이션의 렌더링 전략에 대한 가이드입니다. Next.js 13+ App Router를 사용하여 구현된 다양한 렌더링 전략과 최적화 방법에 대해 설명합니다.

## 목차

1. [렌더링 전략 개요](#렌더링-전략-개요)
2. [정적 렌더링 (Static Rendering)](#정적-렌더링-static-rendering)
3. [증분 정적 재생성 (ISR)](#증분-정적-재생성-isr)
4. [동적 렌더링 (Dynamic Rendering)](#동적-렌더링-dynamic-rendering)
5. [스트리밍 (Streaming)](#스트리밍-streaming)
6. [하이브리드 렌더링](#하이브리드-렌더링)
7. [페이지별 권장 렌더링 전략](#페이지별-권장-렌더링-전략)
8. [성능 최적화 팁](#성능-최적화-팁)

## 렌더링 전략 개요

Next.js 13+ App Router는 다양한 렌더링 전략을 제공합니다:

- **정적 렌더링 (Static Rendering)**: 빌드 시 페이지를 생성하고 CDN에 캐싱
- **증분 정적 재생성 (ISR)**: 정적 페이지를 주기적으로 재생성
- **동적 렌더링 (Dynamic Rendering)**: 요청 시마다 페이지를 생성
- **스트리밍 (Streaming)**: 페이지의 일부를 점진적으로 렌더링

## 정적 렌더링 (Static Rendering)

정적 렌더링은 빌드 시점에 페이지를 생성하고 CDN에 캐싱하는 방식입니다. 콘텐츠가 자주 변경되지 않는 페이지에 적합합니다.

### 구현 방법

정적 렌더링이 기본 설정이므로 특별한 설정이 필요 없습니다. 페이지가 정적으로 생성될 수 있도록 서버 컴포넌트에서 데이터를 가져옵니다.

```tsx
// app/[lang]/static-page/page.tsx
export default async function StaticPage() {
  // 이 데이터는 빌드 시 한 번만 가져오고 정적 HTML에 렌더링됩니다
  const data = await fetchSomeData();
  
  return (
    <div>
      <h1>정적 페이지</h1>
      <div>{data}</div>
    </div>
  );
}
```

### 동적 경로가 있는 정적 페이지

동적 경로(`[id]`, `[slug]` 등)가 있는 페이지의 경우 `generateStaticParams` 함수를 사용하여 빌드 시 생성할 경로를 지정할 수 있습니다.

```tsx
// app/[lang]/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await fetchPosts();
  
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function Post({ params }: { params: { slug: string } }) {
  const post = await fetchPost(params.slug);
  
  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  );
}
```

## 증분 정적 재생성 (ISR)

ISR은 정적 페이지를 특정 간격으로 재생성하는 방식으로, 정적 페이지의 장점과 동적 페이지의 최신성을 결합합니다.

### 구현 방법

`revalidate` 옵션을 사용하여 ISR을 구현할 수 있습니다:

```tsx
// app/[lang]/(main)/rewards/page.tsx
export const revalidate = 60; // 60초마다 재검증

export default async function RewardsPage() {
  const rewards = await getRewards();
  
  return (
    <div>
      <h1>리워드</h1>
      <RewardList rewards={rewards} />
    </div>
  );
}
```

유틸리티 함수를 사용하여 ISR 메타데이터를 설정할 수도 있습니다:

```tsx
// app/[lang]/utils/rendering-utils.ts
export function createISRMetadata(revalidateSeconds: number = 60) {
  return {
    revalidate: revalidateSeconds
  };
}

// 페이지에서 사용
export const metadata = createISRMetadata(60);
```

### 온디맨드 재검증

특정 이벤트(예: CMS 업데이트)가 발생할 때 페이지를 재검증하려면 `revalidateTag` 또는 `revalidatePath` API를 사용할 수 있습니다:

```tsx
// app/api/revalidate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request: NextRequest) {
  const { path, tag, secret } = await request.json();
  
  // 보안 검증
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
  }
  
  if (path) {
    revalidatePath(path);
    return NextResponse.json({ revalidated: true, path });
  }
  
  if (tag) {
    revalidateTag(tag);
    return NextResponse.json({ revalidated: true, tag });
  }
  
  return NextResponse.json({ message: 'No path or tag provided' }, { status: 400 });
}
```

## 동적 렌더링 (Dynamic Rendering)

동적 렌더링은 요청이 있을 때마다 페이지를 새로 생성하는 방식입니다. 사용자별 맞춤형 콘텐츠나 실시간 데이터가 필요한 페이지에 적합합니다.

### 구현 방법

`dynamic` 지시문을 사용하여 동적 렌더링을 강제할 수 있습니다:

```tsx
// app/[lang]/dashboard/page.tsx
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const userData = await fetchUserData();
  
  return (
    <div>
      <h1>사용자 대시보드</h1>
      <div>{userData}</div>
    </div>
  );
}
```

또는 쿠키, 헤더, 검색 매개변수 등 동적 요소를 사용하면 자동으로 동적 렌더링이 적용됩니다:

```tsx
// app/[lang]/search/page.tsx
export default async function Search({ searchParams }: { searchParams: { q: string } }) {
  const results = await searchData(searchParams.q);
  
  return (
    <div>
      <h1>검색 결과: {searchParams.q}</h1>
      <SearchResults results={results} />
    </div>
  );
}
```

## 스트리밍 (Streaming)

스트리밍은 페이지의 HTML을 점진적으로 생성하고 전송하는 방식입니다. 사용자는 전체 페이지가 로드되기 전에 일부 콘텐츠를 볼 수 있습니다.

### 구현 방법

React의 `Suspense`를 사용하여 스트리밍을 구현할 수 있습니다:

```tsx
// app/[lang]/(main)/streaming-example/page.tsx
import { Suspense } from 'react';
import { LoadingState } from '@/components/server';

export default function StreamingPage() {
  return (
    <div>
      <h1>스트리밍 예제</h1>
      
      {/* 먼저 로드되는 콘텐츠 */}
      <Suspense fallback={<LoadingState message="투표 데이터 로딩 중..." />}>
        <VoteSection />
      </Suspense>
      
      {/* 나중에 로드되는 콘텐츠 */}
      <Suspense fallback={<LoadingState message="리워드 데이터 로딩 중..." />}>
        <RewardSection />
      </Suspense>
      
      {/* 가장 늦게 로드되는 콘텐츠 */}
      <Suspense fallback={<LoadingState message="미디어 데이터 로딩 중..." />}>
        <MediaSection />
      </Suspense>
    </div>
  );
}
```

또한 `loading.tsx` 파일을 사용하여 전체 페이지의 로딩 상태를 처리할 수 있습니다:

```tsx
// app/[lang]/(main)/streaming-example/loading.tsx
import { LoadingState } from '@/components/server';

export default function StreamingExampleLoading() {
  return <LoadingState message="페이지를 준비하는 중입니다..." fullPage size="large" />;
}
```

## 하이브리드 렌더링

페이지의 일부는 정적으로, 일부는 동적으로 렌더링하는 하이브리드 렌더링 방식도 가능합니다.

### 구현 방법

서버 컴포넌트를 사용하여 정적 부분을 렌더링하고, 클라이언트 컴포넌트를 사용하여 동적 부분을 렌더링할 수 있습니다:

```tsx
// app/[lang]/hybrid/page.tsx
import { StaticContent } from './StaticContent';
import { DynamicContent } from './DynamicContent';

export default function HybridPage() {
  return (
    <div>
      <h1>하이브리드 페이지</h1>
      
      {/* 서버 컴포넌트, 정적으로 렌더링 */}
      <StaticContent />
      
      {/* 클라이언트 컴포넌트, 브라우저에서 동적으로 렌더링 */}
      <DynamicContent />
    </div>
  );
}
```

## 페이지별 권장 렌더링 전략

피크닉 앱의 각 페이지에 권장하는 렌더링 전략은 다음과 같습니다:

| 페이지 | 렌더링 전략 | 이유 |
|-------|------------|-----|
| 홈 `/` | 정적 | 모든 사용자에게 동일한 콘텐츠 제공 |
| 로그인 `/login` | 클라이언트 | 사용자 입력 및 상태 관리 필요 |
| 미디어 `/media` | 스트리밍 | 데이터가 많고 점진적 로딩이 유용함 |
| 투표 `/vote` | 클라이언트 | 사용자 상호작용이 많음 |
| 투표 상세 `/vote/[id]` | ISR | 투표 결과가 주기적으로 업데이트됨 |
| 리워드 `/rewards` | ISR | 콘텐츠가 주기적으로 업데이트됨 |
| 리워드 상세 `/rewards/[id]` | ISR | 콘텐츠가 주기적으로 업데이트됨 |
| 마이페이지 `/mypage` | 동적 | 사용자별 맞춤형 콘텐츠 |

## 성능 최적화 팁

### 캐싱 최적화

- `fetch()` 요청에 캐싱 옵션 추가하기:
  ```tsx
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 } // 60초마다 재검증
  }).then(res => res.json());
  ```

### 스트리밍 최적화

- 중요한 콘텐츠를 먼저 스트리밍하고, 덜 중요한 콘텐츠는 나중에 로드하세요.
- 큰 컴포넌트를 여러 개의 작은 컴포넌트로 분할하여 각각을 `Suspense`로 감싸세요.

### 이미지 최적화

- Next.js의 `Image` 컴포넌트를 사용하여 이미지를 최적화하세요:
  ```tsx
  import Image from 'next/image';
  
  <Image
    src="/path/to/image.jpg"
    width={500}
    height={300}
    alt="이미지 설명"
    priority={true} // 중요한 이미지인 경우
  />
  ```

### Lazy Loading

- 페이지 폴드 아래에 있는 컴포넌트는 지연 로딩하여 초기 로드 시간을 단축하세요:
  ```tsx
  import dynamic from 'next/dynamic';
  
  const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
    loading: () => <p>로딩 중...</p>,
  });
  ```

### 코드 분할

- 불필요한 JavaScript를 제거하고 페이지별로 필요한 코드만 로드하세요.
- 큰 라이브러리는 조건부로 로드하여 초기 번들 크기를 줄이세요.

---

이 문서는 피크닉 애플리케이션의 렌더링 전략에 대한 지침입니다. 새로운 페이지를 개발할 때 참고하세요. 질문이나 의견이 있으면 개발팀에 문의하세요. 