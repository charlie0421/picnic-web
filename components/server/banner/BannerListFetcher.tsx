import { createClient } from "@/utils/supabase-server-client";
import { Banner as DBBanner } from "@/types/interfaces";
import { getLocalizedString } from "@/utils/api/strings";
import { getCdnImageUrl } from "@/utils/api/image";
import { BannerListPresenter } from "@/components/client/banner";
import { getBanners } from "@/utils/api/queries";


export interface BannerListFetcherProps {
  className?: string;
}

/**
 * 서버 컴포넌트: 배너 데이터를 서버에서 페칭하여 클라이언트 컴포넌트에 전달
 * 
 * 장점:
 * - 초기 페이지 로드 시 빠른 렌더링 (서버에서 데이터 포함)
 * - SEO 최적화 (크롤러가 배너 내용 인덱싱 가능)
 * - 클라이언트 번들 크기 감소
 * 
 * 사용법:
 * ```tsx
 * <BannerListFetcher className="my-4" />
 * ```
 */
export async function BannerListFetcher({ className }: BannerListFetcherProps = {}) {
  try {
    const banners = await getBanners();
    
    if (!banners || banners.length === 0) {
      return null; // 배너가 없으면 아무것도 렌더링하지 않음
    }

    // 데이터 변환 - DBBanner를 클라이언트용 Banner로 변환
    const clientBanners = banners.map((banner) => ({
      id: banner.id,
      celeb_id: banner.celeb_id,
      created_at: banner.created_at,
      deleted_at: banner.deleted_at,
      duration: banner.duration,
      end_at: banner.end_at,
      image: banner.image,
      link: banner.link,
      location: banner.location,
      order: banner.order,
      start_at: banner.start_at,
      thumbnail: banner.thumbnail,
      title: banner.title,
      updated_at: banner.updated_at,
    }));

    return <BannerListPresenter banners={clientBanners} className={className} />;
  } catch (error) {
    console.error('BannerListFetcher error:', error);
    return null; // 에러 시 배너 섹션을 숨김
  }
} 