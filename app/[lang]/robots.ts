import { MetadataRoute } from 'next';
import { SITE_URL } from './constants/static-pages';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

/**
 * robots.txt 생성 함수
 * 
 * Next.js의 메타데이터 API를 활용하여 로봇 텍스트 파일을 동적으로 생성합니다.
 * 모든 지원 언어별 사이트맵을 포함하여 SEO 최적화를 제공합니다.
 * 
 * @return {MetadataRoute.Robots} 로봇 텍스트 객체
 */
export default function robots(): MetadataRoute.Robots {
  const env = process.env.NODE_ENV || 'development';
  
  // 프로덕션 환경이 아닌 경우 모든 크롤링 차단
  if (env !== 'production') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // 모든 지원 언어별 사이트맵 URL 생성
  const sitemapUrls = SUPPORTED_LANGUAGES.map(lang => 
    lang === 'ko' 
      ? `${SITE_URL}/sitemap.xml`
      : `${SITE_URL}/${lang}/sitemap.xml`
  );

  // 프로덕션 환경에서는 허용
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 민감한 페이지나 API 경로 차단
        disallow: [
          '/api/',
          '/auth/',
          '/test-auth/',
          '/_next/',
          '/admin/',
          '/private/',
          '/.env*',
          '/internal/',
          '/supabase-proxy/',
        ],
        // 크롤링 지연 설정 (서버 부하 방지)
        crawlDelay: 1,
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/test-auth/',
          '/admin/',
          '/private/',
          '/internal/',
          '/supabase-proxy/',
        ],
        // Google은 크롤링 지연 없음
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/test-auth/',
          '/admin/',
          '/private/',
          '/internal/',
          '/supabase-proxy/',
        ],
        crawlDelay: 1,
      },
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/private/',
          '/internal/',
        ],
      },
      {
        userAgent: 'Twitterbot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/private/',
          '/internal/',
        ],
      },
    ],
    sitemap: sitemapUrls,
    host: SITE_URL,
  };
}
