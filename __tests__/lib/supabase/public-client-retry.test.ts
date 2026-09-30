import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 실제 supabase-js·postgrest-js 와 실제 공개 클라이언트 팩토리를 쓴다. 네트워크(fetch)만 가짜다.
// 검증 대상이 "라이브러리의 재시도가 보내는 요청" 이라 조회 빌더를 mock 하면 의미가 없다.
vi.mock('@/components/client/reward/RewardPresenter', () => ({ RewardListPresenter: () => null }));

import { fetchWithStableCacheKey } from '@/lib/supabase/server';
import { _getRewards } from '@/utils/api/queries-content';

type FetchCall = { url: string; headers: Record<string, string> };

const calls: FetchCall[] = [];
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function stubFetch(respond: (callIndex: number) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      calls.push({ url: String(input), headers });
      return respond(calls.length - 1);
    }),
  );
}

const track = (promise: Promise<unknown>) => {
  const state: { value: 'pending' | 'resolved' | 'rejected'; result?: unknown; error?: unknown } = { value: 'pending' };
  promise.then(
    (result) => {
      state.value = 'resolved';
      state.result = result;
    },
    (error) => {
      state.value = 'rejected';
      state.error = error;
    },
  );
  return state;
};

describe('공개 Supabase 클라이언트 — 재시도와 Next 빌드 fetch 캐시', () => {
  const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };

  beforeEach(() => {
    calls.length = 0;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // 원래 없던 변수는 지운다 — process.env 에 undefined 를 대입하면 문자열 "undefined" 가 남는다.
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalEnv.key;
  });

  /**
   * Next 는 fetch 캐시 키에 요청 헤더를 넣는다. postgrest-js 는 재시도 요청에 X-Retry-Count 를 붙이므로,
   * 그대로 나가면 재시도로 성공한 응답이 첫 시도와 다른 키에 저장된다. 빌드에서 en 페이지의 첫 시도가 실패하고
   * 재시도가 성공해도 ko·my 페이지의 첫 시도는 그 응답을 쓰지 못하고 다시 조회한다.
   */
  it('재시도 요청은 첫 시도와 같은 URL·헤더로 나간다 (X-Retry-Count 없음)', async () => {
    stubFetch((index) => {
      if (index === 0) throw new TypeError('fetch failed');
      return json([]);
    });

    const state = track(_getRewards(8, { throwOnError: true }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(state.value).toBe('resolved');
    expect(calls).toHaveLength(2);
    expect(calls[1].headers).not.toHaveProperty('x-retry-count');
    expect(calls[1]).toEqual(calls[0]);
  });

  /**
   * PostgREST 는 스키마 캐시를 다시 읽는 동안 503 과 Retry-After 를 돌려준다. postgrest-js 의 자체 재시도는
   * 그 시간만큼 기다렸다 다시 보낸다. 이 재시도를 끄고 바깥에서 1초·2초 뒤에 다시 보내면 서버가 회복하기 전에
   * 시도를 다 써 버린다.
   */
  it('503 과 Retry-After: 5 를 받으면 5초 뒤 다시 조회해 7초 예산 안에 끝난다', async () => {
    const startedAt = Date.now();
    stubFetch(() => {
      if (Date.now() - startedAt < 5000) {
        return json({ message: 'schema cache loading' }, { status: 503, headers: { 'Retry-After': '5' } });
      }
      return json([{ id: 1, title: { ko: '리워드' }, deleted_at: null, created_at: 'c', updated_at: 'u' }]);
    });

    const state = track(_getRewards(8, { throwOnError: true }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(state.value).toBe('pending');
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.value).toBe('resolved');
    expect(state.result).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  describe('fetchWithStableCacheKey', () => {
    it('X-Retry-Count 만 빼고 나머지 요청은 그대로 넘긴다', async () => {
      stubFetch(() => json([]));
      const controller = new AbortController();

      await fetchWithStableCacheKey('https://example.supabase.co/rest/v1/reward?limit=8', {
        method: 'GET',
        headers: { apikey: 'anon-key', Prefer: 'count=exact', 'X-Retry-Count': '2' },
        signal: controller.signal,
      });

      expect(calls).toEqual([
        {
          url: 'https://example.supabase.co/rest/v1/reward?limit=8',
          headers: { apikey: 'anon-key', prefer: 'count=exact' },
        },
      ]);
      const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('GET');
      expect(init.signal).toBe(controller.signal);
    });

    it('헤더가 Headers 객체여도 같다', async () => {
      stubFetch(() => json([]));

      await fetchWithStableCacheKey('https://example.supabase.co/rest/v1/faqs', {
        headers: new Headers({ apikey: 'anon-key', 'x-retry-count': '1' }),
      });

      expect(calls[0].headers).toEqual({ apikey: 'anon-key' });
    });

    it('init 없이 Request 만 넘겨도 그 요청의 헤더를 지킨다 (인증 헤더가 사라지면 안 된다)', async () => {
      stubFetch(() => json([]));
      const request = new Request('https://example.supabase.co/rest/v1/faqs', {
        headers: { Authorization: 'Bearer anon-key', apikey: 'anon-key', 'X-Retry-Count': '1' },
      });

      await fetchWithStableCacheKey(request);

      expect(calls[0].headers).toEqual({ authorization: 'Bearer anon-key', apikey: 'anon-key' });
    });

    it('Request 와 init.headers 를 함께 넘기면 표준 fetch 처럼 init.headers 가 쓰인다', async () => {
      stubFetch(() => json([]));
      const request = new Request('https://example.supabase.co/rest/v1/faqs', { headers: { apikey: 'from-request' } });

      await fetchWithStableCacheKey(request, { headers: { apikey: 'from-init', 'x-retry-count': '3' } });

      expect(calls[0].headers).toEqual({ apikey: 'from-init' });
    });

    it('호출 시점의 전역 fetch 를 쓴다 — Next 가 나중에 바꿔 끼우는 fetch 를 거쳐야 캐시된다', async () => {
      stubFetch(() => json([]));
      await fetchWithStableCacheKey('https://example.supabase.co/a');
      const first = globalThis.fetch;

      vi.unstubAllGlobals();
      stubFetch(() => json([]));
      await fetchWithStableCacheKey('https://example.supabase.co/b');

      expect(globalThis.fetch).not.toBe(first);
      expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });
  });
});
