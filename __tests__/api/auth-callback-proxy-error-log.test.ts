import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 실제 로거를 사용해 오류가 콘솔 target(console.error)에 안전하게 기록되는지 본다.
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

    // 오류 처리 리다이렉트도 실패하면 안전 경계가 원본 예외 대신 고정 500을 반환한다.
    const response = await authCallbackProxy(request);
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain(CODE);
    expect(body).not.toContain(STATE);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(output()).toContain('auth.v1.callback');
    expect(output()).not.toContain(CODE);
    expect(output()).not.toContain(STATE);
  });
});
