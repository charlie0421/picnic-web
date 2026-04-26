import { NextRequest, NextResponse } from 'next/server';

/**
 * 이미지 프록시 API
 * Google 이미지 429 에러를 우회하기 위해 서버에서 이미지를 프록시합니다.
 *
 * SECURITY: redirect는 수동으로 처리하여 SSRF를 차단합니다. 자동 redirect를
 * 허용하면 허용 도메인이 169.254.169.254 (cloud metadata)나 internal address로
 * 302 응답을 줄 때 서버가 그대로 따라가 내부 네트워크를 노출하게 됩니다.
 * CORS는 원본 와일드카드(*) 대신 자체 origin 화이트리스트로 echo합니다.
 */

const ALLOWED_DOMAINS_BASE = [
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'graph.facebook.com',
  'pbs.twimg.com',
  'cdn.discordapp.com',
  'avatars.githubusercontent.com',
];

const SUPABASE_WILDCARD_SUFFIXES = ['.supabase.co', '.supabase.in'];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_DEPTH = 1;

function buildAllowedDomains(): string[] {
  const list = [...ALLOWED_DOMAINS_BASE];
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (supabaseUrl) list.push(new URL(supabaseUrl).host);
  } catch {
    // ignore — env may be malformed in some contexts
  }
  return list;
}

function isHostAllowed(hostname: string, allowedDomains: string[]): boolean {
  return (
    allowedDomains.some(
      (d) => hostname === d || hostname.endsWith('.' + d),
    ) ||
    SUPABASE_WILDCARD_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function getAllowedOrigins(): string[] {
  const list: string[] = [];
  for (const env of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.BASE_URL,
    process.env.NEXT_PUBLIC_STAGING_URL,
  ]) {
    if (typeof env === 'string' && env) {
      try {
        list.push(new URL(env).origin);
      } catch {
        // skip invalid
      }
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    list.push('http://localhost:3000', 'http://localhost:3100');
  }
  if (list.length === 0) list.push('https://www.picnic.fan');
  return Array.from(new Set(list));
}

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (requestOrigin && getAllowedOrigins().includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }
  return headers;
}

async function fetchWithRedirectGuard(
  initialUrl: string,
  allowedDomains: string[],
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let depth = 0; depth <= MAX_REDIRECT_DEPTH; depth++) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PicnicBot/1.0)',
        Accept: 'image/*',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new Error('invalid redirect target');
      }
      if (!isHostAllowed(nextUrl.hostname, allowedDomains)) {
        throw new Error('redirect target not in allowlist');
      }
      currentUrl = nextUrl.toString();
      continue;
    }

    return response;
  }
  throw new Error('redirect depth exceeded');
}

export async function GET(request: NextRequest) {
  const requestOrigin = request.headers.get('origin');
  const cors = corsHeaders(requestOrigin);

  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'invalid request' }, { status: 400, headers: cors });
    }

    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'invalid request' }, { status: 400, headers: cors });
    }

    const allowedDomains = buildAllowedDomains();
    if (!isHostAllowed(parsed.hostname, allowedDomains)) {
      return NextResponse.json({ error: 'host not allowed' }, { status: 403, headers: cors });
    }

    const response = await fetchWithRedirectGuard(imageUrl, allowedDomains);

    if (!response.ok) {
      console.warn(
        `🖼️ [ImageProxy] fetch failed: ${response.status} ${response.statusText}`,
      );
      if (response.status === 429) {
        return NextResponse.json(
          {
            error: 'Too Many Requests',
            message: '이미지 서버에서 요청 제한이 발생했습니다.',
            retryAfter: response.headers.get('Retry-After') || '300',
          },
          { status: 429, headers: cors },
        );
      }
      return NextResponse.json({ error: 'fetch failed' }, { status: response.status, headers: cors });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('🖼️ [ImageProxy] proxy error:', error);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504, headers: cors });
    }
    return NextResponse.json({ error: 'fetch failed' }, { status: 500, headers: cors });
  }
}

export async function OPTIONS(request: NextRequest) {
  const requestOrigin = request.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(requestOrigin),
  });
}
