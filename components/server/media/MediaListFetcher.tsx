import { MediaListPresenter } from "@/components/client/media";
import { Media } from "@/types/interfaces";
import { getLocalizedString } from "@/utils/api/strings";
import { getMedias } from "@/utils/api/queries";

export interface MediaListFetcherProps {
  className?: string;
}

/**
 * 서버 컴포넌트: 미디어 데이터를 서버에서 페칭하여 클라이언트 컴포넌트에 전달
 * 
 * 장점:
 * - 초기 페이지 로드 시 빠른 렌더링 (서버에서 데이터 포함)
 * - SEO 최적화 (크롤러가 미디어 내용 인덱싱 가능)
 * - 클라이언트 번들 크기 감소
 * 
 * 사용법:
 * ```tsx
 * <MediaListFetcher className="my-4" />
 * ```
 */
export async function MediaListFetcher({ className }: MediaListFetcherProps = {}) {
  try {
    const mediaData = await getMedias();

    if (!mediaData || mediaData.length === 0) {
      return <MediaFallbackShowcase className={className} />;
    }

    // 데이터 변환 - 실제 존재하는 필드만 사용
    const formattedMedia: Media[] = mediaData.map((item) => ({
      ...item,
      title: getLocalizedString(item.title),
      thumbnail_url: item.thumbnail_url,
      video_url: item.video_url, // 비디오 URL은 CDN 처리하지 않음
    }));

    return <MediaListPresenter media={formattedMedia} className={className} />;
  } catch (error) {
    console.error('MediaListFetcher error:', error);
    return <MediaFallbackShowcase className={className} showError />;
  }
}

const FALLBACK_MEDIA = [
  {
    id: 1,
    title: 'Shining Seoul 비하인드 하이라이트',
    description: '메인 공연 준비 과정과 백스테이지 인터뷰를 미리 공개합니다.',
    link: 'https://www.youtube.com/@picnicfan',
  },
  {
    id: 2,
    title: '글로벌 팬미팅 라이브 클립',
    description: '해외 팬과 실시간으로 연결되는 인터랙티브 라이브 클립을 준비하고 있습니다.',
    link: 'https://www.instagram.com/picnicfan.official',
  },
  {
    id: 3,
    title: '안무 연습실 4K 스페셜',
    description: '독점 안무 캠 영상과 연습실 플레이리스트를 큐레이션합니다.',
    link: 'https://www.picnic.fan',
  },
];

function MediaFallbackShowcase({
  className,
  showError = false,
}: {
  className?: string;
  showError?: boolean;
}) {
  return (
    <section className={`rounded-3xl border border-point/20 bg-white/90 px-6 py-8 shadow-sm ${className ?? ''}`}>
      <div className='space-y-2'>
        <p className='text-xs font-semibold tracking-[0.3em] text-point-600 uppercase'>
          Media Archive
        </p>
        <h2 className='text-2xl font-bold text-gray-900'>팬이 기록하는 순간</h2>
        <p className='text-gray-600'>
          {showError
            ? '실시간 데이터를 불러오는 중 문제가 발생했습니다. 준비된 미리보기 콘텐츠를 먼저 만나보세요.'
            : '새로운 영상과 음원을 정리하는 중입니다. 아래 미리보기 채널에서 최신 소식을 확인할 수 있어요.'}
        </p>
      </div>

      <div className='mt-6 grid gap-5 md:grid-cols-3'>
        {FALLBACK_MEDIA.map((media) => (
          <article
            key={media.id}
            className='flex h-full flex-col rounded-2xl border border-point/10 bg-gradient-to-br from-point/5 via-white to-primary/5 p-5 shadow-sm'
          >
            <h3 className='text-lg font-semibold text-gray-900'>{media.title}</h3>
            <p className='mt-3 text-sm text-gray-600 flex-1'>{media.description}</p>
            <a
              href={media.link}
              target='_blank'
              rel='noreferrer'
              className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-point-600 hover:underline'
            >
              채널 바로가기
              <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M5 12h14' />
                <path d='M12 5l7 7-7 7' />
              </svg>
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
