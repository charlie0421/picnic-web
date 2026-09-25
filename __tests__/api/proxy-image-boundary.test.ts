import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/proxy-image/route';

const fetchMock = vi.fn<typeof fetch>();
const VALID_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function requestFor(imageUrl: string) {
  return new NextRequest(
    `http://localhost/api/proxy-image?url=${encodeURIComponent(imageUrl)}`,
  );
}

function imageResponse(
  body: BodyInit = VALID_PNG,
  headers: Record<string, string> = {},
) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      ...headers,
    },
  });
}

describe('GET /api/proxy-image — request boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://picnic-project.supabase.co',
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects active HTML returned by an allowed upstream', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<script>alert(1)</script>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(415);
    expect(await response.text()).not.toContain('<script>');
  });

  it('rejects a different Supabase tenant without fetching it', async () => {
    const response = await GET(
      requestFor('https://attacker.supabase.co/payload.png'),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires HTTPS before making the upstream request', async () => {
    const response = await GET(
      requestFor('http://lh3.googleusercontent.com/avatar.png'),
    );

    expect([400, 403]).toContain(response.status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses exact social hosts rather than allowing arbitrary subdomains', async () => {
    const response = await GET(
      requestFor('https://evil.graph.facebook.com/avatar.png'),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-checks redirect protocol and host before the next fetch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }),
    );

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared raster image whose magic bytes do not match', async () => {
    fetchMock.mockResolvedValueOnce(
      imageResponse(new TextEncoder().encode('<html>not an image</html>')),
    );

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(415);
  });

  it('rejects an upstream Content-Length over 10 MiB before buffering', async () => {
    fetchMock.mockResolvedValueOnce(
      imageResponse(VALID_PNG, {
        'content-length': String(10 * 1024 * 1024 + 1),
      }),
    );

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(413);
  });

  it('enforces the 10 MiB cap while reading a chunked response', async () => {
    const oversizedChunk = new Uint8Array(10 * 1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(VALID_PNG);
        controller.enqueue(oversizedChunk);
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(imageResponse(body));

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(413);
  });

  it('keeps the cache contract and adds nosniff for a valid project image', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());

    const response = await GET(
      requestFor('https://picnic-project.supabase.co/storage/avatar.png'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=86400',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(VALID_PNG);
  });

  it('preserves the upstream 429 response contract', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'retry-after': '60' },
      }),
    );

    const response = await GET(
      requestFor('https://lh3.googleusercontent.com/avatar'),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ retryAfter: '60' });
  });
});
