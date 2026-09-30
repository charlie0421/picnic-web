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
 * 페이지가 다시 동적으로 돌아가거나, 빌드 프리렌더에서 폴백 데이터가 캐시된다.
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

  it('getFaqs 는 조회 오류에 빈 목록을 돌려준다 (프리렌더가 실패하지 않는다)', async () => {
    results.set('faqs', { data: null, error: { message: 'boom' } });
    await expect(getFaqs('ko')).resolves.toEqual([]);
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

  it('getNotices 는 조회 오류에 폴백 공지를 돌려준다', async () => {
    results.set('notices', { data: null, error: { message: 'boom' } });
    const notices = await getNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0].id).toBe(0);
  });

  it('getNoticeById 는 없는 id 에 예외 없이 data: null 을 돌려준다', async () => {
    results.set('notices', { data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const { data, error } = await getNoticeById(999999);
    expect(data).toBeNull();
    expect(error?.message).toBe('Notice not found');
    expect(cookieClientFactory).not.toHaveBeenCalled();
  });

  it('getNoticeById 는 숫자가 아닌 id 를 조회 없이 거부한다', async () => {
    const { data, error } = await getNoticeById(Number('abc'));
    expect(data).toBeNull();
    expect(error?.message).toBe('Invalid ID');
    expect(publicClientFactory).not.toHaveBeenCalled();
  });
});
