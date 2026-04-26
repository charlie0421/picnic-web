import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const headers = request.headers

  const xff = headers.get('x-forwarded-for') || headers.get('X-Forwarded-For') || ''
  const xRealIp = headers.get('x-real-ip') || headers.get('X-Real-IP') || ''
  const cfConnectingIp = headers.get('cf-connecting-ip') || headers.get('CF-Connecting-IP') || ''
  const vercelCountry = headers.get('x-vercel-ip-country') || ''
  const cfCountry = headers.get('cf-ipcountry') || headers.get('CF-IPCountry') || ''

  // Parse first IP from XFF if present
  let clientIp: string | undefined
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) clientIp = parts[0]
  }
  if (!clientIp) clientIp = xRealIp || cfConnectingIp || (request as any).ip || 'unknown'

  const interestingHeaders: Record<string, string | null> = {
    'x-forwarded-for': headers.get('x-forwarded-for'),
    'x-real-ip': headers.get('x-real-ip'),
    'cf-connecting-ip': headers.get('cf-connecting-ip'),
    'cf-ipcountry': headers.get('cf-ipcountry'),
    'x-vercel-ip-country': headers.get('x-vercel-ip-country'),
    'x-vercel-ip-city': headers.get('x-vercel-ip-city'),
    'x-vercel-ip-country-region': headers.get('x-vercel-ip-country-region'),
    'user-agent': headers.get('user-agent'),
    'accept-language': headers.get('accept-language'),
  }

  return NextResponse.json({
    ok: true,
    method: request.method,
    url: request.url,
    timestamp: new Date().toISOString(),
    clientIp,
    candidates: {
      xForwardedFor: xff,
      xRealIp,
      cfConnectingIp,
      requestIp: (request as any).ip ?? null,
    },
    countryHints: {
      cfIpCountry: cfCountry || null,
      vercelCountry: vercelCountry || null,
    },
    headers: interestingHeaders,
  })
}


