// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/kpop-chart/business/route';

const input = { request_id: '550e8400-e29b-41d4-a716-446655440000', company: '  Picnic  ', email: ' person@example.com ', message: ' Please share your business report. ', locale: 'en', consent: true };
const request = (value: unknown = input, headers: Record<string, string> = {}) => new NextRequest('https://chart.picnic.fan/api/kpop-chart/business', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });

describe('private business intake endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-service-key');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('sends only the trimmed approved fields with private credentials and no caller cookies', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json('accepted'));
    vi.stubGlobal('fetch', fetcher);
    const response = await POST(request(input, { origin: 'https://chart.picnic.fan', cookie: 'secret=caller', authorization: 'Bearer caller' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://db.example.test/rest/v1/rpc/submit_kpop_business_inquiry');
    expect(init.headers).toEqual({ apikey: 'private-service-key', Authorization: 'Bearer private-service-key', 'Content-Type': 'application/json', 'Content-Profile': 'public' });
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body)).toEqual({ p_request_id: input.request_id, p_company: 'Picnic', p_email: 'person@example.com', p_message: 'Please share your business report.', p_locale: 'en', p_consent: true });
  });

  it.each([['rate_limited', 429], ['conflict', 409], ['invalid', 400], ['unexpected', 503], [{ status: 'accepted' }, 503], [null, 503]])('maps RPC result %j to %s', async (result, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await response.json())).not.toContain(input.email.trim());
  });

  it.each([
    { company: '' }, { company: 'a'.repeat(121) }, { email: 'not-an-email' }, { email: 'a'.repeat(245) + '@example.com' },
    { message: 'short' }, { message: 'x'.repeat(3001) }, { consent: false }, { consent: 'true' }, { locale: 'fr' }, { request_id: 'invalid' },
  ])('rejects invalid fields %j before contacting the database', async patch => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ ...input, ...patch }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts maximum lengths counted in Unicode code points', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json('accepted')));
    expect((await POST(request({ ...input, company: ' 🏢'.trim().repeat(120), message: '🎵'.repeat(3000) }))).status).toBe(200);
  });

  it('rejects foreign and opaque origins but accepts a missing origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json('accepted')); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request(input, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(request(input, { origin: 'null' }))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
  });

  it('uses the actual host when Next rewrites its internal URL to localhost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json('accepted')));
    const local = new NextRequest('http://localhost:48717/api/kpop-chart/business', { method: 'POST', headers: { host: '127.0.0.1:48717', origin: 'http://127.0.0.1:48717', 'content-type': 'application/json' }, body: JSON.stringify(input) });
    expect((await POST(local)).status).toBe(200);
    const production = new NextRequest('http://localhost/api/kpop-chart/business', { method: 'POST', headers: { host: 'chart.picnic.fan', 'x-forwarded-proto': 'https', origin: 'https://chart.picnic.fan', 'content-type': 'application/json' }, body: JSON.stringify(input) });
    expect((await POST(production)).status).toBe(200);
    expect((await POST(request(input, { host: 'chart.picnic.fan', origin: 'https://chart.picnic.fan:444' }))).status).toBe(403);
  });

  it('limits both declared and streamed body bytes before parsing JSON', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request(input, { 'content-length': '999999' }))).status).toBe(413);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('{"message":"' + 'x'.repeat(20000))); controller.enqueue(encoder.encode('x'.repeat(20000))); controller.close(); } });
    const streamed = new NextRequest('https://chart.picnic.fan/api/kpop-chart/business', { method: 'POST', body: stream, headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit);
    expect((await POST(streamed)).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns sanitized failures for malformed JSON and unavailable configuration or upstream', async () => {
    const malformed = new NextRequest('https://chart.picnic.fan/api/kpop-chart/business', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } });
    expect((await POST(malformed)).status).toBe(400);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret database details')));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect((await POST(request())).status).toBe(503);
  });
});
