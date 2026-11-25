import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { parseBusinessInquiry } from '@/lib/charts/business';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 32768;
const reply = (status: string, code: number) => NextResponse.json({ status }, { status: code, headers });

// Count bytes as they arrive. Content-Length alone does not bound chunked requests.
async function readBody(request: NextRequest): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); return null; }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin !== null) {
    // Next may replace the URL hostname with localhost. Host preserves the public authority.
    const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.slice(0, -1);
    const host = request.headers.get('host') ?? request.nextUrl.host;
    if (!['http', 'https'].includes(protocol) || !host || /[\s,/@\\?#]/.test(host)) return reply('forbidden', 403);
    try {
      if (origin !== new URL(`${protocol}://${host}`).origin) return reply('forbidden', 403);
    } catch { return reply('forbidden', 403); }
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply('invalid', 415);
  let inquiry;
  try {
    const body = await readBody(request);
    if (body === null) return reply('too_large', 413);
    inquiry = parseBusinessInquiry(JSON.parse(body));
  } catch { return reply('invalid', 400); }
  if (!inquiry) return reply('invalid', 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply('unavailable', 503);
  try {
    // This private RPC never inherits cookies, authorization, or other caller headers.
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/submit_kpop_business_inquiry`, {
      method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'public' },
      body: JSON.stringify({ p_request_id: inquiry.request_id, p_company: inquiry.company, p_email: inquiry.email, p_message: inquiry.message, p_locale: inquiry.locale, p_consent: inquiry.consent }),
    });
    if (!response.ok) return reply('unavailable', 503);
    const result: unknown = await response.json();
    if (result === 'accepted') return reply('accepted', 200);
    if (result === 'rate_limited') return reply('rate_limited', 429);
    if (result === 'conflict') return reply('conflict', 409);
    if (result === 'invalid') return reply('invalid', 400);
    return reply('unavailable', 503);
  } catch { return reply('unavailable', 503); }
}
