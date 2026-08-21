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
});
