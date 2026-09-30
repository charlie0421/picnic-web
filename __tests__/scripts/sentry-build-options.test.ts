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
      // Vercel 에서도 로컬 git 자동 감지(auto)를 쓴다 — 명시 {repo, commit} 은 Sentry 에 저장소 레코드가 없어 연결되지 않았고,
      // auto 는 앞선 빌드들에서 실제로 커밋을 붙였다(Vercel 클론에도 git 이 있다)
      setCommits: {
        auto: true,
        ignoreMissing: true,
        ignoreEmpty: true,
        shouldNotThrowOnFailure: true, // 커밋 연결 실패가 finalize 를 막지 않게 (코어 런타임이 확인)
      },
    });
    expect(o.authToken).toBe('t');
    expect(o.sourcemaps.disable).toBe(false);
    expect(o.pluginDisabled).toBe(false);
  });

  it('토큰이 있어도 로컬 빌드(VERCEL 아님·명시 옵트인 없음)는 플러그인을 끈다 — 로컬 빌드가 운영 릴리스를 만들지 않게', () => {
    // 설치된 @sentry/nextjs 9 에는 disable*WebpackPlugin 옵션이 없다. 플러그인 인스턴스는 항상 등록되므로
    // 네트워크를 막는 실제 수단은 authToken 미전달(릴리스 생성·업로드 안 함) + sourcemaps.disable 이다.
    const o = sentryBuildOptions({ buildVersion: BUILD, env: { SENTRY_AUTH_TOKEN: 't' } });
    expect(o.enabled).toBe(false);
    expect(o.authToken).toBeUndefined();
    expect(o.sourcemaps.disable).toBe(true);
    expect(o.release.create).toBe(false);
    expect(o.release.finalize).toBe(false);
    // 코어의 플러그인 수준 disable — setCommits 등 어떤 네트워크 호출도 하지 않는다
    expect(o.pluginDisabled).toBe(true);
    expect(o).not.toHaveProperty('disableClientWebpackPlugin');
    expect(o).not.toHaveProperty('disableServerWebpackPlugin');
  });

  it('로컬 옵트인(SENTRY_UPLOAD_SOURCEMAPS=1)도 같은 auto 커밋 연결을 쓴다', () => {
    const o = sentryBuildOptions({
      buildVersion: BUILD,
      env: { SENTRY_AUTH_TOKEN: 't', SENTRY_UPLOAD_SOURCEMAPS: '1' },
    });
    expect(o.enabled).toBe(true);
    expect(o.release.setCommits).toEqual({ auto: true, ignoreMissing: true, ignoreEmpty: true, shouldNotThrowOnFailure: true });
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

describe('런타임 SDK 세 곳이 같은 릴리스 이름을 본다', () => {
  const root = process.cwd();
  const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8');

  it('next.config 는 플러그인 수준 disable 을 unstable_sentryWebpackPluginOptions 로 넘긴다', () => {
    expect(nextConfig).toMatch(/unstable_sentryWebpackPluginOptions:\s*\{[^}]*disable:\s*sentryBuild\.pluginDisabled/);
  });

  it('next.config 가 SENTRY_RELEASE 와 NEXT_PUBLIC_SENTRY_RELEASE 를 같은 값으로 인라인한다', () => {
    expect(nextConfig).toMatch(/SENTRY_RELEASE:\s*sentryBuild\.release\.name/);
    expect(nextConfig).toMatch(/NEXT_PUBLIC_SENTRY_RELEASE:\s*sentryBuild\.release\.name/);
  });

  it('서버·엣지 설정은 인라인된 SENTRY_RELEASE 를, 클라이언트는 NEXT_PUBLIC_SENTRY_RELEASE 를 읽는다', () => {
    expect(readFileSync(join(root, 'sentry.server.config.js'), 'utf8')).toMatch(/release:\s*process\.env\.SENTRY_RELEASE/);
    expect(readFileSync(join(root, 'sentry.edge.config.js'), 'utf8')).toMatch(/release:\s*process\.env\.SENTRY_RELEASE/);
    expect(readFileSync(join(root, 'instrumentation-client.ts'), 'utf8')).toMatch(/release:\s*process\.env\.NEXT_PUBLIC_SENTRY_RELEASE/);
  });

  it('릴리스 이름은 빌드 버전에서 한 번만 정한다 — 환경변수 오버라이드는 클라이언트만 바꾸지 않는다', () => {
    const env = { NEXT_PUBLIC_SENTRY_RELEASE: 'picnic-web@manual', SENTRY_AUTH_TOKEN: 't', VERCEL: '1' };
    const o = sentryBuildOptions({ buildVersion: BUILD, env });
    expect(o.release.name).toBe('picnic-web@manual');
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
