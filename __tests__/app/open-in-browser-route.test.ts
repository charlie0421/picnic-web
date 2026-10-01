import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/open-in-browser/route';

const request = (query: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/open-in-browser${query}`, {
    headers: { host: 'localhost', ...headers },
  });

/** Location 을 경로+쿼리로 돌려준다. 출처가 요청과 다르면 실패시킨다. */
const locationOf = (res: Response): string => {
  const url = new URL(res.headers.get('location') ?? '');
  expect(url.origin).toBe('http://localhost');
  return `${url.pathname}${url.search}`;
};

/**
 * 인앱 브라우저 안내의 언어 없는 입구. middleware 가 인앱 요청을 /open-in-browser?returnTo=… 로 보내면
 * 언어를 정해 /{언어}/open-in-browser 로 다시 보낸다.
 */
describe('GET /open-in-browser', () => {
  it('returnTo 의 언어로 안내 페이지에 보내고 returnTo 를 보존한다', () => {
    const res = GET(request('?returnTo=%2Fko%2Fvote%2F295'));
    expect(locationOf(res)).toBe('/ko/open-in-browser?returnTo=%2Fko%2Fvote%2F295');
  });

  // 영구 리다이렉트는 브라우저에 남아 Vercel Instant Rollback 으로 되돌릴 수 없다.
  it('임시 리다이렉트(307)를 쓴다', () => {
    expect(GET(request('?returnTo=%2Fko%2Fvote')).status).toBe(307);
  });

  it('쿠키와 Accept-Language 에 따라 달라지는 응답이라 캐시하지 않는다', () => {
    expect(GET(request('?returnTo=%2F')).headers.get('cache-control')).toBe('private, no-store');
  });

  // returnTo 에 언어가 없으면 middleware 와 같은 순서로 정한다(lib/i18n/locale-routing.ts).
  it.each([
    ['쿠키가 Accept-Language 보다 앞선다', '?returnTo=%2F', { cookie: 'locale=ja', 'accept-language': 'ko-KR' }, 'ja'],
    ['Accept-Language', '?returnTo=%2F', { 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' }, 'ko'],
    ['Accept-Language 의 번체 중국어', '?returnTo=%2F', { 'accept-language': 'zh-Hant-HK' }, 'zh-tw'],
    ['신호가 없으면 en', '?returnTo=%2F', {}, 'en'],
    ['returnTo 가 없을 때', '', { 'accept-language': 'es-MX' }, 'es'],
    ['언어가 아닌 첫 세그먼트', '?returnTo=%2Fmy-page', { 'accept-language': 'th' }, 'th'],
  ])('%s', (_name, query, headers, lang) => {
    expect(new URL(GET(request(query, headers)).headers.get('location') ?? '').pathname).toBe(
      `/${lang}/open-in-browser`,
    );
  });

  it.each([
    ['returnTo 의 언어가 쿠키보다 앞선다', '?returnTo=%2Fth%2Fvote', { cookie: 'locale=ja' }, 'th'],
    ['표기 변형 /KO', '?returnTo=%2FKO%2Fvote', {}, 'ko'],
    ['표기 변형 /zh', '?returnTo=%2Fzh%2Fvote', {}, 'zh-cn'],
    ['쿼리가 붙은 언어 루트', '?returnTo=%2Fko%3Fx%3D1', { 'accept-language': 'ja' }, 'ko'],
  ])('%s', (_name, query, headers, lang) => {
    expect(new URL(GET(request(query, headers)).headers.get('location') ?? '').pathname).toBe(
      `/${lang}/open-in-browser`,
    );
  });

  it('returnTo 가 / 로 시작하지 않으면 / 를 붙인다', () => {
    expect(locationOf(GET(request('?returnTo=vote')))).toBe('/en/open-in-browser?returnTo=%2Fvote');
  });
});
