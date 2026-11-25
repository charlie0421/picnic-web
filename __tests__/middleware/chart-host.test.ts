import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function request(path: string, method = 'GET') {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: { host: 'chart.picnic.fan', 'accept-language': 'ko' }, method,
  });
}

describe('chart hostname', () => {
  it('keeps query and the public host when the upstream URL is internal', async () => {
    const res = await middleware(request('/?country=ID'));
    expect(res.headers.get('location')).toBe('https://chart.picnic.fan/ko/charts?country=ID');
  });
  it.each(['/ko/charts', '/id/charts/business'])('passes public %s without refreshing auth', async path => {
    const res = await middleware(request(path));
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.has('set-cookie')).toBe(false);
  });
  it.each(['/ko/mypage', '/auth/callback?code=demo', '/en/vote'])('opens %s on the main site', async path => {
    const res = await middleware(request(path));
    expect(res.headers.get('location')).toBe('https://www.picnic.fan' + path);
  });
  it('does not relay a non-chart POST body to the main site', async () => {
    const res = await middleware(request('/ko/mypage', 'POST'));
    expect(res.status).toBe(405);
    expect(res.headers.has('location')).toBe(false);
  });
});
