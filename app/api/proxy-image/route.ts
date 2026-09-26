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
  'graph.facebook.com',
  'pbs.twimg.com',
  'cdn.discordapp.com',
  'avatars.githubusercontent.com',
];
const ALLOWED_HOST_PATTERNS = [/^lh\d+\.googleusercontent\.com$/];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_DEPTH = 1;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DECLARED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

type AllowedImageType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif';

class ImageProxyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ImageProxyError';
  }
}

function buildAllowedDomains(): string[] {
  const list = [...ALLOWED_DOMAINS_BASE];
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol === 'https:') list.push(parsed.hostname);
    }
  } catch {
    // ignore — env may be malformed in some contexts
  }
  return Array.from(new Set(list.map((domain) => domain.toLowerCase())));
}

function isHostAllowed(hostname: string, allowedDomains: string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    allowedDomains.includes(normalizedHostname) ||
    ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(normalizedHostname))
  );
}

function assertAllowedUpstreamUrl(
  url: URL,
  allowedDomains: string[],
  invalidProtocolStatus: number,
) {
  if (url.protocol !== 'https:') {
    throw new ImageProxyError(
      'upstream protocol is not allowed',
      invalidProtocolStatus,
    );
  }
  if (!isHostAllowed(url.hostname, allowedDomains)) {
    throw new ImageProxyError('upstream host is not allowed', 403);
  }
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
        throw new ImageProxyError('invalid redirect target', 403);
      }
      assertAllowedUpstreamUrl(nextUrl, allowedDomains, 403);
      currentUrl = nextUrl.toString();
      continue;
    }

    return response;
  }
  throw new ImageProxyError('redirect depth exceeded', 502);
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function ftypBrands(bytes: Uint8Array): string[] {
  if (asciiAt(bytes, 4, 4) !== 'ftyp') return [];

  const declaredBoxSize =
    ((bytes[0] ?? 0) * 0x1000000 +
      (bytes[1] ?? 0) * 0x10000 +
      (bytes[2] ?? 0) * 0x100 +
      (bytes[3] ?? 0)) >>>
    0;
  const boxEnd = Math.min(
    bytes.length,
    declaredBoxSize >= 16 ? declaredBoxSize : 64,
    64,
  );
  const brands = [asciiAt(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(asciiAt(bytes, offset, 4));
  }
  return brands;
}

function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWithBytes(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return 'image/png';
  }
  if (
    asciiAt(bytes, 0, 6) === 'GIF87a' ||
    asciiAt(bytes, 0, 6) === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (
    asciiAt(bytes, 0, 4) === 'RIFF' &&
    asciiAt(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    ftypBrands(bytes).some((brand) => ['avif', 'avis'].includes(brand))
  ) {
    return 'image/avif';
  }
  return null;
}

async function readBodyWithLimit(
  response: Response,
): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > MAX_IMAGE_BYTES
    ) {
      throw new ImageProxyError('upstream image is too large', 413);
    }
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageProxyError('upstream image is too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
    if (parsed.protocol !== 'https:') {
      return NextResponse.json(
        { error: 'protocol not allowed' },
        { status: 400, headers: cors },
      );
    }
    if (!isHostAllowed(parsed.hostname, allowedDomains)) {
      return NextResponse.json(
        { error: 'host not allowed' },
        { status: 403, headers: cors },
      );
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
      return NextResponse.json(
        { error: 'fetch failed' },
        { status: response.status, headers: cors },
      );
    }

    const declaredContentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    const normalizedDeclaredContentType =
      declaredContentType === 'image/jpg'
        ? 'image/jpeg'
        : declaredContentType;
    if (
      !normalizedDeclaredContentType ||
      !ALLOWED_DECLARED_IMAGE_TYPES.has(normalizedDeclaredContentType)
    ) {
      return NextResponse.json(
        { error: 'unsupported image type' },
        { status: 415, headers: cors },
      );
    }

    const imageBuffer = await readBodyWithLimit(response);
    const detectedContentType = detectImageType(imageBuffer);
    if (!detectedContentType) {
      return NextResponse.json(
        { error: 'invalid image content' },
        { status: 415, headers: cors },
      );
    }

    return new NextResponse(imageBuffer.buffer, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': detectedContentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('🖼️ [ImageProxy] proxy error:', error);
    if (error instanceof ImageProxyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: cors },
      );
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'timeout' },
        { status: 504, headers: cors },
      );
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
