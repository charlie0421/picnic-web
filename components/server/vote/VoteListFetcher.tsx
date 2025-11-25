import { VoteFilterSectionDeferred, VoteListCSR } from '@/components/client/vote/list';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';
import { getVotes } from '@/lib/data-fetching/server/vote-service';
import { Vote } from '@/types/interfaces';

interface VoteListFetcherProps {
  status: VoteStatus;
  area: VoteArea;
  className?: string;
  locale?: string;
  prefetchedVotesPromise?: Promise<Vote[]>;
  safeStatusOverride?: Promise<VoteStatus> | VoteStatus;
}

/**
 * 서버 컴포넌트: 투표 데이터를 서버에서 페칭하여 클라이언트 컴포넌트에 전달
 * 
 * 장점:
 * - 초기 페이지 로드 시 빠른 렌더링 (서버에서 데이터 포함)
 * - SEO 최적화 (크롤러가 투표 내용 인덱싱 가능)
 * - 클라이언트 번들 크기 감소
 * 
 * 사용법:
 * ```tsx
 * <VoteListFetcher status="ongoing" area="all" className="my-4" />
 * ```
 */
export async function VoteListFetcher({
  status = VOTE_STATUS.ONGOING,
  area = VOTE_AREAS.ALL,
  className,
  locale,
  prefetchedVotesPromise,
  safeStatusOverride,
}: VoteListFetcherProps) {
  // Admin 보호: status가 admin인 경우 서버에서 관리자 권한 확인
  let safeStatus: VoteStatus;
  if (safeStatusOverride) {
    safeStatus = await safeStatusOverride;
  } else {
    const userContext = await getCurrentUserContext();
    const isAdmin = (userContext as any)?.isAdmin === true;
    safeStatus =
      status === VOTE_STATUS.ADMIN
        ? (isAdmin ? VOTE_STATUS.ADMIN : VOTE_STATUS.ONGOING)
        : status;
  }

  // 초기에는 1페이지만 로드 (CSR 더보기/무한스크롤이 이어받음)
  const votes = prefetchedVotesPromise
    ? await prefetchedVotesPromise
    : await getVotes(safeStatus, area, 1, 12);

  if (!votes || votes.length === 0) {
    return (
      <div className={className}>
        <VoteFilterSectionDeferred />
        <VoteShowcaseFallback locale={locale} />
      </div>
    );
  }

  return (
    <div className={className}>
      <VoteFilterSectionDeferred />
      <VoteListCSR initialVotes={votes} initialLocale={locale} />
    </div>
  );
}

const FALLBACK_VOTE_STORIES = [
  {
    title: 'Global Debut Support',
    description: '연습생과 신인 아티스트를 위해 전 세계 팬들이 함께 만드는 데뷔 응원전입니다.',
    highlights: ['실시간 응원 그래프', '팬 커뮤니티 분석 리포트', '맞춤형 응원 배지'],
  },
  {
    title: 'Encore Stage Project',
    description: '투표를 통해 다시 보고 싶은 무대를 선정하고, 합동 앙코르 공연을 준비합니다.',
    highlights: ['360° 스테이지 연출', 'AR 응원봉 연동', '라이브 스트리밍 오픈채팅'],
  },
  {
    title: 'City Pop-up Exhibition',
    description: '지역별 팝업 전시와 임팩트 광고를 연결해 도시 곳곳에서 아이돌을 만나는 캠페인입니다.',
    highlights: ['미디어 파사드', '메트로 광고 큐레이션', '현장 포토카드 수령'],
  },
];

function VoteShowcaseFallback({ locale }: { locale?: string }) {
  const isEnglish = locale?.startsWith('en');
  const headline = isEnglish
    ? 'Vote campaigns are being prepared.'
    : '새로운 투표 캠페인을 준비하고 있어요.';
  const sub = isEnglish
    ? 'We are curating verified projects so that every visit delivers meaningful participation.'
    : '방문할 때마다 의미 있는 참여 경험을 제공하기 위해 검증된 프로젝트를 큐레이션하고 있습니다.';

  return (
    <section className='rounded-3xl border border-primary/10 bg-white/90 px-6 py-8 shadow-sm space-y-6'>
      <div>
        <p className='text-sm font-semibold text-primary-500 uppercase tracking-widest'>
          PICNIC VOTE LAB
        </p>
        <h2 className='mt-2 text-2xl font-bold text-gray-900'>{headline}</h2>
        <p className='mt-2 text-gray-600 leading-relaxed'>{sub}</p>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        {FALLBACK_VOTE_STORIES.map((story) => (
          <article
            key={story.title}
            className='rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-white to-point/5 p-5 shadow-sm flex flex-col'
          >
            <div className='flex items-center gap-2 text-xs font-medium text-primary-600 uppercase tracking-wider'>
              <span className='inline-block h-2 w-2 rounded-full bg-primary' />
              Coming Soon
            </div>
            <h3 className='mt-3 text-lg font-semibold text-gray-900'>{story.title}</h3>
            <p className='mt-2 text-sm text-gray-600 flex-1'>{story.description}</p>
            <ul className='mt-4 space-y-1 text-sm text-gray-700'>
              {story.highlights.map((item) => (
                <li key={item} className='flex items-center gap-2'>
                  <span className='h-1.5 w-1.5 rounded-full bg-point-500' />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className='rounded-2xl bg-gradient-to-r from-primary-600 to-point-500 px-6 py-5 text-white'>
        <p className='text-sm font-semibold tracking-wide uppercase'>Next update</p>
        <p className='mt-1 text-lg font-semibold'>
          {isEnglish ? 'Pilot campaigns and mock data are published every week.' : '매주 파일럿 캠페인과 공개 데이터가 업데이트됩니다.'}
        </p>
        <p className='mt-2 text-sm text-white/80'>
          {isEnglish
            ? 'If you would like to showcase a project, contact us via support@picnic.fan.'
            : '공개 테스트에 참여하고 싶다면 support@picnic.fan 으로 문의해주세요.'}
        </p>
      </div>
    </section>
  );
}
 