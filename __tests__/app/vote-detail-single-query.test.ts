import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

/**
 * React.cache 계약: 한 서버 요청(렌더) 안에서 같은 함수·같은 인자 호출은 한 번만 실행한다.
 * vitest 의 React 18 에는 cache 가 없어서 요청 스코프를 직접 흉내 낸다 (startRequest = 새 요청).
 */
const requestScope = vi.hoisted(() => ({ store: new Map<unknown, Map<string, unknown>>() }));
const startRequest = () => {
  requestScope.store = new Map();
};

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        let entries = requestScope.store.get(fn);
        if (!entries) {
          entries = new Map();
          requestScope.store.set(fn, entries);
        }
        const key = JSON.stringify(args);
        if (!entries.has(key)) {
          entries.set(key, fn(...args));
        }
        return entries.get(key) as R;
      },
  };
});

const SUPABASE_URL = 'https://example.supabase.co';

const fetchMock = vi.hoisted(() => vi.fn());

// 공개 서버 클라이언트만 테스트용으로 바꾼다 — 쿼리 조립·응답 해석은 실제 코드, 네트워크만 fetchMock.
vi.mock('@/lib/supabase/server', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const create = () =>
    createClient(SUPABASE_URL, 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchMock },
    });
  return { createPublicSupabaseClient: create, createPublicSupabaseServerClient: create };
});

vi.mock('@/components/client/vote/detail/VoteDetailClientOnly', () => ({ default: () => null }));
vi.mock('@/components/server/VoteDetailSkeleton', () => ({ default: () => null }));
vi.mock('@/components/client/vote/common/VoteErrorFallback', () => ({
  VoteErrorFallback: () => null,
}));

import { generateMetadata } from '@/app/[lang]/(main)/vote/[id]/page';
import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';

const VOTE = {
  id: 295,
  title: { en: 'October Debut Vote', ko: '10월 데뷔 투표' },
  main_image: null,
  deleted_at: null,
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const urlOf = (input: unknown) =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url);

const voteFetches = () =>
  fetchMock.mock.calls.filter(([input]) => urlOf(input).pathname === '/rest/v1/vote');

const tableFetchCount = (table: string) =>
  fetchMock.mock.calls.filter(([input]) => urlOf(input).pathname === `/rest/v1/${table}`).length;

const params = { params: Promise.resolve({ lang: 'en', id: '295' }) };

/**
 * 투표 상세의 generateMetadata(머리)와 VoteDetailFetcher(본문)는 같은 투표를 읽는다.
 * 둘이 같은 cached getter(getVoteById)를 쓰므로 한 요청에서 vote 조회는 한 번만 나가야 한다.
 */
describe('투표 상세 — 메타데이터와 본문의 vote 조회 공유', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown) => {
      const { pathname } = urlOf(input);
      if (pathname === '/rest/v1/vote') return jsonResponse(VOTE);
      return jsonResponse([]);
    });
    startRequest();
  });

  it('한 요청에서 메타데이터와 본문이 vote 를 한 번만 조회한다', async () => {
    const metadata = await generateMetadata(params);
    const body = (await VoteDetailFetcher({ voteId: '295', lang: 'en' })) as ReactElement<{
      vote: { id: number };
    }>;

    expect(metadata.title).toBe('October Debut Vote');
    expect(body.props.vote.id).toBe(295);
    expect(voteFetches()).toHaveLength(1);
    // 본문 전용 조회는 그대로 한 번씩
    expect(tableFetchCount('vote_item')).toBe(1);
    expect(tableFetchCount('vote_reward')).toBe(1);
  });

  it('본문이 먼저 렌더돼도 한 번만 조회한다', async () => {
    await VoteDetailFetcher({ voteId: '295', lang: 'en' });
    await generateMetadata(params);
    expect(voteFetches()).toHaveLength(1);
  });

  it('요청이 다르면 다시 조회하고, 두 GET 은 Next 요청 메모이제이션 키까지 같다', async () => {
    await generateMetadata(params);
    startRequest();
    await VoteDetailFetcher({ voteId: '295', lang: 'en' });

    const calls = voteFetches();
    expect(calls).toHaveLength(2);

    // React.cache 가 없는 경로에서도 Next 의 fetch dedupe(같은 URL·method·headers, signal 없음)로 합쳐질 수 있는 모양
    const [[firstUrl, firstInit], [secondUrl, secondInit]] = calls as Array<[unknown, RequestInit]>;
    const first = new Request(urlOf(firstUrl), firstInit);
    const second = new Request(urlOf(secondUrl), secondInit);
    expect(first.url).toBe(second.url);
    expect(first.method).toBe('GET');
    expect(second.method).toBe('GET');
    expect(Array.from(first.headers.entries())).toEqual(Array.from(second.headers.entries()));
    expect(firstInit?.signal ?? undefined).toBeUndefined();
    expect(secondInit?.signal ?? undefined).toBeUndefined();
  });
});
