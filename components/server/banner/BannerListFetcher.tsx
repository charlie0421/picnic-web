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
  const banners = await getBanners();

  return (
    <BannerListPresenter banners={banners} className={className} />
  );
} 