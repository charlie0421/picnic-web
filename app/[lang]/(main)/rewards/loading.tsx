import { RewardListSkeleton } from '@/components/client/reward';

/**
 * 리워드 리스트 페이지의 로딩 상태 컴포넌트
 * 
 * 리워드 데이터를 불러오는 동안 표시될 스켈레톤 UI입니다.
 * Next.js가 자동으로 이 컴포넌트를 Suspense fallback으로 사용합니다.
 */
export default function RewardsLoading() {
  return (
    <main className="container mx-auto px-4 py-6">
      <section>
        <RewardListSkeleton />
      </section>
    </main>
  );
} 