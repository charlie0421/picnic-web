import { describe, it, expect, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { config } from '@/middleware';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

/**
 * 정적 자산은 middleware(Supabase 세션 갱신·프로필 조회)를 거칠 이유가 없다.
 * 반면 HTML 경로는 인앱 redirect·탈퇴 차단·x-locale 주입이 계속 돌아야 한다.
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
    '/concert2025/teaser.mp4',
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
    // 확장자처럼 보이는 점이 있어도 자산 확장자가 아니면 HTML 경로로 본다
    '/ko/notice/release-1.2',
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
