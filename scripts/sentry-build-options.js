/**
 * Sentry 빌드(번들러 플러그인) 옵션 — next.config.js 가 쓴다.
 *
 * 릴리스는 한 빌드에 하나다: `picnic-web@<BUILD_VERSION>` (예: picnic-web@20260930.1241.001).
 * 플러그인이 릴리스 생성·소스맵 업로드·커밋 연결·finalize 를 모두 맡고, 같은 이름을
 * 번들에 주입해 서버·엣지 SDK 가 보고하며, 클라이언트는 NEXT_PUBLIC_SENTRY_RELEASE 로 받는다.
 * (예전에는 postbuild 의 sentry-cli 가 `picnic-web@0.1.0-<date>-` 라는 두 번째 릴리스를 만들었다.)
 *
 * 업로드는 Vercel 빌드에서만 켠다. 로컬 `next build` 는 .env.local 에 토큰이 있어도
 * 운영 Sentry 에 릴리스·소스맵을 올리지 않는다 — 필요하면 SENTRY_UPLOAD_SOURCEMAPS=1 로 옵트인.
 * 설치된 @sentry/nextjs 9 에는 disable*WebpackPlugin 옵션이 없어 플러그인 인스턴스는 항상 등록된다.
 * 네트워크를 실제로 막는 수단은 authToken 미전달(코어가 릴리스 생성·업로드를 건너뜀)과 sourcemaps.disable 이다.
 */

const SENTRY_APPLICATION_KEY = 'picnic-web';
const RELEASE_PREFIX = 'picnic-web@';

function resolveSentryRelease({ buildVersion, env }) {
  if (env.NEXT_PUBLIC_SENTRY_RELEASE) return env.NEXT_PUBLIC_SENTRY_RELEASE;
  return buildVersion ? `${RELEASE_PREFIX}${buildVersion}` : undefined;
}

function setCommitsFor(env) {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug, VERCEL_GIT_COMMIT_SHA: sha } = env;
  if (owner && slug && sha) {
    // Vercel 은 얕은 클론이라 로컬 git 자동 감지 대신 제공된 커밋을 명시한다
    return { repo: `${owner}/${slug}`, commit: sha, ignoreMissing: true, ignoreEmpty: true };
  }
  return { auto: true, ignoreMissing: true, ignoreEmpty: true };
}

function sentryBuildOptions({ buildVersion, env }) {
  const enabled =
    !!env.SENTRY_AUTH_TOKEN && (env.VERCEL === '1' || env.SENTRY_UPLOAD_SOURCEMAPS === '1');
  const release = resolveSentryRelease({ buildVersion, env });

  return {
    enabled,
    silent: true,
    hideSourceMaps: true, // 업로드 후 .map 파일 public 노출 방지
    org: env.SENTRY_ORG || 'icon-casting',
    project: env.SENTRY_PROJECT || 'picnic-web',
    authToken: enabled ? env.SENTRY_AUTH_TOKEN : undefined,
    release: {
      name: release,
      create: enabled,
      finalize: enabled,
      setCommits: setCommitsFor(env),
    },
    // 기본값은 pages/app 청크만 업로드 — vendor 청크(Supabase 등)의 minified 프레임을
    // 풀려면 모든 client chunk 가 필요하다.
    widenClientFileUpload: true,
    sourcemaps: { disable: !enabled },
    // thirdPartyErrorFilterIntegration 용 앱 키 — 각 청크에 메타데이터로 심는다.
    applicationKey: SENTRY_APPLICATION_KEY,
  };
}

module.exports = { resolveSentryRelease, sentryBuildOptions, SENTRY_APPLICATION_KEY };
