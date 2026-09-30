import { MetadataRoute } from "next";
import { buildSitemapEntries } from "./[lang]/sitemap";

// getNotices 가 쿠키 없는 클라이언트가 되면 이 라우트는 정적으로 굳는다 — 1시간마다 재생성한다.
export const revalidate = 3600;

/**
 * 루트 sitemap
 * 애드센스/검색엔진이 이 URL 하나만으로 전체 공개 경로를 확인할 수 있도록
 * 언어별 엔트리를 모두 포함합니다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries();
}









