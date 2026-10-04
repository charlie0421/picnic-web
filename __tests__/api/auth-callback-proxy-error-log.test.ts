import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// logError 를 mock 하지 않는다. 오류 메시지가 실제 콘솔 target(console.error)까지 가는지를 본다.
// 운영 빌드도 console.error 는 지우지 않는다(next.config.js 의 compiler.removeConsole).
import { GET as authCallbackProxy } from '@/app/api/auth/v1/callback/route';

const CODE = 'cnry-oauth-code-9f8e7d';
const STATE = 'cnry-oauth-state-6c5b4a';
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

describe('OAuth 콜백 프록시 — 리다이렉트가 실패해도 code 를 로그에 남기지 않는다', () => {
  let output: () => string;

  beforeEach(() => {
    const spies = LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    output = () =>
      spies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
        .join('\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('사이트 주소 설정이 잘못돼 리다이렉트 주소를 만들지 못하면, 그 주소(code 포함)를 찍지 않는다', async () => {
    // 상대 주소는 NextResponse.redirect 가 거부한다. 거부 오류의 메시지에 주소 전체가 들어간다.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '/bad');
    const request = new NextRequest(`https://www.picnic.fan/api/auth/v1/callback?code=${CODE}&state=${STATE}`);

    // 오류 처리의 리다이렉트도 같은 잘못된 주소로 만들어 실패한다(설정 오류는 요청 실패로 드러난다).
    await expect(authCallbackProxy(request)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(output()).toContain('OAuth 콜백 프록시 오류');
    expect(output()).not.toContain(CODE);
    expect(output()).not.toContain(STATE);
  });
});
