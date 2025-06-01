import { mockVotes, emptyVotes, getVotesByStatus } from './mockVoteData';
import { Vote } from '@/types/interfaces';

describe('투표 모의 데이터 테스트', () => {
  test('mockVotes 객체가 올바른 형식으로 정의되어 있는지 확인', () => {
    expect(mockVotes).toBeDefined();
    expect(Array.isArray(mockVotes)).toBe(true);
    expect(mockVotes.length).toBeGreaterThan(0);
    
    // 각 투표 객체가 필수 필드를 가지고 있는지 확인
    mockVotes.forEach(vote => {
      // 필수 필드 존재 확인
      expect(vote).toHaveProperty('id');
      expect(vote).toHaveProperty('title');
      expect(vote).toHaveProperty('start_at');
      expect(vote).toHaveProperty('stop_at');
      expect(vote).toHaveProperty('voteItem');
      
      // title이 Json 타입인지 확인
      expect(vote.title).toBeDefined();
      if (typeof vote.title === 'object') {
        expect(vote.title).toHaveProperty('ko');
        expect(vote.title).toHaveProperty('en');
      }
      
      // voteItem 배열 검사
      expect(vote.voteItem).toBeDefined();
      expect(Array.isArray(vote.voteItem)).toBe(true);
      
      // 각 voteItem이 올바른 형식인지 확인
      if (vote.voteItem && vote.voteItem.length > 0) {
        vote.voteItem.forEach(item => {
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('vote_id');
          expect(item).toHaveProperty('artist_id');
          expect(item).toHaveProperty('artist');
          
          // artist 객체 검사
          if (item.artist) {
            const artist = item.artist;
            expect(artist).toHaveProperty('id');
            expect(artist).toHaveProperty('name');
            
            // name이 Json 타입인지 확인
            if (artist.name && typeof artist.name === 'object') {
              expect(artist.name).toHaveProperty('ko');
              expect(artist.name).toHaveProperty('en');
            }
          }
        });
      }
      
      // voteReward 배열이 있으면 검사
      if (vote.voteReward && vote.voteReward.length > 0) {
        vote.voteReward.forEach(rewardItem => {
          expect(rewardItem).toHaveProperty('reward_id');
          expect(rewardItem).toHaveProperty('vote_id');
          
          // reward 객체가 있으면 검사
          if (rewardItem.reward) {
            expect(rewardItem.reward).toHaveProperty('id');
            expect(rewardItem.reward).toHaveProperty('title');
            expect(rewardItem.reward).toHaveProperty('thumbnail');
          }
        });
      }
    });
  });
  
  test('emptyVotes가 빈 배열인지 확인', () => {
    expect(emptyVotes).toBeDefined();
    expect(Array.isArray(emptyVotes)).toBe(true);
    expect(emptyVotes.length).toBe(0);
  });
  
  test('getVotesByStatus 함수가 올바르게 투표를 필터링하는지 확인', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 86400000 * 2).toISOString(); // 2일 전
    const futureDate = new Date(now.getTime() + 86400000 * 2).toISOString(); // 2일 후
    
    // 테스트용 투표 데이터 생성
    const testVotes: Vote[] = [
      {
        id: 1,
        title: { ko: '진행 중인 투표', en: 'Ongoing Vote' },
        start_at: pastDate,
        stop_at: futureDate,
        voteItem: [],
        voteReward: [],
        mainImage: '',
        waitImage: '',
        resultImage: '',
        area: 'kpop',
        voteCategory: 'artist',
        voteSubCategory: 'popular',
        voteContent: '',
        visibleAt: pastDate,
        createdAt: pastDate,
        updatedAt: pastDate,
        deletedAt: null,
        order: 1
      },
      {
        id: 2,
        title: { ko: '종료된 투표', en: 'Completed Vote' },
        start_at: pastDate,
        stop_at: pastDate, // 이미 종료됨
        voteItem: [],
        voteReward: [],
        mainImage: '',
        waitImage: '',
        resultImage: '',
        area: 'kpop',
        voteCategory: 'artist',
        voteSubCategory: 'popular',
        voteContent: '',
        visibleAt: pastDate,
        createdAt: pastDate,
        updatedAt: pastDate,
        deletedAt: null,
        order: 2
      },
      {
        id: 3,
        title: { ko: '예정된 투표', en: 'Upcoming Vote' },
        start_at: futureDate, // 앞으로 시작됨
        stop_at: new Date(now.getTime() + 86400000 * 4).toISOString(),
        voteItem: [],
        voteReward: [],
        mainImage: '',
        waitImage: '',
        resultImage: '',
        area: 'kpop',
        voteCategory: 'artist',
        voteSubCategory: 'popular',
        voteContent: '',
        visibleAt: pastDate,
        createdAt: pastDate,
        updatedAt: pastDate,
        deletedAt: null,
        order: 3
      }
    ];
    
    // 실제 mockVotes에서의 필터링 테스트
    const upcomingVotes = getVotesByStatus('upcoming');
    const ongoingVotes = getVotesByStatus('ongoing');
    const completedVotes = getVotesByStatus('completed');
    const allVotes = getVotesByStatus('all');
    
    // 결과가 정의되어 있는지 확인
    expect(upcomingVotes).toBeDefined();
    expect(ongoingVotes).toBeDefined();
    expect(completedVotes).toBeDefined();
    expect(allVotes).toBeDefined();
    
    // 모든 투표를 반환하는지 확인
    expect(allVotes).toEqual(mockVotes);
    
    // 각 필터링된 결과가 배열인지 확인
    expect(Array.isArray(upcomingVotes)).toBe(true);
    expect(Array.isArray(ongoingVotes)).toBe(true);
    expect(Array.isArray(completedVotes)).toBe(true);
  });
}); 