import { describe, it, expect, vi, beforeEach } from 'vitest';

// 테스트 환경의 react 18 에는 cache 가 없다 — 그대로 통과시킨다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));

type Result = { data: unknown; error: { message: string; code?: string } | null };

const results = new Map<string, Result>();
const publicClientFactory = vi.fn();
const cookieClientFactory = vi.fn(() => {
  throw new Error('cookie client must not be used on ISR paths');
});

function createClient() {
  return {
    from: (table: string) => {
      const result = results.get(table) ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        single: () => Promise.resolve(result),
        then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: () => publicClientFactory(),
  createSupabaseServerClient: () => cookieClientFactory(),
  createServerSupabaseClient: () => cookieClientFactory(),
}));

import { getFaqs, getFaqCategories } from '@/lib/data-fetching/server/policy-service';
import { getNotices, getNoticeById } from '@/lib/data-fetching/server/notice-service';

/**
 * faq·notice 페이지는 ISR 이다. 조회가 쿠키 클라이언트(cookies()/headers())를 쓰면
 * 페이지가 다시 동적으로 돌아간다.
 *
 * 조회 실패를 빈 목록·가짜 공지로 바꿔 반환하면 그 결과가 ISR 캐시에 저장돼 정상 페이지를 덮는다.
 * 실패는 예외로 전파한다 — Next 는 재생성이 실패하면 마지막 정상 페이지를 계속 제공한다.
 */
describe('ISR 경로의 서비스는 공개 클라이언트만 쓴다', () => {
  beforeEach(() => {
    results.clear();
    publicClientFactory.mockReset().mockImplementation(createClient);
    cookieClientFactory.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('getFaqs 는 언어별로 현지화한 목록을 돌려준다', async () => {
    results.set('faqs', {
      data: [{ id: 1, question: { ko: '질문', en: 'Q' }, answer: { ko: '답' }, answer_delta: null, category: 'a', created_at: 'x' }],
      error: null,
    });
    const faqs = await getFaqs('en');
    expect(faqs).toHaveLength(1);
    expect(faqs[0]).toMatchObject({ question: 'Q', answer: '답' });
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getFaqs 는 조회 오류를 예외로 전파한다 (빈 목록이 캐시되면 안 된다)', async () => {
    results.set('faqs', { data: null, error: { message: 'boom' } });
    await expect(getFaqs('ko')).rejects.toThrow(/boom/);
  });

  it('getFaqs 는 실제로 비어 있는 결과를 빈 목록으로 돌려준다', async () => {
    results.set('faqs', { data: [], error: null });
    await expect(getFaqs('ko')).resolves.toEqual([]);
  });

  it('getFaqCategories 는 조회 오류를 예외로 전파한다', async () => {
    results.set('faq_categories', { data: null, error: { message: 'boom' } });
    await expect(getFaqCategories('ko')).rejects.toThrow(/boom/);
  });

  it('getFaqCategories 는 공개 클라이언트로 조회한다', async () => {
    results.set('faq_categories', {
      data: [{ code: 'pay', label: { ko: '결제' }, order_number: 1, active: true }],
      error: null,
    });
    await expect(getFaqCategories('ko')).resolves.toEqual([
      { code: 'pay', label: '결제', order_number: 1, active: true },
    ]);
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNotices 는 공개 클라이언트로 조회한다', async () => {
    const rows = [{ id: 7, title: { ko: '공지' }, content: {}, created_at: '2026-01-01', is_pinned: false }];
    results.set('notices', { data: rows, error: null });
    await expect(getNotices()).resolves.toEqual(rows);
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNotices 는 조회 오류를 예외로 전파한다 (가짜 공지가 캐시되면 안 된다)', async () => {
    results.set('notices', { data: null, error: { message: 'boom' } });
    await expect(getNotices()).rejects.toThrow(/boom/);
  });

  it('getNotices 는 공지가 없으면 빈 목록을 돌려준다 (오류와 구분한다)', async () => {
    results.set('notices', { data: [], error: null });
    await expect(getNotices()).resolves.toEqual([]);
  });

  it('getNotices 는 4초 안에 응답이 없으면 예외로 끝난다', async () => {
    vi.useFakeTimers();
    try {
      publicClientFactory.mockImplementation(() => ({
        from: () => {
          const builder: Record<string, unknown> = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            then: () => new Promise(() => {}),
          };
          return builder;
        },
      }));
      const pending = getNotices();
      const assertion = expect(pending).rejects.toThrow(/getNotices.*4000ms/);
      await vi.advanceTimersByTimeAsync(4000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('getNoticeById 는 없는 id 에 예외 없이 data: null 을 돌려준다', async () => {
    results.set('notices', { data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const { data, error } = await getNoticeById(999999);
    expect(data).toBeNull();
    expect(error?.message).toBe('Notice not found');
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNoticeById 는 조회 장애를 예외로 전파한다 (오류 문구가 200 으로 캐시되면 안 된다)', async () => {
    results.set('notices', { data: null, error: { message: 'connection reset', code: '08006' } });
    await expect(getNoticeById(4)).rejects.toThrow(/connection reset/);
  });

  it('getNoticeById 는 숫자가 아닌 id 를 조회 없이 거부한다', async () => {
    const { data, error } = await getNoticeById(Number('abc'));
    expect(data).toBeNull();
    expect(error?.message).toBe('Invalid ID');
    expect(publicClientFactory).not.toHaveBeenCalled();
  });
});
