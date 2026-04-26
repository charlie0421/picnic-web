const DEFAULT_SITE_URL = 'https://www.picnic.fan';

export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? DEFAULT_SITE_URL);

/**
 * 사이트맵 및 SEO 도구에서 사용하는 정적 페이지 목록
 */
export const STATIC_PAGES = [
    '/',
    '/media',
    '/vote',
    '/rewards',
    '/faq',
    '/notice',
    '/community',
    '/concert2025',
    '/star-candy',
    '/download',
    '/terms',
    '/privacy',
];

/**
 * 소셜 미디어 공유 링크
 */
export const SOCIAL_LINKS = {
    TWITTER: 'https://twitter.com/picnic',
    INSTAGRAM: 'https://instagram.com/picnic',
    FACEBOOK: 'https://facebook.com/picnic',
    YOUTUBE: 'https://youtube.com/picnic',
};

/**
 * 새 페이지에서 열도록 설정할 외부 링크
 */
export const EXTERNAL_LINKS = {
    HELP_CENTER: 'https://help.picnic.com',
    CAREER: 'https://career.picnic.com',
    PRESS: 'https://press.picnic.com',
}; 