import MediaListPresenter from "@/components/client/media/MediaListPresenter";
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
  const medias = await getMedias();
  
  return (
    <div className={className}>
      <MediaListPresenter 
        medias={medias} 
        isLoading={false} 
        error={null} 
      />
    </div>
  );
} 