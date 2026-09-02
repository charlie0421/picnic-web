/**
 * instrumentation-client.ts — 서드파티 스택 필터 동작 테스트.
 *
 * PICNIC-WEB-6R (155건) 은 브라우저 확장/광고 CMP 가 주입한 `executors/200.js`
 * 에서 났는데, 기존 isThirdPartyAd 는 광고사 도메인명만 매칭해 통과시켰다.
 * 여기서는 Sentry 공식 thirdPartyErrorFilterIntegration 을 실제 코드로 돌려
 * 실제 이벤트 페이로드가 어떻게 분류되는지 고정한다.
 *
 * 프레임의 module_metadata 는 런타임에 SDK 가 `applyFrameMetadata` 훅에서
 * 채우는 값이다. 그 훅은 번들러 플러그인이 주입한 전역에 의존하므로 여기서는
 * 훅 결과(우리 청크 프레임에만 앱 키가 붙은 상태)를 직접 만들어 넣는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ErrorEvent, Integration, StackFrame } from '@sentry/core';

const init = vi.fn();
/**
 * 래퍼 프레임 프로브가 쓰는 stackParser 스텁. 프로브는 setTimeout 콜백 안에서
 * `new Error().stack` 을 파싱하는데, 실제 브라우저에선 Sentry 가 타이머 콜백을
 * sentryWrapped 로 감싸므로 최외곽 프레임이 래퍼다. 여기서는 그 결과를 흉내낸다.
 */
const stackParser = vi.fn<(stack: string) => StackFrame[]>();

vi.mock('@sentry/nextjs', async () => {
  const core = await vi.importActual<typeof import('@sentry/core')>('@sentry/core');
  return {
    init: (...args: unknown[]) => init(...args),
    getClient: () => ({ getOptions: () => ({ stackParser }) }),
    replayIntegration: () => ({ name: 'Replay' }),
    browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
    thirdPartyErrorFilterIntegration: core.thirdPartyErrorFilterIntegration,
    captureRouterTransitionStart: vi.fn(),
  };
});

const APP_KEY = 'picnic-web';
const OUR_METADATA = { [`_sentryBundlerPluginAppKey:${APP_KEY}`]: true };

/** 우리 번들 청크에서 난 프레임 (SDK 가 앱 키 메타데이터를 붙인 상태). */
const ourFrame = (over: Partial<StackFrame> = {}): StackFrame => ({
  filename: 'https://www.picnic.fan/_next/static/chunks/4bd1b696-7d5c0a1e2f3a4b5c.js',
  function: 'r',
  lineno: 1,
  colno: 5120,
  module_metadata: OUR_METADATA,
  ...over,
});

/**
 * Sentry SDK 가 번들된 청크 안의 sentryWrapped 호출 지점. 프로브가 파싱하는
 * raw 프레임은 origin 이 붙은 URL 이고, 이벤트 프레임은 Next SDK 가
 * `app:///_next/...` 로 재작성한 뒤 beforeSend 에 도착한다. 행·열은 같다.
 */
const WRAPPER_RAW = {
  filename: 'https://www.picnic.fan/_next/static/chunks/9a1c2e3f-sentry.js',
  function: 'r',
  lineno: 1,
  colno: 48213,
};
const wrapperFrame = (over: Partial<StackFrame> = {}): StackFrame =>
  ourFrame({ ...WRAPPER_RAW, filename: 'app:///_next/static/chunks/9a1c2e3f-sentry.js', ...over });

/** 프로브 스택: [sentryWrapped, 프로브 함수]. */
const probeFrames = (): StackFrame[] => [
  { ...WRAPPER_RAW },
  { filename: 'https://www.picnic.fan/_next/static/chunks/main-app.js', function: 'probeWrapperFrameSignature', lineno: 1, colno: 777 },
];

/** 외부(확장/주입 스크립트) 프레임. 메타데이터 없음. */
const externalFrame = (over: Partial<StackFrame> = {}): StackFrame => ({
  filename: 'app:///executors/200.js',
  function: 'Z',
  ...over,
});

const errorEvent = (frames: StackFrame[] | undefined, over: Partial<ErrorEvent> = {}): ErrorEvent => ({
  exception: {
    values: [
      {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'M_ID')",
        mechanism: { type: 'onunhandledrejection', handled: false },
        ...(frames ? { stacktrace: { frames } } : {}),
      },
    ],
  },
  ...over,
});

type InitOptions = {
  integrations: Integration[];
  beforeSend: (event: ErrorEvent, hint: Record<string, never>) => ErrorEvent | null;
};

async function loadClient(env: Record<string, string | undefined>, { awaitProbe = true } = {}) {
  vi.resetModules();
  init.mockClear();
  stackParser.mockReset();
  stackParser.mockReturnValue(probeFrames());
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
  vi.stubEnv('NODE_ENV', 'production');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);

  await import('@/instrumentation-client');
  // 래퍼 프레임 프로브는 setTimeout(…, 0) 콜백에서 돈다.
  if (awaitProbe) await new Promise((r) => setTimeout(r, 0));

  expect(init).toHaveBeenCalledTimes(1);
  const options = init.mock.calls[0][0] as InitOptions;
  const filter = options.integrations.find((i) => i.name === 'ThirdPartyErrorsFilter');
  return { options, filter };
}

/** SDK 파이프라인 순서 그대로: 통합의 processEvent → 사용자 beforeSend. */
function runPipeline(client: Awaited<ReturnType<typeof loadClient>>, event: ErrorEvent) {
  const afterIntegration = client.filter?.processEvent
    ? (client.filter.processEvent(event, {}, {} as never) as ErrorEvent | null)
    : event;
  if (!afterIntegration) return null;
  return client.options.beforeSend(afterIntegration, {});
}

describe('instrumentation-client — 서드파티 스택 필터', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('앱 키가 있는 빌드 (번들러 플러그인이 메타데이터를 주입한 경우)', () => {
    const env = { NEXT_PUBLIC_SENTRY_APPLICATION_KEY: APP_KEY };

    it('thirdPartyErrorFilterIntegration 을 등록한다', async () => {
      const { filter } = await loadClient(env);
      expect(filter).toBeDefined();
    });

    it('PICNIC-WEB-6R: 모든 프레임이 외부 스크립트면 드롭한다', async () => {
      const client = await loadClient(env);
      // 실제 6R 최신 이벤트의 프레임 구성 그대로 (executors/200.js 2개).
      const event = errorEvent([externalFrame({ function: 'f' }), externalFrame({ function: 'Z' })]);

      expect(runPipeline(client, event)).toBeNull();
    });

    it('우리 번들 프레임이 안쪽에 섞여 있으면 유지한다', async () => {
      // 최외곽 하나만 우리 것인 형태는 래퍼 보정(아래 describe) 대상이므로 제외.
      const client = await loadClient(env);
      const shapes = [
        [ourFrame({ function: 'r' }), externalFrame(), ourFrame({ function: 'o' })],
        [externalFrame(), ourFrame({ function: 'o' })],
      ];

      for (const frames of shapes) {
        const result = runPipeline(client, errorEvent(frames));
        expect(result, frames.map((f) => f.filename).join(' > ')).not.toBeNull();
        expect(result?.tags?.third_party_code).toBeUndefined();
      }
    });

    it('우리 번들 프레임만 있으면 유지한다', async () => {
      const client = await loadClient(env);
      const event = errorEvent([ourFrame(), ourFrame({ function: 'onClick' })]);

      expect(runPipeline(client, event)).not.toBeNull();
    });

    it('프레임이 하나도 없는 이벤트는 드롭하지 않는다 (PICNIC-WEB-5Y 류)', async () => {
      // 통합은 "파일명 있는 프레임이 0개" 를 "전부 외부" 로 판정한다 ([].every === true).
      // 스택이 비는 건 외부 코드라는 증거가 아니므로 이 경우엔 통과시켜야 한다.
      const client = await loadClient(env);
      const withoutStack = errorEvent(undefined, {
        exception: {
          values: [{ type: 'Error', value: 'UnknownError: Database deleted by request of the user' }],
        },
      });
      const withEmptyFrames = errorEvent([]);
      const withNamelessFrames = errorEvent([{ function: 'anonymous' }]);

      for (const event of [withoutStack, withEmptyFrames, withNamelessFrames]) {
        const result = runPipeline(client, event);
        expect(result, JSON.stringify(event.exception)).not.toBeNull();
        expect(result?.tags?.third_party_code).toBeUndefined();
      }
    });

    describe('Sentry SDK 래퍼 프레임 보정 (PICNIC-WEB-6S, getsentry/sentry-javascript#13835)', () => {
      // v9 helpers.js 의 sentryWrapped 는 페이지의 모든 timer/event/XHR 핸들러를
      // 감싸므로 외부 콜백의 최외곽 JS 프레임이 우리 청크(앱 키 있음)가 된다.
      // 통합은 그 한 프레임 때문에 "전부 외부" 판정을 못 내린다. 부팅 직후
      // 타이머 콜백에서 스택을 떠 래퍼 프레임의 위치(파일·행·열)를 확보하고,
      // 최외곽 프레임이 정확히 그 위치일 때만 래퍼로 본다. 함수명은 축약돼
      // 우리 코드의 `r` 과 구분되지 않으므로 쓰지 않는다.

      it('부팅 후 타이머 콜백에서 스택을 파싱해 래퍼 위치를 확보한다', async () => {
        await loadClient(env);

        expect(stackParser).toHaveBeenCalledTimes(1);
        expect(stackParser.mock.calls[0][0]).toContain('Error');
      });

      it('PICNIC-WEB-6S: 최외곽 래퍼 프레임 하나만 우리 것이고 나머지가 전부 외부면 드롭한다', async () => {
        const client = await loadClient(env);
        // 실제 6S 최신 이벤트의 프레임 구성 그대로.
        const event = errorEvent([
          wrapperFrame({ function: 'r' }), // @sentry/browser helpers.js (minified)
          externalFrame({ function: 'XMLHttpRequest.onreadystatechange' }),
          externalFrame({ function: 'Z' }),
        ]);

        expect(runPipeline(client, event)).toBeNull();
      });

      it('우리 축약 함수 `r` 이 외부 SDK 를 직접 호출하다 난 에러는 유지한다', async () => {
        // 래퍼와 같은 청크·같은 함수명이어도 행·열이 다르면 우리 코드다.
        const client = await loadClient(env);
        const event = errorEvent([
          ourFrame({ function: 'r', filename: wrapperFrame().filename, colno: WRAPPER_RAW.colno + 900 }),
          externalFrame(),
        ]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('이름 없는 최상위 모듈 프레임 `?` 이 외부 SDK 를 호출하다 난 에러는 유지한다', async () => {
        const client = await loadClient(env);
        const event = errorEvent([ourFrame({ function: '?' }), externalFrame()]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('우리 프레임이 둘 이상이면 래퍼 보정을 적용하지 않는다', async () => {
        // [래퍼, 우리 핸들러, 외부 SDK] — 우리 코드가 외부 SDK 를 호출하다 난 에러.
        const client = await loadClient(env);
        const event = errorEvent([wrapperFrame(), ourFrame({ function: 'o' }), externalFrame()]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('래퍼 위치 프레임이 최외곽이 아니면 래퍼 보정을 적용하지 않는다', async () => {
        const client = await loadClient(env);
        const event = errorEvent([externalFrame(), wrapperFrame()]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('프로브가 아직 돌기 전이면 보정하지 않는다 (안전한 기본값은 유지)', async () => {
        const client = await loadClient(env, { awaitProbe: false });
        const event = errorEvent([wrapperFrame(), externalFrame()]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('열 번호가 없는 스택(Gecko eval·WinJS 등)에서는 보정하지 않는다', async () => {
        // 프로브·이벤트 양쪽에 colno 가 없으면 undefined === undefined 로 같은 파일
        // 1행의 우리 프레임이 전부 래퍼와 "일치" 한다 (교차 리뷰 3라운드 지적).
        const noColProbe = probeFrames().map((f) => ({ ...f, colno: undefined }));
        vi.resetModules();
        init.mockClear();
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_SENTRY_APPLICATION_KEY', APP_KEY);
        stackParser.mockReset();
        stackParser.mockReturnValue(noColProbe);
        await import('@/instrumentation-client');
        await new Promise((r) => setTimeout(r, 0));
        const options = init.mock.calls[0][0] as InitOptions;
        const filter = options.integrations.find((i) => i.name === 'ThirdPartyErrorsFilter');

        // 우리 코드가 외부 SDK 를 호출하다 난 에러 — 같은 청크 1행, colno 없음.
        const event = errorEvent([wrapperFrame({ function: 'o', colno: undefined }), externalFrame()]);
        expect(runPipeline({ options, filter }, event)).not.toBeNull();
      });

      it('이벤트 프레임에만 열 번호가 없으면 보정하지 않는다', async () => {
        const client = await loadClient(env);
        const event = errorEvent([wrapperFrame({ colno: undefined }), externalFrame()]);

        expect(runPipeline(client, event)).not.toBeNull();
      });

      it('프로브 스택에 래퍼 프레임이 없으면(프레임 1개 이하) 보정하지 않는다', async () => {
        stackParser.mockReturnValue(probeFrames().slice(1));
        // loadClient 가 기본 프로브 프레임을 다시 넣으므로 import 뒤에 덮어쓴다.
        vi.resetModules();
        init.mockClear();
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_SENTRY_APPLICATION_KEY', APP_KEY);
        stackParser.mockReset();
        stackParser.mockReturnValue(probeFrames().slice(1));
        await import('@/instrumentation-client');
        await new Promise((r) => setTimeout(r, 0));
        const options = init.mock.calls[0][0] as InitOptions;
        const filter = options.integrations.find((i) => i.name === 'ThirdPartyErrorsFilter');

        const event = errorEvent([wrapperFrame(), externalFrame()]);
        expect(runPipeline({ options, filter }, event)).not.toBeNull();
      });

      it('exception 값이 둘 이상(체인)이면 래퍼 보정을 적용하지 않는다', async () => {
        const client = await loadClient(env);
        const event: ErrorEvent = {
          exception: {
            values: [
              { type: 'Error', value: 'outer', stacktrace: { frames: [ourFrame({ function: 'r' }), externalFrame()] } },
              { type: 'TypeError', value: 'inner', stacktrace: { frames: [externalFrame()] } },
            ],
          },
        };

        expect(runPipeline(client, event)).not.toBeNull();
      });
    });
  });

  describe('앱 키가 없는 빌드 (로컬 빌드 등 플러그인이 꺼진 경우)', () => {
    const env = { NEXT_PUBLIC_SENTRY_APPLICATION_KEY: undefined };

    it('통합을 등록하지 않는다 — 메타데이터가 없으면 모든 이벤트가 외부로 보인다', async () => {
      const { filter } = await loadClient(env);
      expect(filter).toBeUndefined();
    });

    it('메타데이터 없는 이벤트도 그대로 통과한다', async () => {
      const client = await loadClient(env);
      const event = errorEvent([ourFrame({ module_metadata: undefined })]);

      expect(runPipeline(client, event)).not.toBeNull();
    });
  });
});
