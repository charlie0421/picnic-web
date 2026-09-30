import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/config/settings';

type Redirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

type NextConfig = {
  redirects: () => Promise<Redirect[]>;
};

describe('next.config.js 진입 리다이렉트 계약', () => {
  it('언어 루트 정규식이 SUPPORTED_LANGUAGES 전체와 정확히 일치한다', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    const languageRootRedirects = redirects.filter(
      ({ source, destination }) => source.startsWith('/:lang(') && destination === '/:lang/vote',
    );

    expect(languageRootRedirects).toHaveLength(1);

    const match = languageRootRedirects[0].source.match(/^\/:lang\(([^)]+)\)$/);
    expect(match).not.toBeNull();
    expect(match?.[1].split('|')).toEqual([...SUPPORTED_LANGUAGES]);
  });

  // 예전에는 app/vote/page.tsx 같은 스텁 페이지가 redirect() 했다. 루트 레이아웃이 pass-through 가 되면
  // [lang] 밖 페이지는 <html> 을 받지 못하므로, 함수 호출 없는 설정 리다이렉트로 옮겼다.
  it.each([
    ['/vote', '/vote'],
    ['/vote/:id', '/vote/:id'],
    ['/mypage', '/mypage'],
    ['/concert2025', '/concert2025'],
  ])('언어 접두어 없는 %s 는 기본 언어로 보낸다', async (source, rest) => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    const matches = redirects.filter((redirect) => redirect.source === source);

    expect(matches).toEqual([
      { source, destination: `/${DEFAULT_LANGUAGE}${rest}`, permanent: false },
    ]);
  });

  it.each([
    'app/page.tsx',
    'app/vote/page.tsx',
    'app/vote/[id]/page.tsx',
    'app/mypage/page.tsx',
    'app/concert2025/page.tsx',
  ])('%s 스텁은 남아 있지 않다 (<html> 없는 페이지가 된다)', (file) => {
    expect(fs.existsSync(path.join(process.cwd(), file))).toBe(false);
  });
});
