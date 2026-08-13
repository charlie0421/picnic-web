import { describe, it, expect, vi, afterEach } from 'vitest';
import { jsonFetcher } from '@/lib/wallet/json-fetcher';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(res: { ok: boolean; status: number; body: unknown | (() => never) }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    json: async () => {
      if (typeof res.body === 'function') (res.body as () => never)();
      return res.body;
    },
  }) as never;
}

describe('jsonFetcher', () => {
  it('정상 응답은 본문을 그대로 돌려준다', async () => {
    mockFetch({ ok: true, status: 200, body: { success: true, months: [] } });
    await expect(jsonFetcher('/x')).resolves.toEqual({ success: true, months: [] });
  });

  it('success 필드가 없는 정상 200 도 통과시킨다 (과잉 거부 방지)', async () => {
    // success 를 안 주는 기존 API 가 이 fetcher 를 쓰게 돼도 깨지면 안 된다.
    mockFetch({ ok: true, status: 200, body: { months: [] } });
    await expect(jsonFetcher('/x')).resolves.toEqual({ months: [] });
    mockFetch({ ok: true, status: 200, body: [1, 2] });
    await expect(jsonFetcher('/x')).resolves.toEqual([1, 2]);
  });

  it('HTTP 500 을 throw 한다 — resolve 하면 화면이 "데이터 없음"으로 보인다', async () => {
    // 이게 핵심이다. fetch().then(r => r.json()) 은 500 도 resolve 해서
    // SWR 이 성공으로 보고, 소멸 안내 화면이 "소멸 예정 없음"을 그린다.
    mockFetch({ ok: false, status: 500, body: { error: 'EXPIRING_BONUS_LOAD_FAILED' } });
    await expect(jsonFetcher('/x')).rejects.toThrow('EXPIRING_BONUS_LOAD_FAILED');
  });

  it('401 도 throw 한다', async () => {
    mockFetch({ ok: false, status: 401, body: { error: 'Authentication required.' } });
    await expect(jsonFetcher('/x')).rejects.toThrow('Authentication required.');
  });

  it('error 필드가 없으면 상태 코드로 식별한다', async () => {
    mockFetch({ ok: false, status: 503, body: {} });
    await expect(jsonFetcher('/x')).rejects.toThrow('HTTP_503');
  });

  it('success:false 는 200 이어도 실패로 본다', async () => {
    mockFetch({ ok: true, status: 200, body: { success: false } });
    await expect(jsonFetcher('/x')).rejects.toThrow('RESPONSE_NOT_SUCCESS');
  });

  it('본문이 JSON 이 아니면 throw 한다', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: (() => {
        throw new Error('invalid json');
      }) as never,
    });
    await expect(jsonFetcher('/x')).rejects.toThrow('FETCH_INVALID_JSON:200');
  });
});
