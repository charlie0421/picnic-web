/**
 * vote.ts 테스트
 *
 * 이 테스트는 투표 관련 유틸리티 함수를 검증합니다.
 * 테스트 대상: getTopThreeInOrder 함수
 */

import { getTopThreeInOrder } from '@/utils/vote';
import { VoteItem } from '@/types/interfaces';

describe('vote utils', () => {
  describe('getTopThreeInOrder', () => {
    it('투표 총합에 따라 상위 3개를 올바른 순서로 반환한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 300, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 200, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 4, 
          voteTotal: 50, 
          artistId: 4, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      // 순서: [2위, 1위, 3위] = [Item 3, Item 2, Item 1]
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[2], rank: 2 }); // Item 3 (200 votes) - 2위
      expect(result[1]).toEqual({ ...items[1], rank: 1 }); // Item 2 (300 votes) - 1위
      expect(result[2]).toEqual({ ...items[0], rank: 3 }); // Item 1 (100 votes) - 3위
    });

    it('voteTotal이 null인 항목을 0으로 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: null, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 100, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 50, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[2], rank: 2 }); // Item 3 (50 votes) - 2위
      expect(result[1]).toEqual({ ...items[1], rank: 1 }); // Item 2 (100 votes) - 1위
      expect(result[2]).toEqual({ ...items[0], rank: 3 }); // Item 1 (0 votes) - 3위
    });

    it('동일한 투표 수를 가진 항목들을 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 100, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 100, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      // 동일한 투표 수일 때는 원래 배열 순서 유지
      expect(result[0]).toEqual({ ...items[1], rank: 2 }); // Item 2 - 2위
      expect(result[1]).toEqual({ ...items[0], rank: 1 }); // Item 1 - 1위
      expect(result[2]).toEqual({ ...items[2], rank: 3 }); // Item 3 - 3위
    });

    it('3개 미만의 항목이 있을 때 올바르게 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 200, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ ...items[0], rank: 2 }); // Item 1 (100 votes) - 2위
      expect(result[1]).toEqual({ ...items[1], rank: 1 }); // Item 2 (200 votes) - 1위
    });

    it('1개의 항목만 있을 때 올바르게 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ ...items[0], rank: 1 }); // Item 1 - 1위
    });

    it('빈 배열을 처리한다', () => {
      const items: VoteItem[] = [];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(0);
    });

    it('3개보다 많은 항목이 있을 때 상위 3개만 반환한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 500, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 300, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 4, 
          voteTotal: 200, 
          artistId: 4, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 5, 
          voteTotal: 400, 
          artistId: 5, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 6, 
          voteTotal: 50, 
          artistId: 6, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[4], rank: 2 }); // Item 5 (400 votes) - 2위
      expect(result[1]).toEqual({ ...items[1], rank: 1 }); // Item 2 (500 votes) - 1위
      expect(result[2]).toEqual({ ...items[2], rank: 3 }); // Item 3 (300 votes) - 3위
    });

    it('원본 배열을 수정하지 않는다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 100, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 300, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 200, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const originalItems = [...items];
      getTopThreeInOrder(items);

      expect(items).toEqual(originalItems);
    });

    it('모든 voteTotal이 0인 경우를 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 0, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 0, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 0, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[1], rank: 2 }); // Item 2 - 2위
      expect(result[1]).toEqual({ ...items[0], rank: 1 }); // Item 1 - 1위
      expect(result[2]).toEqual({ ...items[2], rank: 3 }); // Item 3 - 3위
    });

    it('음수 투표 수를 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: -10, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 100, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: -5, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[2], rank: 2 }); // Item 3 (-5 votes) - 2위
      expect(result[1]).toEqual({ ...items[1], rank: 1 }); // Item 2 (100 votes) - 1위
      expect(result[2]).toEqual({ ...items[0], rank: 3 }); // Item 1 (-10 votes) - 3위
    });

    it('매우 큰 투표 수를 처리한다', () => {
      const items: VoteItem[] = [
        { 
          id: 1, 
          voteTotal: 1000000, 
          artistId: 1, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 2, 
          voteTotal: 999999, 
          artistId: 2, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
        { 
          id: 3, 
          voteTotal: 1000001, 
          artistId: 3, 
          groupId: 1, 
          voteId: 1, 
          createdAt: '2023-01-01', 
          updatedAt: '2023-01-01', 
          deletedAt: null 
        },
      ];

      const result = getTopThreeInOrder(items);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ ...items[0], rank: 2 }); // Item 1 (1000000 votes) - 2위
      expect(result[1]).toEqual({ ...items[2], rank: 1 }); // Item 3 (1000001 votes) - 1위
      expect(result[2]).toEqual({ ...items[1], rank: 3 }); // Item 2 (999999 votes) - 3위
    });
  });
}); 