// This file configures the initialization of Sentry on the browser/client side.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const SENTRY_DEBUG = process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true';
const TRACES_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE || (process.env.NODE_ENV === 'production' ? '0.02' : '0.1'));
const REPLAY_SESSION_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE || (process.env.NODE_ENV === 'production' ? '0.0' : '0.02'));
const REPLAY_ERROR_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE || '1.0');
// Sentry 번들러 플러그인이 우리 청크마다 심는 앱 키 (next.config.js 의
// applicationKey). 플러그인이 실제로 실행되는 빌드에서만 노출된다. 키 없이
// 필터 통합을 켜면 메타데이터가 없는 모든 프레임이 외부로 보여 이벤트 전부가
// 외부 코드로 분류되므로, 키가 없으면 통합 자체를 등록하지 않는다.
const APPLICATION_KEY = process.env.NEXT_PUBLIC_SENTRY_APPLICATION_KEY;

// thirdPartyErrorFilterIntegration 이 프레임에 붙이는 앱 키 메타데이터의 접두어.
// @sentry/core 내부 상수(BUNDLER_PLUGIN_APP_KEY_PREFIX) — 계약 테스트가 SDK
// 소스와 대조한다.
const APP_KEY_METADATA_PREFIX = '_sentryBundlerPluginAppKey:';

type StackFrame = Sentry.StackFrame;

const frameHasAppKey = (frame: StackFrame, key: string): boolean =>
  !!(frame.module_metadata as Record<string, unknown> | undefined)?.[`${APP_KEY_METADATA_PREFIX}${key}`];

// Sentry v9 helpers.js 의 sentryWrapped 가 콜백을 호출하는 지점(`fn.apply`)의
// 위치. 파일은 basename 만 비교한다 — 프로브가 파싱하는 raw 프레임은 origin 이
// 붙은 URL 이고, 이벤트 프레임은 Next SDK 가 event processor 에서
// `app:///_next/...` 로 재작성한 뒤 beforeSend 에 도착하기 때문이다. 행·열은
// 재작성되지 않는다.
type FrameLocation = { file: string; lineno: number; colno: number | undefined };
let wrapperFrameLocation: FrameLocation | undefined;

const frameFile = (filename: string | undefined): string => (filename ?? '').split('/').pop() ?? '';

/**
 * 부팅 직후 타이머 콜백에서 스택을 떠 래퍼 프레임의 위치를 확보한다.
 * browserApiErrors 통합(기본 활성)이 setTimeout 콜백을 sentryWrapped 로 감싸므로
 * 이 함수의 스택 최외곽 프레임이 곧 래퍼다. 함수명은 프로덕션에서 `r` 처럼
 * 축약돼 우리 코드와 구분되지 않기 때문에 위치로만 식별한다.
 * 실패하면 위치를 비워 두고 보정을 건너뛴다 (안전한 기본값은 "유지").
 */
function probeWrapperFrameLocation() {
  const stackParser = Sentry.getClient()?.getOptions().stackParser;
  if (!stackParser) return;
  // core 의 stackParser 는 최외곽(oldest) 프레임이 [0] 이 되도록 뒤집어 준다.
  const frames = stackParser(new Error('sentry-wrapper-probe').stack ?? '');
  // [래퍼, 이 함수] 두 프레임이 있어야 한다. 하나뿐이면 래퍼가 없는 것이다.
  if (frames.length < 2) return;
  const outermost = frames[0];
  if (!outermost?.filename || outermost.lineno === undefined) return;
  wrapperFrameLocation = {
    file: frameFile(outermost.filename),
    lineno: outermost.lineno,
    colno: outermost.colno,
  };
}

const isSentryWrapperFrame = (frame: StackFrame): boolean =>
  !!wrapperFrameLocation &&
  frameFile(frame.filename) === wrapperFrameLocation.file &&
  frame.lineno === wrapperFrameLocation.lineno &&
  frame.colno === wrapperFrameLocation.colno;

// DSN이 없으면 Sentry 초기화를 건너뛰기 (개발 환경에서 네트워크 에러 방지)
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Debug mode - only in development
    debug: SENTRY_DEBUG,
    
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // Sample rate for performance monitoring (env-driven, conservative default)
    tracesSampleRate: TRACES_RATE,
    
    // Sample rate for session replays (disabled by default in prod)
    replaysSessionSampleRate: REPLAY_SESSION_RATE,
    
    // Sample rate for error replays
    replaysOnErrorSampleRate: REPLAY_ERROR_RATE,
    
    // Configure integrations
    integrations: [
      // Session Replay integration for debugging
      Sentry.replayIntegration({
        // 화면의 모든 텍스트를 마스킹한다. false 로 두면 로그인·마이페이지·QnA
        // 같은 화면에서 오류가 한 번만 나도 사용자 텍스트가 그대로 외부로
        // 전송된다(SDK 기본값도 true 다).
        maskAllText: true,
        // 입력값은 항상 마스킹한다
        maskAllInputs: true,
        // 미디어 요소 차단
        blockAllMedia: true,
      }),
      
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        // Automatic route change tracking for Next.js App Router
        // nextRouterInstrumentation is deprecated in v9+
      }),

      // 브라우저 확장·광고 CMP 가 주입한 스크립트(PICNIC-WEB-6R 의
      // `executors/200.js`, MetaMask inpage.js, zaloJSV2 등) 에서 난 에러 차단.
      // 아래 isThirdPartyAd 는 광고사 도메인명만 매칭해 일반 경로의 주입
      // 스크립트를 놓친다. 이 통합은 "우리 청크 프레임이 하나도 없는가" 를
      // 빌드 시 심은 앱 키로 판정하므로 파일명 패턴에 의존하지 않는다.
      // 드롭 모드 대신 태그 모드를 쓰고 beforeSend 에서 드롭하는 이유는
      // beforeSend 의 주석 참조.
      // 알려진 공백: Sentry SDK 래퍼(helpers.js) 프레임은 우리 청크에 번들돼
      // 앱 키가 붙으므로 그 프레임이 섞인 외부 에러(PICNIC-WEB-6S)는 못 잡는다.
      // getsentry/sentry-javascript#13835 — v10 의 ignoreSentryInternalFrames 필요.
      ...(APPLICATION_KEY
        ? [
            Sentry.thirdPartyErrorFilterIntegration({
              filterKeys: [APPLICATION_KEY],
              behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
            }),
          ]
        : []),
    ],
    
    // Event filtering
    beforeSend(event) {
      // window.onerror 로 캡처된 cross-origin / 외부 에러는 Sentry SDK 가 종종
      // outer `Error` wrapper 로 감싸 event.exception.values 에 두 entry 가
      // 들어온다 ([{ type:'Error', value:'SecurityError: ...' },
      // { type:'SecurityError', value:'Blocked a frame...' }] 처럼).
      // values[0] 만 검사하면 type 매치가 실패해 노이즈가 새므로 (PR #25 이후
      // PICNIC-WEB-5D 가 계속 firing 한 원인) 모든 시그니처 체크는 values
      // 전체에 대해 some() 으로 매치한다.
      if (event.exception) {
        const values = event.exception.values ?? [];
        type ExceptionValue = (typeof values)[number];
        const matchesAnyValue = (predicate: (v: ExceptionValue) => boolean) =>
          values.some(predicate);

        // thirdPartyErrorFilterIntegration 이 "파일명 있는 프레임이 전부 외부" 로
        // 판정해 붙인 태그. 통합의 드롭 모드를 직접 쓰지 않는 이유: 그 판정은
        // 파일명 있는 프레임이 0개인 이벤트도 외부로 본다([].every === true).
        // 스택이 비는 건 외부 코드라는 증거가 아니므로(PICNIC-WEB-5Y 같은
        // IndexedDB 오류), 실제 외부 프레임이 있을 때만 드롭하고 아니면 태그를
        // 걷어낸다.
        if (event.tags?.third_party_code === true) {
          const hasNamedFrame = matchesAnyValue((v) =>
            (v.stacktrace?.frames ?? []).some((f) => !!f.filename),
          );
          if (hasNamedFrame) {
            return null;
          }
          delete event.tags.third_party_code;
        }

        // Sentry v9 helpers.js 의 sentryWrapped 는 페이지의 모든 timer/event/XHR
        // 핸들러를 감싼다. 외부 스크립트 콜백에서 난 에러는 최외곽 JS 프레임이
        // 그 래퍼(우리 청크라 앱 키가 붙음)라서 위 통합이 "전부 외부" 판정을
        // 못 내린다 (PICNIC-WEB-6S, getsentry/sentry-javascript#13835). 다음을
        // 전부 만족할 때만 그 프레임을 무시하고 드롭한다: exception 값 1개,
        // 파일명 있는 프레임 중 최외곽이 프로브로 확보한 래퍼 위치와 정확히
        // 일치, 나머지는 1개 이상이며 전부 외부.
        // [래퍼, 우리 핸들러, 외부 SDK] 처럼 우리 프레임이 둘 이상이면 우리
        // 코드가 외부 SDK 를 호출하다 난 에러일 수 있으므로 건드리지 않는다.
        if (APPLICATION_KEY && values.length === 1) {
          const [outermost, ...inner] = (values[0].stacktrace?.frames ?? []).filter(
            (f) => !!f.filename,
          );
          if (
            outermost &&
            inner.length > 0 &&
            frameHasAppKey(outermost, APPLICATION_KEY) &&
            isSentryWrapperFrame(outermost) &&
            inner.every((f) => !frameHasAppKey(f, APPLICATION_KEY))
          ) {
            return null;
          }
        }

        if (
          process.env.NODE_ENV === 'development' &&
          matchesAnyValue((v) => v.value?.includes('hydration') ?? false)
        ) {
          return null;
        }

        // Drop errors originating from third-party ad SDK frames
        // (Google AdSense / DoubleClick / Twitter in-app webview injected globals).
        // 우리 코드와 무관하며 disposed iframe race / 외부 전역 변수 미정의가 대다수.
        const isThirdPartyAd = matchesAnyValue((v) => {
          const frames = v.stacktrace?.frames ?? [];
          return frames.some((f) => {
            const fn = f.filename ?? '';
            return (
              fn.includes('/pagead/') ||
              fn.includes('googlesyndication.com') ||
              fn.includes('googletagservices.com') ||
              fn.includes('doubleclick.net') ||
              fn.includes('adsbygoogle')
            );
          });
        });
        if (isThirdPartyAd) {
          return null;
        }
        // AdSense Auto Ads / Funding Choices CMP 가 cross-origin iframe 에
        // access 시도하면 stacktrace 에 우리 chunk 의 minified line 만 남고
        // 광고 SDK filename 이 안 보여 위의 isThirdPartyAd 가 못 잡는다.
        // 메시지 패턴으로 추가 차단.
        //   - "Blocked a frame with origin ... cross-origin frame" (PICNIC-WEB-5D)
        //   - "The request was denied." DOMException code 18 (PICNIC-WEB-61)
        const isCrossOriginSecurityError = matchesAnyValue((v) => {
          const errType = v.type ?? '';
          const errValue = v.value ?? '';
          return (
            errType === 'SecurityError' &&
            (errValue.includes('cross-origin frame') ||
              errValue.includes('Blocked a frame') ||
              errValue === 'The request was denied.')
          );
        });
        if (isCrossOriginSecurityError) {
          return null;
        }
        // Chrome Mobile iOS 가 페이지에 주입하는 외부 스크립트(번역/리더/content
        // blocker 등) 가 무한 재귀에 빠질 때 window.onerror 로 새는 노이즈.
        // stacktrace 가 비어 있어(`undefined:31`) 식별 불가, 우리 코드 무관.
        // /login, /download, /open-in-browser 등 무관한 라우트에서 동일 패턴
        // 발생 (Chrome iOS 100%, mechanism=onerror, 유효 frame 0). PICNIC-WEB-5T.
        const isRangeErrorFromExternal = matchesAnyValue((v) => {
          const errType = v.type ?? '';
          const errValue = v.value ?? '';
          const frames = v.stacktrace?.frames ?? [];
          const mechType = v.mechanism?.type ?? '';
          return (
            errType === 'RangeError' &&
            errValue.includes('Maximum call stack size exceeded') &&
            mechType === 'onerror' &&
            (frames.length === 0 ||
              frames.every((f) => !f.filename || f.filename === '<anonymous>'))
          );
        });
        if (isRangeErrorFromExternal) {
          return null;
        }
      }
      // 인앱 브라우저 (Twitter/X, Facebook, Instagram, KakaoTalk, Line, NAVER 등) 의
      // hydration / replay_hydration_error 는 외부에서 DOM 을 mutate 하기 때문에
      // 우리 코드로 100% 제거 불가능. 노이즈 차단.
      const isHydrationError =
        event.exception?.values?.[0]?.value?.toLowerCase().includes('hydrat') ||
        (typeof event.message === 'string' && event.message.toLowerCase().includes('hydrat')) ||
        event.tags?.['issue.type'] === 'replay_hydration_error';
      if (isHydrationError) {
        const ua = (event.request?.headers as Record<string, string> | undefined)?.['user-agent'] ?? '';
        const browserName = (event.contexts?.browser?.name as string | undefined) ?? '';
        const isInAppBrowser =
          /KAKAOTALK|FBAV|FBAN|FB_IAB|Instagram|Twitter|TwitterAndroid|Line\/|NAVER\(inapp/i.test(ua) ||
          /Twitter|Facebook|Instagram|KakaoTalk|Line|NAVER/i.test(browserName);
        if (isInAppBrowser) {
          return null;
        }
        // Google AdSense Auto ads (특히 #google_vignette interstitial) 가 hydration
        // 종료 전에 DOM 을 mutate 하면 우리 코드와 무관한 hydration mismatch 가
        // 잡힌다. event.request.url 은 HTTP 요청 URL 이라 fragment(#...) 가 빠지므로
        // window.location.href 와 tags.url 까지 합쳐서 검사한다.
        const reqUrl = typeof event.request?.url === 'string' ? event.request.url : '';
        const tagUrl =
          (event.tags && (event.tags as Record<string, string>)['url']) || '';
        const winUrl = typeof window !== 'undefined' ? window.location.href : '';
        const allUrls = `${reqUrl}|${tagUrl}|${winUrl}`;
        if (
          allUrls.includes('#google_vignette') ||
          allUrls.includes('googlesyndication') ||
          allUrls.includes('googleadservices') ||
          allUrls.includes('googleads')
        ) {
          return null;
        }
      }
      return event;
    },
    // Breadcrumb filtering (drop noisy console/info logs)
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' && (breadcrumb.level === 'log' || breadcrumb.level === 'debug')) {
        return null;
      }
      if (breadcrumb.category === 'ui.click') {
        // Drop extremely frequent UI click breadcrumbs to reduce noise
        return null;
      }
      return breadcrumb;
    },
    
    // Release information
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    
    // Additional options
    ignoreErrors: [
      // Ignore common browser extension errors
      'Script error.',
      'Non-Error promise rejection captured',
      // Ignore Next.js hydration errors in development
      'Hydration failed',
      'There was an error while hydrating',
      // 외부 SDK / 인앱 브라우저 주입 변수 (Twitter, Facebook 등 in-app webview)
      "Can't find variable: CONFIG",
      'CONFIG is not defined',
      // Google AdSense iframe disposal race (우리가 제어 불가)
      'Accessing domItems after disposal',
      'adsbygoogle.push() error',
      // 사용자가 페이지 이탈/요청 취소 시 발생, 정상 흐름
      'AbortError',
      'The user aborted a request',
      // Supabase realtime 채널 정상 종료
      'Connection closed',
    ],
    maxBreadcrumbs: 30,
  });

  // 래퍼 프레임 위치 확보 (위 probeWrapperFrameLocation 참조). init 이 끝나
  // browserApiErrors 통합이 setTimeout 을 감싼 뒤라야 하므로 여기서 예약한다.
  if (APPLICATION_KEY) {
    setTimeout(probeWrapperFrameLocation, 0);
  }

  if (SENTRY_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('🔧 Sentry 클라이언트 초기화 완료:', process.env.NODE_ENV, {
      tracesSampleRate: TRACES_RATE,
      replaysSessionSampleRate: REPLAY_SESSION_RATE,
      replaysOnErrorSampleRate: REPLAY_ERROR_RATE,
    });
  }
} else {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('ℹ️ Sentry DSN이 설정되지 않아 초기화를 건너뜁니다 (개발 환경)');
  }
}

// Export the required router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart; 