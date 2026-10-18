import { NextRequest, NextResponse } from 'next/server';
import { onlyPublicPreferenceCookies } from '@/lib/sentry/replay/public-cookies';
import { localReplayConfig } from '@/lib/sentry/replay/config';

/** Local synthetic harness only. The server also sees cookies hidden from document.cookie. */
export async function GET(request: NextRequest) {
  // NextURL normalizes 127.0.0.1 to localhost. Preserve the request's actual Host header.
  if (!localReplayConfig({ origin: request.nextUrl.protocol + '//' + request.headers.get('host') })) return new NextResponse(null, { status: 404 });
  const anonymous = onlyPublicPreferenceCookies(request.headers.get('cookie')) && !request.headers.has('authorization');
  return NextResponse.json({ anonymous }, { headers: { 'Cache-Control': 'no-store' } });
}
