import { MetadataRoute } from 'next';
import { SITE_URL } from './constants/static-pages';

/**
 * robots.txt 생성 함수
 * 
 * Next.js의 메타데이터 API를 활용하여 로봇 텍스트 파일을 동적으로 생성합니다.
 * 각 언어별 경로에 사이트맵을 연결합니다.
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
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/test-auth/',
        ],
      },
    ],
    sitemap: [
      `${SITE_URL}/ko/sitemap.xml`,
      `${SITE_URL}/en/sitemap.xml`,
    ],
    host: SITE_URL,
  };
}
