import { Reward as DBReward } from "@/types/interfaces";
import { getLocalizedString } from "@/utils/api/strings";
import { getCdnImageUrl } from "@/utils/api/image";
import { RewardListPresenter } from "@/components/client/reward/RewardPresenter";
import { getRewards } from "@/utils/api/queries";

// DB Reward 타입을 Client Reward 타입으로 변환
function transformRewardData(dbRewards: DBReward[]): DBReward[] {
  return dbRewards.map(reward => ({
    ...reward,
    title: getLocalizedString(reward.title) || '리워드',
    thumbnail: reward.thumbnail ? getCdnImageUrl(reward.thumbnail) : null,
    createdAt: reward.created_at || new Date().toISOString()
  }));
}

export interface RewardListFetcherProps {
  className?: string;
  showViewAllLink?: boolean;
}

/**
 * 서버 컴포넌트: 리워드 데이터를 서버에서 페칭하여 클라이언트 컴포넌트에 전달
 * 
 * 장점:
 * - 초기 페이지 로드 시 빠른 렌더링 (서버에서 데이터 포함)
 * - SEO 최적화 (크롤러가 리워드 내용 인덱싱 가능)
 * - 클라이언트 번들 크기 감소
 * 
 * 사용법:
 * ```tsx
 * <RewardListFetcher className="my-4" showViewAllLink={true} />
 * ```
 */
export async function RewardListFetcher({ 
  className, 
  showViewAllLink = false 
}: RewardListFetcherProps = {}) {
  const dbRewards = await getRewards();
  const clientRewards = transformRewardData(dbRewards);
  
  return (
    <div className={className}>
      <RewardListPresenter
        rewards={clientRewards} 
        showViewAllLink={showViewAllLink}
      />
    </div>
  );
}
 