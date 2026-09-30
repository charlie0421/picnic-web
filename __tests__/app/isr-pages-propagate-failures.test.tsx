import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

const getFaqs = vi.fn();
const getFaqCategories = vi.fn();
const getNotices = vi.fn();
const getNoticeById = vi.fn();
const getLatestVersion = vi.fn();

vi.mock('@/lib/data-fetching/server/policy-service', () => ({
  getFaqs: (...args: unknown[]) => getFaqs(...args),
  getFaqCategories: (...args: unknown[]) => getFaqCategories(...args),
}));
vi.mock('@/lib/data-fetching/server/notice-service', () => ({
  getNotices: (...args: unknown[]) => getNotices(...args),
  getNoticeById: (...args: unknown[]) => getNoticeById(...args),
}));
vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getLatestVersion: (...args: unknown[]) => getLatestVersion(...args),
}));
vi.mock('@/lib/i18n/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('@/app/[lang]/(mypage)/faq/FaqClient', () => ({ default: () => null }));
vi.mock('@/components/server/mypage/FAQSkeleton', () => ({ default: () => null }));
vi.mock('@/app/[lang]/(mypage)/notice/[id]/NoticeDetailClient', () => ({ default: () => null }));
vi.mock('@/components/server/mypage/NoticeDetailSkeleton', () => ({ default: () => null }));
vi.mock('@/app/[lang]/download/DownloadClient', () => ({ default: () => null }));

import FaqPage from '@/app/[lang]/(mypage)/faq/page';
import NoticePage from '@/app/[lang]/(mypage)/notice/page';
import NoticeDetailPage from '@/app/[lang]/(mypage)/notice/[id]/page';
import DownloadPage from '@/app/[lang]/download/page';

type AnyProps = Record<string, unknown> & { children?: ReactNode };
type ServerComponent = (props: AnyProps) => Promise<ReactNode>;

/** 렌더 트리에서 async 서버 컴포넌트(Suspense 안의 Fetcher)를 찾아 실행한다 — React 가 렌더할 때 하는 일이다. */
async function renderAsyncChildren(node: ReactNode): Promise<void> {
  if (Array.isArray(node)) {
    for (const child of node) await renderAsyncChildren(child);
    return;
  }
  if (!isValidElement(node)) return;
  const element = node as ReactElement<AnyProps>;
  if (typeof element.type === 'function' && element.type.constructor.name === 'AsyncFunction') {
    await renderAsyncChildren(await (element.type as ServerComponent)(element.props));
    return;
  }
  await renderAsyncChildren(element.props.children);
}

const outage = new Error('connection reset');
const langProps = (lang = 'ko') => ({ params: Promise.resolve({ lang }) });

/**
 * ISR 페이지가 조회 실패를 잡아서 "정상처럼 보이는 화면"(빈 목록, 오류 문구, 404)으로 끝내면
 * 그 화면이 캐시에 저장돼 정상 페이지를 덮는다. 서비스 단위 테스트만으로는 페이지의 try/catch 를 막지 못한다 —
 * rewards/[id] 가 바로 그렇게 장애를 404 로 바꿔 캐시했다(__tests__/app/reward-detail-isr.test.tsx).
 * 서비스가 거절하면 페이지 렌더도 거절해야 한다.
 */
describe('ISR 페이지는 조회 실패를 삼키지 않는다', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const mock of [getFaqs, getFaqCategories, getNotices, getNoticeById, getLatestVersion]) mock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('/faq — FAQ 조회가 실패하면 렌더가 실패한다', async () => {
    getFaqs.mockRejectedValue(outage);
    getFaqCategories.mockResolvedValue([]);
    const tree = await FaqPage(langProps() as never);
    await expect(renderAsyncChildren(tree)).rejects.toBe(outage);
  });

  it('/faq — 카테고리 조회가 실패하면 렌더가 실패한다', async () => {
    getFaqs.mockResolvedValue([]);
    getFaqCategories.mockRejectedValue(outage);
    const tree = await FaqPage(langProps() as never);
    await expect(renderAsyncChildren(tree)).rejects.toBe(outage);
  });

  it('/faq — 조회가 성공하면 렌더된다', async () => {
    getFaqs.mockResolvedValue([]);
    getFaqCategories.mockResolvedValue([]);
    const tree = await FaqPage(langProps() as never);
    await expect(renderAsyncChildren(tree)).resolves.toBeUndefined();
  });

  it('/notice — 공지 조회가 실패하면 렌더가 실패한다', async () => {
    getNotices.mockRejectedValue(outage);
    await expect(NoticePage(langProps() as never)).rejects.toBe(outage);
  });

  it('/notice/[id] — 공지 조회가 실패하면 렌더가 실패한다 (오류 문구를 200 으로 렌더하지 않는다)', async () => {
    getNoticeById.mockRejectedValue(outage);
    const tree = await NoticeDetailPage({ params: Promise.resolve({ id: '4', lang: 'ko' }) } as never);
    await expect(renderAsyncChildren(tree)).rejects.toBe(outage);
  });

  it('/notice/[id] — 없는 공지는 예외가 아니라 "없음" 을 렌더한다', async () => {
    getNoticeById.mockResolvedValue({ data: null, error: new Error('Notice not found') });
    const tree = await NoticeDetailPage({ params: Promise.resolve({ id: '999999', lang: 'ko' }) } as never);
    await expect(renderAsyncChildren(tree)).resolves.toBeUndefined();
  });

  it('/download — 버전 조회가 실패하면 렌더가 실패한다 (링크 없는 화면을 1시간 캐시하지 않는다)', async () => {
    getLatestVersion.mockRejectedValue(outage);
    await expect(DownloadPage(langProps() as never)).rejects.toBe(outage);
  });
});
