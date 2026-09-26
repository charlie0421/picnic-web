import { describe, it, expect, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { config, middleware } from '@/middleware';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

/**
 * 정적 자산은 middleware(Supabase 세션 갱신·프로필 조회)를 거칠 이유가 없다.
 * 반면 HTML 경로는 인앱 redirect·탈퇴 차단·x-locale 주입이 계속 돌아야 한다.
 * 자산 판정은 확장자가 아니라 public/ 의 실제 자산 경로로 한다 — `/ko/vote/295.json` 처럼
 * 확장자가 붙은 동적 HTML 경로도 페이지로 라우팅되기 때문이다.
 * 판정은 Next 가 실제로 쓰는 matcher 컴파일러로 한다.
 */
describe('middleware matcher', () => {
  it.each([
    '/images/logo.webp',
    '/images/og-image.jpg',
    '/images/star-candy/star_100.png',
    '/locales/ko.json',
    '/favicon/favicon-32x32.png',
    '/favicon/favicon.ico',
    '/firebase-messaging-sw.js',
    '/emergency-auth-fix.js',
    '/concert2025/image/logo.png',
    '/concert2025/video/01.YOUNGPASSE.mp4',
    '/images/default-avatar.svg',
  ])('정적 자산 %s 은 제외한다', (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each([
    '/',
    '/ko',
    '/en/vote',
    '/ko/vote/295',
    '/zh-tw/vote?status=ongoing',
    '/ja/login',
    '/ko/mypage',
    '/auth/callback',
    '/open-in-browser',
    '/vote',
    '/concert2025',
    '/ko/notice/release-1.2',
    // 확장자가 붙어도 [lang] 아래 동적 경로는 페이지로 라우팅된다 (parseInt('295.json') === 295)
    '/ko/vote/295.json',
    '/ko/vote/295.0',
    '/en/vote/295.png',
    '/ja/vote/295.js',
    '/en/sitemap.xml',
  ])('HTML 경로 %s 은 계속 실행한다', (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    '/api/votes',
    '/_next/static/chunks/main.js',
    '/_next/image?url=%2Fimages%2Flogo.webp&w=640&q=75',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-0.xml',
    '/manifest.json',
    '/site.webmanifest',
    '/.well-known/assetlinks.json',
  ])('기존 제외 경로 %s 은 그대로 제외한다', (url) => {
    expect(matches(url)).toBe(false);
  });
});

/**
 * matcher 문자열(정적 분석 대상이라 상수를 공유할 수 없다)과 middleware 안의 STATIC_ASSET_PATH 는
 * 같은 기준이어야 한다: matcher 가 건너뛰는 자산은 인앱 redirect 도 건너뛰고,
 * matcher 가 실행하는 페이지 경로는 인앱 redirect 대상이다.
 */
describe('matcher 제외 ⇔ 인앱 redirect 정적 자산 판정', () => {
  const KAKAOTALK_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KAKAOTALK 10.0.0';

  it.each([
    '/images/logo.webp',
    '/locales/ko.json',
    '/favicon/favicon-32x32.png',
    '/favicon.ico',
    '/concert2025/image/logo.png',
    '/concert2025/video/01.YOUNGPASSE.mp4',
    '/firebase-messaging-sw.js',
    '/emergency-auth-fix.js',
    '/robots.txt',
    '/sitemap-0.xml',
    '/manifest.json',
    '/.well-known/assetlinks.json',
    '/ko/vote',
    '/ko/vote/295.json',
    '/ko/vote/295.0',
    '/en/sitemap.xml',
    '/concert2025',
  ])('%s', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const res = await middleware(
      new NextRequest(`http://localhost${path}`, { headers: { 'user-agent': KAKAOTALK_UA } }),
    );
    vi.unstubAllEnvs();
    expect(res.status === 307).toBe(matches(path));
  });
});
