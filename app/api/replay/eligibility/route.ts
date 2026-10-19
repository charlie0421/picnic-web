import { NextRequest, NextResponse } from 'next/server';
import { onlyPublicPreferenceCookies } from '@/lib/sentry/replay/public-cookies';
import { localReplayConfig } from '@/lib/sentry/replay/config';
import { readDiagnosticBuild } from '@/lib/sentry/replay/diagnostic-build';
import { parseDiagnosticDisclosure } from '@/lib/sentry/replay/diagnostic-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const unavailable = () => new NextResponse(null, { status: 404, headers });

/** Local synthetic harness only. The server also sees cookies hidden from document.cookie. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.has('mode')) {
    if (url.origin !== 'https://www.picnic.fan' || url.search !== '?mode=diagnostic' || process.env.REPLAY_DIAGNOSTIC_ENABLED !== '1') return unavailable();
    let disclosure;
    try { disclosure = parseDiagnosticDisclosure(JSON.parse(process.env.REPLAY_DIAGNOSTIC_DISCLOSURE_JSON ?? '')); } catch { return unavailable(); }
    if (!disclosure) return unavailable();
    const proof = await readDiagnosticBuild();
    if (!proof) return unavailable();
    if (!onlyPublicPreferenceCookies(request.headers.get('cookie')) || request.headers.has('authorization')) return new NextResponse(null, { status: 403, headers });
    return NextResponse.json({ allowed: true, manifestSha256: proof.manifestSha256, disclosure }, { headers });
  }
  // NextURL normalizes 127.0.0.1 to localhost. Preserve the request's actual Host header.
  if (url.search || !localReplayConfig({ origin: request.nextUrl.protocol + '//' + request.headers.get('host') })) return unavailable();
  const anonymous = onlyPublicPreferenceCookies(request.headers.get('cookie')) && !request.headers.has('authorization');
  return NextResponse.json({ anonymous }, { headers: { 'Cache-Control': 'no-store' } });
}
