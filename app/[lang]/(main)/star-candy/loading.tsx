import { StarCandySkeleton } from '@/components/client/star-candy/StarCandySkeleton';

/**
 * 별사탕 충전 페이지의 로딩 상태 컴포넌트
 * 
 * 페이지 데이터를 불러오는 동안 표시될 스켈레톤 UI입니다.
 * Next.js가 자동으로 이 컴포넌트를 Suspense fallback으로 사용합니다.
 */
export default function StarCandyLoading() {
  return (
    <main className="container mx-auto px-4 py-8">
      <section>
        <StarCandySkeleton />
      </section>
    </main>
  );
} 