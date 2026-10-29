// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock('@/utils/api/queries', () => ({ getRewards: async () => [] }));
vi.mock('@/lib/data-fetching/server/notice-service', () => ({ getNotices: async () => [] }));
vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: () => createClient('https://sitemap.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: voteFetch },
  }),
  createSupabaseServerClient: () => { throw new Error('Sitemap must not use user cookies'); },
}));

import { buildSitemapEntries } from '@/app/[lang]/sitemap';

const NOW = '2026-10-29T07:00:00.000Z';
const CREATED = '2026-10-01T00:00:00.000Z';
type Row = {
  id: number; created_at: string; updated_at: string | null;
  visible_at: string | null; deleted_at: string | null;
  start_at: string; stop_at: string;
};
let rows: Row[];
let requests: URL[];
let failAtRequest: number | undefined;
let serverCap: number;

// The real Supabase builder emits requests; only the external HTTP boundary is replaced.
const voteFetch: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push(url);
  if (requests.length > 20) throw new Error('Pagination did not advance');
  if (requests.length === failAtRequest) {
    return new Response(JSON.stringify({ code: '57014', message: 'statement timeout', details: null, hint: null }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  const params = url.searchParams;
  let selected = rows.filter(row => {
    if (params.get('deleted_at') === 'is.null' && row.deleted_at !== null) return false;
    const visible = params.get('visible_at');
    if (visible?.startsWith('lte.') && (!row.visible_at || row.visible_at > visible.slice(4))) return false;
    const cursor = params.get('id');
    return !cursor?.startsWith('gt.') || row.id > Number(cursor.slice(3));
  });
  selected = selected.sort((a, b) => a.id - b.id)
    .slice(0, Math.min(serverCap, Number(params.get('limit') ?? Infinity)));
  const data = selected.map(({ id, created_at, updated_at }) => ({ id, created_at, updated_at }));
  // A new row becomes visible between pages; the request's visibility cutoff must stay fixed.
  vi.setSystemTime(new Date('2026-10-29T07:02:00.000Z'));
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};

const voteUrls = (entries: Awaited<ReturnType<typeof buildSitemapEntries>>) =>
  entries.filter(entry => /\/vote\/\d+$/.test(entry.url));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  requests = [];
  serverCap = 2;
  failAtRequest = undefined;
  const base = { created_at: CREATED, updated_at: null, visible_at: CREATED, deleted_at: null };
  rows = [
    { ...base, id: 1, start_at: CREATED, stop_at: '2026-10-10T00:00:00.000Z' },
    { ...base, id: 3, updated_at: '2026-10-28T00:00:00.000Z', start_at: CREATED, stop_at: '2026-11-01T00:00:00.000Z' },
    { ...base, id: 7, start_at: '2026-11-01T00:00:00.000Z', stop_at: '2026-11-02T00:00:00.000Z' },
    { ...base, id: 8, deleted_at: CREATED, start_at: CREATED, stop_at: CREATED },
    { ...base, id: 9, visible_at: '2026-10-29T07:01:00.000Z', start_at: CREATED, stop_at: CREATED },
    { ...base, id: 10, visible_at: null, start_at: CREATED, stop_at: CREATED },
  ];
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('vote sitemap query', () => {
  it('requests only URL metadata, without candidate or reward joins', async () => {
    await buildSitemapEntries(['ko']);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.pathname).toBe('/rest/v1/vote');
      expect(request.searchParams.get('select')?.split(',').sort()).toEqual(['created_at', 'id', 'updated_at']);
      expect(Number(request.searchParams.get('limit'))).toBeGreaterThan(0);
      expect(request.searchParams.get('order')).toBe('id.asc');
    }
  });

  it('keeps all public votes once per language despite a lower server row cap', async () => {
    const entries = voteUrls(await buildSitemapEntries(['ko', 'en']));
    expect(entries.map(entry => new URL(entry.url).pathname)).toEqual([
      '/ko/vote/1', '/ko/vote/3', '/ko/vote/7', '/en/vote/1', '/en/vote/3', '/en/vote/7',
    ]);
    expect(requests.map(url => url.searchParams.get('id'))).toEqual([null, 'gt.3', 'gt.7']);
    expect(requests.every(url => url.searchParams.get('visible_at') === `lte.${NOW}`)).toBe(true);
    expect(entries[0].lastModified).toEqual(new Date(CREATED));
    expect(entries[1].lastModified).toEqual(new Date('2026-10-28T00:00:00.000Z'));
  });

  it('returns the non-vote sitemap when there are no public votes', async () => {
    rows = [];
    const entries = await buildSitemapEntries(['ko']);
    expect(voteUrls(entries)).toEqual([]);
    expect(entries.some(entry => new URL(entry.url).pathname === '/ko/vote')).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('does not publish the first page as a complete vote list when a later page fails', async () => {
    failAtRequest = 2;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await buildSitemapEntries(['ko']);
    expect(voteUrls(entries)).toEqual([]);
    expect(entries.some(entry => new URL(entry.url).pathname === '/ko/vote')).toBe(true);
    expect(requests).toHaveLength(2);
    expect(errorLog).toHaveBeenCalled();
  });
});
