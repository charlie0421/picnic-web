import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const configPath = path.join(root, 'next.config.js');

type Overrides = { pageExtensions?: string[]; distDir?: string };

const { nextConfigOverrides, findTestRoutes } = require(
  path.join(root, 'scripts/envelope-test/build-switch.js'),
) as {
  nextConfigOverrides: (env: Record<string, string | undefined>) => Overrides;
  findTestRoutes: (appPathRoutes: Record<string, string> | undefined) => string[];
};

function loadNextConfig(): Overrides {
  delete require.cache[require.resolve(configPath)];
  return require(configPath) as Overrides;
}

describe('envelope 테스트 전용 빌드 스위치', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete require.cache[require.resolve(configPath)];
  });

  it.each([undefined, '', '0', 'true'])('ENVELOPE_TEST=%s 이면 설정을 바꾸지 않는다', (value) => {
    expect(nextConfigOverrides({ ENVELOPE_TEST: value })).toEqual({});
  });

  it('ENVELOPE_TEST=1 이면 산출물을 별도 디렉터리에 둔다', () => {
    // pageExtensions 는 건드리지 않는다. 확장자가 두 겹인 edge 라우트는 Next 가 빌드하지 못한다.
    expect(nextConfigOverrides({ ENVELOPE_TEST: '1' })).toEqual({ distDir: '.next-envtest' });
  });

  it('Vercel 빌드에서 ENVELOPE_TEST=1 이면 빌드를 실패시킨다', () => {
    expect(() => nextConfigOverrides({ ENVELOPE_TEST: '1', VERCEL: '1' })).toThrow(/Vercel/);
  });

  it('next.config.js 가 스위치를 그대로 반영한다', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('ENVELOPE_TEST', '');
    const normal = loadNextConfig();
    expect(normal.pageExtensions).toBeUndefined();
    expect(normal.distDir).toBeUndefined();

    vi.stubEnv('ENVELOPE_TEST', '1');
    const testBuild = loadNextConfig();
    expect(testBuild.pageExtensions).toBeUndefined();
    expect(testBuild.distDir).toBe('.next-envtest');
  });
});

describe('운영 산출물의 테스트 라우트 검사', () => {
  it('테스트 라우트가 없으면 빈 목록이다', () => {
    expect(findTestRoutes({ '/api/health/route': '/api/health', '/[lang]/(main)/vote/page': '/[lang]/vote' })).toEqual([]);
    expect(findTestRoutes(undefined)).toEqual([]);
  });

  it('테스트 라우트를 찾아낸다', () => {
    expect(
      findTestRoutes({
        '/api/health/route': '/api/health',
        '/api/envelope-test/throw/route': '/api/envelope-test/throw',
      }),
    ).toEqual(['/api/envelope-test/throw/route → /api/envelope-test/throw']);
  });

  it('postbuild 가 sitemap 생성 전에 검사를 돌린다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postbuild).toBe(
      'node scripts/verify-rendering-modes.js && node scripts/verify-no-test-routes.js && next-sitemap',
    );
  });

  it('테스트 빌드의 산출물 디렉터리를 git 이 추적하지 않는다', () => {
    const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
    expect(ignored).toContain('.next-envtest');
  });
});
