/**
 * 투표 페이지 테스트를 위한 모의 데이터
 */

import { Vote, Artist } from '@/types/interfaces';

// 기본 Artist 정보를 생성하는 함수
const createArtist = (id: number, name: { ko: string, en: string }, image: string): Artist => ({
  id,
  name,
  image,
  birthDate: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dd: null,
  mm: null,
  yy: null,
  debutDate: null,
  debutDd: null,
  debutMm: null,
  debutYy: null,
  deletedAt: null,
  gender: 'female',
  groupId: null,
  isKpop: true,
  isMusical: false,
  isSolo: false
});

// 투표 목록을 위한 모의 데이터
export const mockVotes: Vote[] = [
  {
    id: 1,
    title: { ko: '인기 아티스트 투표', en: 'Popular Artist Vote' },
    startAt: new Date(Date.now() - 86400000).toISOString(), // 하루 전
    stopAt: new Date(Date.now() + 86400000).toISOString(), // 하루 후
    mainImage: 'https://example.com/vote1.jpg',
    waitImage: 'https://example.com/wait1.jpg',
    resultImage: 'https://example.com/result1.jpg',
    area: 'kpop',
    voteCategory: 'artist',
    voteSubCategory: 'popular',
    voteContent: '가장 좋아하는 아티스트에게 투표하세요',
    visibleAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    deletedAt: null,
    order: 1,
    voteItem: [
      {
        id: 1,
        voteId: 1,
        artistId: 1,
        groupId: 1,
        voteTotal: 1000,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        deletedAt: null,
        artist: createArtist(1, { ko: '아티스트 1', en: 'Artist 1' }, 'https://example.com/artist1.jpg')
      },
      {
        id: 2,
        voteId: 1,
        artistId: 2,
        groupId: 1,
        voteTotal: 800,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        deletedAt: null,
        artist: createArtist(2, { ko: '아티스트 2', en: 'Artist 2' }, 'https://example.com/artist2.jpg')
      }
    ],
    voteReward: [
      {
        rewardId: 1,
        voteId: 1,
        reward: {
          id: 1,
          title: { ko: '보상 1', en: 'Reward 1' },
          description: { ko: '보상 1 설명', en: 'Reward 1 description' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          location: null,
          locationImages: [],
          order: 1,
          overviewImages: [],
          sizeGuide: null,
          sizeGuideImages: [],
          thumbnail: 'https://example.com/reward1.jpg',
          price: 1000,
          mainImage: 'https://example.com/reward1-main.jpg'
        }
      }
    ]
  },
  {
    id: 2,
    title: { ko: '신인상 투표', en: 'Rookie Award Vote' },
    startAt: new Date(Date.now() - 86400000 * 3).toISOString(), // 3일 전
    stopAt: new Date(Date.now() - 86400000).toISOString(), // 하루 전 (종료됨)
    mainImage: 'https://example.com/vote2.jpg',
    waitImage: 'https://example.com/wait2.jpg',
    resultImage: 'https://example.com/result2.jpg',
    area: 'kpop',
    voteCategory: 'artist',
    voteSubCategory: 'rookie',
    voteContent: '올해의 신인상 투표',
    visibleAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    deletedAt: null,
    order: 2,
    voteItem: [
      {
        id: 3,
        voteId: 2,
        artistId: 3,
        groupId: 2,
        voteTotal: 1500,
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        deletedAt: null,
        artist: createArtist(3, { ko: '아티스트 3', en: 'Artist 3' }, 'https://example.com/artist3.jpg')
      },
      {
        id: 4,
        voteId: 2,
        artistId: 4,
        groupId: 2,
        voteTotal: 1200,
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        deletedAt: null,
        artist: createArtist(4, { ko: '아티스트 4', en: 'Artist 4' }, 'https://example.com/artist4.jpg')
      }
    ],
    voteReward: []
  },
  {
    id: 3,
    title: { ko: '다가오는 투표', en: 'Upcoming Vote' },
    startAt: new Date(Date.now() + 86400000).toISOString(), // 하루 후
    stopAt: new Date(Date.now() + 86400000 * 5).toISOString(), // 5일 후
    mainImage: 'https://example.com/vote3.jpg',
    waitImage: 'https://example.com/wait3.jpg',
    resultImage: 'https://example.com/result3.jpg',
    area: 'kpop',
    voteCategory: 'artist',
    voteSubCategory: 'upcoming',
    voteContent: '곧 시작될 투표에 참여하세요',
    visibleAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    deletedAt: null,
    order: 3,
    voteItem: [
      {
        id: 5,
        voteId: 3,
        artistId: 5,
        groupId: 3,
        voteTotal: 0,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        deletedAt: null,
        artist: createArtist(5, { ko: '아티스트 5', en: 'Artist 5' }, 'https://example.com/artist5.jpg')
      },
      {
        id: 6,
        voteId: 3,
        artistId: 6,
        groupId: 3,
        voteTotal: 0,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        deletedAt: null,
        artist: createArtist(6, { ko: '아티스트 6', en: 'Artist 6' }, 'https://example.com/artist6.jpg')
      }
    ],
    voteReward: [
      {
        rewardId: 2,
        voteId: 3,
        reward: {
          id: 2,
          title: { ko: '보상 2', en: 'Reward 2' },
          description: { ko: '보상 2 설명', en: 'Reward 2 description' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          location: null,
          locationImages: [],
          order: 2,
          overviewImages: [],
          sizeGuide: null,
          sizeGuideImages: [],
          thumbnail: 'https://example.com/reward2.jpg',
          price: 2000,
          mainImage: 'https://example.com/reward2-main.jpg'
        }
      }
    ]
  }
];

// 빈 투표 목록
export const emptyVotes: Vote[] = [];

// 에러 상황 시뮬레이션을 위한 함수
export const mockVoteError = new Error('투표 데이터를 불러오는 중 오류가 발생했습니다.');

// 투표 상태에 따른 데이터 필터링
export const getVotesByStatus = (status: string) => {
  const now = new Date().toISOString();
  
  switch(status) {
    case 'upcoming':
      return mockVotes.filter(vote => vote.startAt && vote.startAt > now);
    case 'ongoing':
      return mockVotes.filter(vote => 
        vote.startAt && vote.stopAt && 
        vote.startAt <= now && vote.stopAt >= now
      );
    case 'completed':
      return mockVotes.filter(vote => vote.stopAt && vote.stopAt < now);
    default:
      return mockVotes;
  }
}; 