/**
 * 투표 관련 데이터 페칭 함수들의 모의 구현
 */

import { mockVotes, emptyVotes, getVotesByStatus, mockVoteError } from './mockVoteData';
import { Vote, VoteItem, Reward } from '@/types/interfaces';

/**
 * getVotes 함수 모의 구현
 * @param status - 투표 상태 (upcoming, ongoing, completed, all)
 * @param area - 투표 영역
 * @returns 필터링된 투표 목록
 */
export const mockGetVotes = jest.fn(async (
  status?: string,
  area?: string
): Promise<Vote[]> => {
  if (status === 'error') {
    throw mockVoteError;
  }
  
  if (status === 'empty') {
    return emptyVotes;
  }
  
  // 상태에 따른 필터링
  let filteredVotes = status ? getVotesByStatus(status) : mockVotes;
  
  // 영역에 따른 필터링
  if (area) {
    filteredVotes = filteredVotes.filter(vote => vote.area === area);
  }
  
  return Promise.resolve(filteredVotes);
});

/**
 * getVoteById 함수 모의 구현
 * @param id - 투표 ID
 * @returns 해당 ID의 투표 정보 또는 null
 */
export const mockGetVoteById = jest.fn(async (id: string): Promise<Vote | null> => {
  if (id === 'error') {
    throw mockVoteError;
  }
  
  const vote = mockVotes.find(v => v.id.toString() === id);
  return Promise.resolve(vote || null);
});

/**
 * getVoteItems 함수 모의 구현
 * @param voteId - 투표 ID
 * @returns 해당 투표의 항목 목록
 */
export const mockGetVoteItems = jest.fn(async (voteId: number): Promise<VoteItem[]> => {
  if (voteId.toString() === 'error') {
    throw mockVoteError;
  }
  
  const vote = mockVotes.find(v => v.id === voteId);
  return Promise.resolve(vote?.voteItem || []);
});

/**
 * getVoteRewards 함수 모의 구현
 * @param voteId - 투표 ID
 * @returns 해당 투표의 보상 목록
 */
export const mockGetVoteRewards = jest.fn(async (voteId: number): Promise<Reward[]> => {
  if (voteId.toString() === 'error') {
    throw mockVoteError;
  }
  
  const vote = mockVotes.find(v => v.id === voteId);
  const voteRewards = vote?.voteReward || [];
  
  // 실제 Reward 객체 배열 반환
  return Promise.resolve(voteRewards.map(vr => vr.reward || {
    id: vr.rewardId,
    title: { ko: `보상 ${vr.rewardId}`, en: `Reward ${vr.rewardId}` },
    description: { ko: `보상 ${vr.rewardId} 설명`, en: `Reward ${vr.rewardId} description` },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    location: null,
    locationImages: [],
    order: vr.rewardId,
    overviewImages: [],
    sizeGuide: null,
    sizeGuideImages: [],
    thumbnail: `https://example.com/reward${vr.rewardId}.jpg`,
    price: vr.rewardId * 1000,
    mainImage: `https://example.com/reward${vr.rewardId}-main.jpg`
  }));
}); 