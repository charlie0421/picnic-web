import { Reward as DBReward } from "@/types/interfaces";
import { getLocalizedString } from "@/utils/api/strings";
import { RewardListPresenter } from "@/components/client/reward/RewardPresenter";
import { getRewards } from "@/utils/api/queries";

// DB Reward 타입을 Client Reward 타입으로 변환
function transformRewardData(dbRewards: DBReward[]): DBReward[] {
  return dbRewards.map(reward => ({
    ...reward,
    title: getLocalizedString(reward.title) || '리워드',
    thumbnail: reward.thumbnail ?? null,
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
const DEFAULT_LIMIT = 8;

export async function RewardListFetcher({ 
  className, 
  showViewAllLink = false 
}: RewardListFetcherProps = {}) {
  const dbRewards = await getRewards(DEFAULT_LIMIT);
  const clientRewards = transformRewardData(dbRewards);

  if (!clientRewards || clientRewards.length === 0) {
    return (
      <div className={className}>
        <RewardFallbackShowcase />
      </div>
    );
  }

  return (
    <div className={className}>
      <RewardListPresenter
        rewards={clientRewards} 
        showViewAllLink={showViewAllLink}
      />
    </div>
  );
}

const FALLBACK_REWARDS = [
  {
    title: 'Digital Billboard Takeover',
    description: '서울, 도쿄, 뉴욕 주요 전광판에 팬들이 직접 디자인한 응원 영상을 노출하는 글로벌 광고 패키지입니다.',
    perks: ['4K 전광판 송출', '촬영 본편 메이킹 영상', '현장 포토존 운영'],
  },
  {
    title: 'Fanmade Pop-up Lounge',
    description: '아티스트 서포트 굿즈와 인터랙티브 전시를 결합한 체험형 라운지를 만들어 팬들이 직접 방문할 수 있도록 준비합니다.',
    perks: ['현장 한정 포토카드', 'AR 사운드 전시', '라이브 트랜스미디어 월'],
  },
  {
    title: 'Charity Collaboration Kit',
    description: '팬덤의 이름으로 진행되는 기부 연계 프로젝트로, 리워드 구매가 사회 공헌으로 이어지도록 설계했습니다.',
    perks: ['기부 인증 배지', '온라인 명예의 전당', '메이킹 다이어리 PDF'],
  },
];

function RewardFallbackShowcase() {
  return (
    <section className='rounded-3xl border border-secondary/20 bg-white/90 px-6 py-8 shadow-sm'>
      <div className='max-w-3xl space-y-2'>
        <p className='text-xs font-semibold tracking-[0.3em] text-secondary-600 uppercase'>
          Reward Studio
        </p>
        <h2 className='text-2xl font-bold text-gray-900'>곧 공개될 리워드 라인업</h2>
        <p className='text-gray-600'>
          실물 광고, 체험형 팝업, 사회 공헌 프로젝트까지 팬덤 활동의 가치를 확장할 수 있는 리워드를 큐레이션하고 있습니다.
        </p>
      </div>

      <div className='mt-6 grid gap-5 md:grid-cols-3'>
        {FALLBACK_REWARDS.map((reward) => (
          <article
            key={reward.title}
            className='flex h-full flex-col rounded-2xl border border-secondary/20 bg-gradient-to-br from-secondary/5 via-white to-primary/5 p-5 shadow-sm'
          >
            <h3 className='text-lg font-semibold text-gray-900'>{reward.title}</h3>
            <p className='mt-3 text-sm text-gray-600 flex-1'>{reward.description}</p>
            <ul className='mt-4 space-y-1 text-sm text-gray-700'>
              {reward.perks.map((perk) => (
                <li key={perk} className='flex items-center gap-2'>
                  <span className='h-1.5 w-1.5 rounded-full bg-secondary-500' />
                  {perk}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className='mt-6 rounded-2xl bg-secondary-600 px-6 py-4 text-white shadow-inner'>
        <p className='text-sm font-semibold uppercase tracking-wide'>How to participate</p>
        <p className='mt-2 text-sm text-white/90'>
          사전 예약 알림을 받고 싶다면 앱 내 알림 설정 또는 support@picnic.fan 으로 안내를 요청해주세요.
        </p>
      </div>
    </section>
  );
}
 