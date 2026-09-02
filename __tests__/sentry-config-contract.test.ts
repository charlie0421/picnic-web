/**
 * Sentry 설정 계약 테스트.
 *
 * 설정 파일은 빌드·타입·기존 테스트로 검증되지 않는 사각지대다.
 * 교차 리뷰에서 이 사각지대로 결함 3건이 통과한 뒤 추가했다.
 * 소스를 문자열이 아니라 구조로 읽어 계약 위반을 잡는다.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Sentry 설정 계약', () => {
  describe('instrumentation.ts — Next 요청 오류 훅', () => {
    it('onRequestError 를 직접 구현하지 않고 SDK 헬퍼에 위임한다', () => {
      const src = read('instrumentation.ts');
      // Next 의 계약은 (error, request, context) 3개 위치 인자다.
      // 첫 인자를 구조분해하면 실제 Error 대신 undefined 가 캡처된다.
      expect(src).toContain('Sentry.captureRequestError');
      expect(src).not.toMatch(/onRequestError\s*\(\s*\{/);
    });

    it('request.headers 를 Headers 인 것처럼 다루지 않는다', () => {
      // Next 가 넘기는 headers 는 NodeJS.Dict 다. .entries() 는 throw 한다.
      expect(read('instrumentation.ts')).not.toContain('headers.entries()');
    });
  });

  describe('instrumentation-client.ts — Session Replay 개인정보', () => {
    it('DOM 텍스트를 마스킹한다', () => {
      const src = read('instrumentation-client.ts');
      expect(src).not.toMatch(/maskAllText:\s*false/);
      expect(src).toMatch(/maskAllText:\s*true/);
    });

    it('입력값을 마스킹한다', () => {
      expect(read('instrumentation-client.ts')).not.toMatch(/maskAllInputs:\s*false/);
    });
  });

  describe('sentry.server.config.js — httpIntegration 옵션 위치', () => {
    it('ignore 필터를 tracing 하위에 두지 않는다', () => {
      const src = read('sentry.server.config.js');
      // HttpOptions 는 두 필터를 최상위로 요구한다.
      // tracing 하위에 두면 SDK 가 읽지 않아 필터가 무시된다.
      const tracingBlock = src.match(/tracing:\s*\{[\s\S]*?\n\s{8}\}/);
      if (tracingBlock) {
        expect(tracingBlock[0]).not.toContain('ignoreIncomingRequests');
        expect(tracingBlock[0]).not.toContain('ignoreOutgoingRequests');
      }
      expect(src).toMatch(/^\s{8}ignoreIncomingRequests:/m);
    });
  });

  describe('무효 옵션 재발 방지', () => {
    it('Sentry.init 이 무시하는 옵션을 쓰지 않는다', () => {
      const configs = ['sentry.server.config.js', 'sentry.edge.config.js', 'instrumentation-client.ts'];
      for (const f of configs) {
        const src = read(f);
        // tags 는 init 옵션이 아니다. initialScope.tags 를 써야 한다.
        expect(src, `${f}: 최상위 tags 는 무시된다`).not.toMatch(/^\s{4}tags:\s*\{/m);
        expect(src, `${f}: 존재하지 않는 옵션`).not.toContain('captureUnhandledRejections');
        // v9 에 없는 API. 호출하면 서버 부팅이 실패한다.
        expect(src, `${f}: v9 에 없는 API`).not.toContain('nodeProfilingIntegration');
      }
    });
  });

  describe('서드파티 스택 필터 — 앱 키 계약 (next.config.js ↔ instrumentation-client.ts)', () => {
    const nextConfig = read('next.config.js');
    const client = read('instrumentation-client.ts');

    it('앱 키를 플러그인 옵션으로 전달한다', () => {
      // withSentryConfig 최상위엔 applicationKey 옵션이 없다. 플러그인 옵션으로만
      // 들어가며, 그래야 청크에 `_sentryBundlerPluginAppKey:<key>` 가 심긴다.
      expect(nextConfig).toMatch(
        /unstable_sentryWebpackPluginOptions:\s*\{[^}]*applicationKey:\s*SENTRY_APPLICATION_KEY/,
      );
    });

    it('이 SDK 버전의 플러그인 옵션 조립기가 applicationKey 를 실제로 통과시킨다', async () => {
      // 내부 경로라 SDK 업그레이드 때 깨질 수 있다. 깨지면 applicationKey 전달
      // 방식이 바뀐 것이므로 next.config.js 를 같이 고쳐야 한다.
      // 패키지 exports 가 subpath 를 막으므로 파일 경로로 직접 읽는다.
      const { createRequire } = await import('module');
      const { getWebpackPluginOptions } = createRequire(import.meta.url)(
        path.join(root, 'node_modules/@sentry/nextjs/build/cjs/config/webpackPluginOptions.js'),
      );
      const opts = getWebpackPluginOptions(
        { isServer: false, config: {}, dir: root, nextRuntime: undefined },
        { unstable_sentryWebpackPluginOptions: { applicationKey: 'picnic-web' } },
        undefined,
      );
      expect(opts.applicationKey).toBe('picnic-web');
    });

    it('앱 키 노출과 플러그인 활성화가 같은 조건을 쓴다', () => {
      // 플러그인이 꺼진 빌드(메타데이터 없음)에 키가 노출되면 클라이언트가
      // 통합을 켜고, 모든 프레임을 외부로 봐서 이벤트 전부가 드롭된다.
      // 비활성 분기는 undefined 가 아니라 빈 문자열이어야 한다: Next 의
      // getNextConfigEnv 는 null/undefined 항목을 건너뛰어(lib/static-env.js)
      // 셸·Vercel 에 잔존하는 raw NEXT_PUBLIC_SENTRY_APPLICATION_KEY 가 그대로
      // 인라인된다. 빈 문자열은 raw 값을 덮는다.
      expect(nextConfig).toMatch(
        /NEXT_PUBLIC_SENTRY_APPLICATION_KEY:\s*sentryPluginEnabled\s*\?\s*SENTRY_APPLICATION_KEY\s*:\s*''/,
      );
      expect(nextConfig).toMatch(/disableClientWebpackPlugin:\s*!sentryPluginEnabled/);
    });

    it('클라이언트가 읽는 앱 키 메타데이터 접두어가 SDK 소스와 일치한다', () => {
      // 래퍼 프레임 보정은 frame.module_metadata 의 키를 직접 읽는다. 접두어는
      // @sentry/core 내부 상수라 업그레이드 때 바뀔 수 있다.
      const core = read('node_modules/@sentry/core/build/esm/integrations/third-party-errors-filter.js');
      const m = core.match(/BUNDLER_PLUGIN_APP_KEY_PREFIX = '([^']+)'/);
      expect(m?.[1]).toBeDefined();
      expect(client).toContain(`'${m?.[1]}'`);
    });

    it('클라이언트는 키를 하드코딩하지 않고 빌드가 노출한 값을 읽는다', () => {
      expect(client).toContain('process.env.NEXT_PUBLIC_SENTRY_APPLICATION_KEY');
      expect(client).not.toMatch(/filterKeys:\s*\[\s*['"]/);
    });

    it('통합은 드롭 모드가 아니라 태그 모드로 등록한다', () => {
      // 드롭 모드는 프레임 0개 이벤트까지 버린다. 드롭은 beforeSend 가 프레임
      // 존재를 확인한 뒤 한다 (instrumentation-client-third-party-filter.test.ts).
      expect(client).toContain("behaviour: 'apply-tag-if-exclusively-contains-third-party-frames'");
      expect(client).not.toMatch(/behaviour:\s*'drop-/);
    });
  });
});
