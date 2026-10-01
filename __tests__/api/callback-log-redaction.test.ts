import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));

import { GET as authCallbackProxy } from '@/app/api/auth/v1/callback/route';
import { GET as portoneCallback } from '@/app/api/payment/portone/callback/route';
import { GET as tossResult } from '@/app/api/payment/toss/result/route';

const CODE = 'cnry-oauth-code-1a2b3c';
const STATE = 'cnry-oauth-state-4d5e6f';
const TOSS_TOKEN = 'cnry-toss-token-7a8b9c';
const PG_TOKEN = 'cnry-pg-token-0d1e2f';
const PAYMENT_ID = 'cnry-payment-3a4b5c';

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

/** 서버 표준 출력(=Vercel 로그)으로 나간 것을 한 문자열로 모은다. */
function captureConsole(): () => string {
  const spies = LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
  return () =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
      .join('\n');
}

const request = (path: string) => new NextRequest(`https://www.picnic.fan${path}`);

describe('콜백 라우트는 URL·쿼리·토큰을 로그에 찍지 않는다', () => {
  let output: () => string;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.picnic.fan');
    output = captureConsole();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('OAuth 콜백 프록시: code 와 state 를 그대로 넘기되 찍지 않는다', async () => {
    const res = await authCallbackProxy(request(`/api/auth/v1/callback?code=${CODE}&state=${STATE}&provider=apple`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/auth/callback/apple?code=${CODE}&state=${STATE}&provider=apple`,
    );
    expect(output()).not.toContain(CODE);
    expect(output()).not.toContain(STATE);
    expect(output()).toBe('');
  });

  it('PortOne 콜백: paymentId 를 넘기되 찍지 않는다', async () => {
    const res = await portoneCallback(request(`/api/payment/portone/callback?paymentId=${PAYMENT_ID}&returnTo=/ko/star-candy`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?paymentId=${PAYMENT_ID}&status=success`,
    );
    expect(output()).toBe('');
  });

  it('PortOne 콜백: 토스 토큰을 넘기되 찍지 않는다', async () => {
    const res = await portoneCallback(request(`/api/payment/portone/callback?token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?toss_token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}&status=processing`,
    );
    expect(output()).toBe('');
  });

  it('PortOne 콜백: 값이 없을 때의 고정 문구 경고는 남는다', async () => {
    const res = await portoneCallback(request('/api/payment/portone/callback?returnTo=/ko/star-candy&x=1'));

    expect(res.headers.get('location')).toBe('https://www.picnic.fan/ko/star-candy');
    expect(output()).toBe('[Callback] No paymentId or token found in callback URL');
  });

  it('토스 결과: 토큰을 넘기되 찍지 않는다', async () => {
    const res = await tossResult(
      request(`/api/payment/toss/result?token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}&payment_method_type=CARD`),
    );

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?toss_token=${TOSS_TOKEN}&status=processing`,
    );
    expect(output()).toBe('');
  });

  it('토스 결과: 토큰이 없을 때의 고정 문구 경고는 남는다', async () => {
    await tossResult(request('/api/payment/toss/result?payment_method_type=CARD'));
    expect(output()).toBe('[Toss Result] No token found in callback URL');
  });
});
