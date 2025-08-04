import { MediaListPresenter } from "@/components/client/media";
import { Media } from "@/types/interfaces";
import { getLocalizedString } from "@/utils/api/strings";
import { getCdnImageUrl } from "@/utils/api/image";
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
      return <div>표시할 미디어가 없습니다.</div>;
    }

    // 데이터 변환 - 실제 존재하는 필드만 사용
    const formattedMedia: Media[] = mediaData.map((item) => ({
      ...item,
      title: getLocalizedString(item.title),
      thumbnail_url: item.thumbnail_url ? getCdnImageUrl(item.thumbnail_url) : null,
      video_url: item.video_url, // 비디오 URL은 CDN 처리하지 않음
    }));

    return <MediaListPresenter media={formattedMedia} className={className} />;
  } catch (error) {
    console.error('MediaListFetcher error:', error);
    return <div>미디어를 불러오는 중 오류가 발생했습니다.</div>;
  }
}
