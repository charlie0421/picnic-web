import { MetadataRoute } from "next";
import { buildSitemapEntries } from "./[lang]/sitemap";

// 요청마다 렌더한다(기존 동작). 조회가 모두 쿠키 없는 클라이언트라 이 선언이 없으면 정적으로 굳는다.
// 캐시하지 않는 이유: 아래 조회는 실패해도 부분 결과를 돌려주므로, 캐시하면 URL 이 빠진 sitemap 이 굳는다.
export const dynamic = 'force-dynamic';

/**
 * 루트 sitemap
 * 애드센스/검색엔진이 이 URL 하나만으로 전체 공개 경로를 확인할 수 있도록
 * 언어별 엔트리를 모두 포함합니다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries();
}









