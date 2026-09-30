import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const scriptPath = path.join(root, 'scripts/clear-build-fetch-cache.js');

/**
 * 빌드의 프리렌더는 Supabase 조회 결과를 `.next/cache/fetch-cache` 에 남긴다. Vercel 은 `.next/cache` 를
 * 다음 빌드에 복원하므로, 비우지 않으면 새 배포의 공지·FAQ·다운로드 페이지가 예전 빌드가 받아 둔 데이터로
 * 만들어진다 (같은 워크트리에서 빌드를 두 번 돌리면 두 번째 빌드는 Supabase 에 조회를 0건 보낸다).
 */
describe('scripts/clear-build-fetch-cache.js', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-cache-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const load = () =>
    require(scriptPath) as { clearBuildFetchCache: (dir?: string) => { dir: string; existed: boolean } };

  it('이전 빌드의 fetch 캐시를 지운다', () => {
    const fetchCache = path.join(projectDir, '.next', 'cache', 'fetch-cache');
    fs.mkdirSync(fetchCache, { recursive: true });
    fs.writeFileSync(path.join(fetchCache, 'abc123'), '{"kind":"FETCH"}');

    const result = load().clearBuildFetchCache(projectDir);

    expect(result).toEqual({ dir: fetchCache, existed: true });
    expect(fs.existsSync(fetchCache)).toBe(false);
  });

  it('다른 빌드 캐시(webpack 등)는 건드리지 않는다 — 빌드 시간을 지킨다', () => {
    const cacheDir = path.join(projectDir, '.next', 'cache');
    fs.mkdirSync(path.join(cacheDir, 'fetch-cache'), { recursive: true });
    fs.mkdirSync(path.join(cacheDir, 'webpack'), { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'webpack', 'pack'), 'x');
    fs.writeFileSync(path.join(cacheDir, '.tsbuildinfo'), '{}');

    load().clearBuildFetchCache(projectDir);

    expect(fs.existsSync(path.join(cacheDir, 'webpack', 'pack'))).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, '.tsbuildinfo'))).toBe(true);
  });

  it('캐시가 없어도(첫 빌드) 실패하지 않는다', () => {
    const result = load().clearBuildFetchCache(projectDir);

    expect(result.existed).toBe(false);
  });

  it('npm run build 전에 실행된다 (prebuild)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.prebuild).toBe('node scripts/clear-build-fetch-cache.js');
    expect(pkg.scripts.build).toBe('next build');
  });
});
