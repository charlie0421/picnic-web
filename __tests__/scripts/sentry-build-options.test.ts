import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveSentryRelease,
  sentryBuildOptions,
} from '../../scripts/sentry-build-options';

/**
 * Sentry 릴리스는 한 빌드에 하나(`picnic-web@YYYYMMDD.HHMM.NNN`)만 만든다.
 * 번들러 플러그인이 생성·소스맵 업로드·커밋 연결·finalize 를 모두 맡고,
 * 런타임 SDK(서버·엣지·클라이언트)는 같은 이름을 보고한다.
 * 예전에는 postbuild 의 sentry-cli 가 `picnic-web@0.1.0-<date>-` 라는 두 번째 릴리스를 만들어
 * 소스맵을 한 번 더 올리고 커밋을 거기에 붙였다(아무 에러도 그 릴리스로 오지 않음).
 */
const BUILD = '20260930.1241.001';

describe('resolveSentryRelease', () => {
  it('빌드 버전에서 picnic-web@<버전> 을 만든다', () => {
    expect(resolveSentryRelease({ buildVersion: BUILD, env: {} })).toBe(`picnic-web@${BUILD}`);
  });

  it('NEXT_PUBLIC_SENTRY_RELEASE 가 있으면 그것을 우선한다', () => {
    expect(
      resolveSentryRelease({ buildVersion: BUILD, env: { NEXT_PUBLIC_SENTRY_RELEASE: 'picnic-web@manual' } }),
    ).toBe('picnic-web@manual');
  });

  it('빌드 버전이 없으면 undefined (플러그인·SDK 가 자동 판별)', () => {
    expect(resolveSentryRelease({ buildVersion: undefined, env: {} })).toBeUndefined();
  });
});

describe('sentryBuildOptions', () => {
  const vercelEnv = {
    SENTRY_AUTH_TOKEN: 't',
    VERCEL: '1',
    VERCEL_GIT_REPO_OWNER: 'charlie0421',
    VERCEL_GIT_REPO_SLUG: 'picnic-web',
    VERCEL_GIT_COMMIT_SHA: 'abc123',
  };

  it('Vercel 빌드: 플러그인이 릴리스를 만들고 finalize 하며 Vercel 커밋을 연결한다', () => {
    const o = sentryBuildOptions({ buildVersion: BUILD, env: vercelEnv });
    expect(o.enabled).toBe(true);
    expect(o.release).toEqual({
      name: `picnic-web@${BUILD}`,
      create: true,
      finalize: true,
      setCommits: { repo: 'charlie0421/picnic-web', commit: 'abc123', ignoreMissing: true },
    });
    expect(o.disableClientWebpackPlugin).toBe(false);
    expect(o.disableServerWebpackPlugin).toBe(false);
  });

  it('토큰이 있어도 로컬 빌드(VERCEL 아님·명시 옵트인 없음)는 플러그인을 끈다 — 로컬 빌드가 운영 릴리스를 만들지 않게', () => {
    const o = sentryBuildOptions({ buildVersion: BUILD, env: { SENTRY_AUTH_TOKEN: 't' } });
    expect(o.enabled).toBe(false);
    expect(o.disableClientWebpackPlugin).toBe(true);
    expect(o.disableServerWebpackPlugin).toBe(true);
    expect(o.release.create).toBe(false);
  });

  it('로컬에서 SENTRY_UPLOAD_SOURCEMAPS=1 로 옵트인하면 로컬 git 커밋을 자동 연결한다', () => {
    const o = sentryBuildOptions({
      buildVersion: BUILD,
      env: { SENTRY_AUTH_TOKEN: 't', SENTRY_UPLOAD_SOURCEMAPS: '1' },
    });
    expect(o.enabled).toBe(true);
    expect(o.release.setCommits).toEqual({ auto: true, ignoreMissing: true });
  });

  it('토큰이 없으면 어디서든 꺼진다', () => {
    expect(sentryBuildOptions({ buildVersion: BUILD, env: { VERCEL: '1' } }).enabled).toBe(false);
  });

  it('앱 키·소스맵 옵션은 유지된다', () => {
    const o = sentryBuildOptions({ buildVersion: BUILD, env: vercelEnv });
    expect(o.applicationKey).toBe('picnic-web');
    expect(o.hideSourceMaps).toBe(true);
    expect(o.widenClientFileUpload).toBe(true);
    expect(o.org).toBe('icon-casting');
    expect(o.project).toBe('picnic-web');
  });
});

describe('두 번째 릴리스를 만들던 postbuild 경로 제거', () => {
  const root = process.cwd();

  it('scripts/sentry-release.js 가 없다', () => {
    expect(existsSync(join(root, 'scripts/sentry-release.js'))).toBe(false);
  });

  it('postbuild 는 sitemap 만 돌리고 sentry:release 스크립트는 없다', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postbuild).toBe('next-sitemap');
    expect(pkg.scripts['sentry:release']).toBeUndefined();
  });
});
