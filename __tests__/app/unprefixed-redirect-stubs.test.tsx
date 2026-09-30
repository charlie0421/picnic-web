import { createRequire } from 'module';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_LANGUAGE } from '@/config/settings';

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT;${url}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

import VoteStub from '@/app/(bare)/vote/page';
import VoteDetailStub from '@/app/(bare)/vote/[id]/page';
import MyPageStub from '@/app/(bare)/mypage/page';
import ConcertStub from '@/app/(bare)/concert2025/page';

const targetOf = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('redirect() was not called');
};

/**
 * 언어 접두어 없는 진입 경로는 **페이지**가 리다이렉트한다 — next.config.js 의 redirects() 가 아니다.
 *
 * 설정 리다이렉트는 middleware 보다 먼저 실행된다. 그러면 카카오톡 같은 인앱 브라우저로 /vote/123 을 연
 * 사용자가 middleware 의 "외부 브라우저로 열기" 안내에 도달하기 전에 이미 /en/vote/123 이 되어,
 * 안내 페이지 언어가 Accept-Language 가 아니라 en 으로 고정된다(탈퇴 계정 리다이렉트의 언어도 같다).
 * 페이지로 두면 middleware 가 접두어 없는 경로를 먼저 본다.
 */
describe('언어 접두어 없는 진입 경로', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/vote → 기본 언어의 투표 목록', async () => {
    expect(await targetOf(() => VoteStub())).toBe(`/${DEFAULT_LANGUAGE}/vote`);
  });

  it('/vote/:id → id 를 보존한 기본 언어의 투표 상세', async () => {
    expect(await targetOf(() => VoteDetailStub({ params: Promise.resolve({ id: '295' }) }))).toBe(
      `/${DEFAULT_LANGUAGE}/vote/295`,
    );
  });

  it('/mypage → 기본 언어의 마이페이지', async () => {
    expect(await targetOf(() => MyPageStub())).toBe(`/${DEFAULT_LANGUAGE}/mypage`);
  });

  it('/concert2025 → 기본 언어의 콘서트 페이지', async () => {
    expect(await targetOf(() => ConcertStub())).toBe(`/${DEFAULT_LANGUAGE}/concert2025`);
  });

  it.each(['/vote', '/vote/:id', '/mypage', '/concert2025'])(
    'next.config.js 는 %s 를 리다이렉트하지 않는다 (middleware 보다 먼저 실행되므로)',
    async (source) => {
      const require = createRequire(import.meta.url);
      const config = require(path.join(process.cwd(), 'next.config.js')) as {
        redirects: () => Promise<Array<{ source: string }>>;
      };
      const redirects = await config.redirects();
      expect(redirects.filter((redirect) => redirect.source === source)).toEqual([]);
    },
  );
});
