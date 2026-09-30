// 언어 목록은 config/settings.ts 의 SUPPORTED_LANGUAGES 와 같아야 한다(이 파일은 CJS 라 import 할 수 없다.
// 일치 여부는 __tests__/next-sitemap-config.test.ts 가 검증한다).
const LANGUAGES = ['en', 'ko', 'zh-cn', 'zh-tw', 'ja', 'id', 'es', 'bn', 'tl', 'th', 'vi', 'my'];

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://www.picnic.fan', // 실제 사이트 URL로 변경
  generateRobotsTxt: true,
  changefreq: 'daily',
  priority: 0.7,
  sitemapSize: 5000,
  // next-sitemap 은 프리렌더된 경로를 전부 sitemap-0.xml 에 쓴다. 색인 대상이 아닌 경로를 뺀다.
  // (`*` 는 `/` 를 포함해 무엇이든 맞는다.)
  exclude: [
    '/admin/*',
    '/private/*',
    // 언어 세그먼트 밖: 인증 콜백·광고 플레이어·접두어 없는 리다이렉트
    '/auth/*',
    '/ads/*',
    '/vote',
    '/mypage',
    '/concert2025',
    // 리다이렉트만 하는 언어 루트(/ko → /ko/vote)
    ...LANGUAGES.map((lang) => `/${lang}`),
    // 로그인·마이페이지
    '/*/login',
    '/*/mypage/*',
  ],
  robotsTxtOptions: {
    additionalSitemaps: [
      // 동적으로 생성된 추가 사이트맵이 필요한 경우 여기에 추가
    ],
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/private'],
      },
    ],
  },
};
