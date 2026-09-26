import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

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
});
