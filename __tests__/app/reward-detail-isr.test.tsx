import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

const getRewardById = vi.fn();
vi.mock('@/lib/data-fetching/server/reward-service', () => ({
  getRewardById: (...args: unknown[]) => getRewardById(...args),
}));

// next 의 notFound() 는 특수 오류를 던져 렌더를 끝낸다 — 같은 방식으로 흉내 낸다.
const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404');
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

vi.mock('@/components/client/reward/RewardDetailClient', () => ({ default: () => null }));

import RewardDetailPage, { generateMetadata } from '@/app/[lang]/(main)/rewards/[id]/page';
import RewardDetailClient from '@/components/client/reward/RewardDetailClient';

const props = (id: string, lang = 'ko') => ({ params: Promise.resolve({ id, lang }) });

const REWARD = {
  id: 12,
  title: { ko: '전광판 광고', en: 'Billboard' },
  thumbnail: 'rewards/12/thumb.png',
};

/**
 * /[lang]/rewards/[id] 는 ISR(300초)이다. 예전에는 페이지의 catch 가 프로덕션에서 모든 오류를
 * notFound() 로 바꿨는데, ISR 에서는 그 404 가 캐시에 저장돼 정상 리워드를 5분간 숨긴다.
 * 조회 장애는 예외로 전파하고(Next 가 마지막 정상 페이지를 유지), 실제로 없는 리워드만 404 로 끝낸다.
 */
describe('/rewards/[id] — ISR 에서의 조회 실패', () => {
  beforeEach(() => {
    getRewardById.mockReset();
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('페이지', () => {
    it('조회 장애를 404 로 바꾸지 않고 그대로 전파한다', async () => {
      const outage = new Error('connection reset');
      getRewardById.mockRejectedValue(outage);

      await expect(RewardDetailPage(props('12'))).rejects.toBe(outage);
    });

    it('없는 리워드는 notFound() 로 끝낸다', async () => {
      getRewardById.mockResolvedValue(null);

      await expect(RewardDetailPage(props('999999'))).rejects.toBe(NOT_FOUND);
    });

    it('리워드가 있으면 상세 컴포넌트에 넘겨 렌더한다', async () => {
      getRewardById.mockResolvedValue(REWARD);

      const main = (await RewardDetailPage(props('12'))) as ReactElement<{ children: ReactElement<{ children: ReactElement }> }>;
      const detail = main.props.children.props.children as ReactElement<{ reward: unknown }>;

      expect(main.type).toBe('main');
      expect(detail.type).toBe(RewardDetailClient);
      expect(detail.props.reward).toBe(REWARD);
    });
  });

  describe('generateMetadata', () => {
    it('조회 장애를 오류 메타데이터로 바꾸지 않고 그대로 전파한다', async () => {
      const outage = new Error('connection reset');
      getRewardById.mockRejectedValue(outage);

      await expect(generateMetadata(props('12'))).rejects.toBe(outage);
    });

    it('없는 리워드에는 "찾을 수 없음" 메타데이터를 돌려준다', async () => {
      getRewardById.mockResolvedValue(null);

      const metadata = await generateMetadata(props('999999'));

      expect(JSON.stringify(metadata)).toContain('리워드를 찾을 수 없습니다');
    });

    it('리워드가 있으면 언어에 맞는 제목과 canonical 을 돌려준다', async () => {
      getRewardById.mockResolvedValue(REWARD);

      const metadata = await generateMetadata(props('12', 'en'));

      expect(JSON.stringify(metadata.title)).toContain('Billboard');
      expect(String(metadata.alternates?.canonical)).toMatch(/\/en\/rewards\/12$/);
    });
  });
});
