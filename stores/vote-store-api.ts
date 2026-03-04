import { VoteItem } from '@/types/interfaces';
import {
  submitVote,
  getVoteResults,
  calculateVoteStatus,
  calculateTimeLeft,
  VoteSubmissionRequest,
} from '@/lib/data-fetching/client/vote-api-enhanced';
import { VoteStore } from './vote-store-types';

// set/get 타입 정의 (devtools 미들웨어 시그니처)
type SetFn = {
  (
    partial:
      | VoteStore
      | Partial<VoteStore>
      | ((state: VoteStore) => VoteStore | Partial<VoteStore>),
    replace?: false,
    action?: string
  ): void;
  (
    state: VoteStore | ((state: VoteStore) => VoteStore),
    replace: true,
    action?: string
  ): void;
};
type GetFn = () => VoteStore;

// 상태 업데이트 타이머 저장용
let statusUpdateInterval: NodeJS.Timeout | null = null;

// API 연동 액션 팩토리
export function createVoteApiActions(set: SetFn, get: GetFn) {
  return {
    loadVoteDetail: async (voteId: string | number) => {
      set(
        (state) => ({
          currentVote: {
            ...state.currentVote,
            isLoading: true,
            error: null,
          },
        }),
        false,
        'loadVoteDetail:start'
      );

      try {
        const response = await fetch(`/api/votes/${voteId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch vote details');
        }

        const data = await response.json();
        const vote = data.data; // API 응답 형식에 맞게 수정
        const voteItems = vote.vote_item;

        if (!vote) {
          set(
            (state) => ({
              currentVote: {
                ...state.currentVote,
                isLoading: false,
                error: 'Vote not found',
              },
            }),
            false,
            'loadVoteDetail:error'
          );
          return;
        }

        const voteStatus = calculateVoteStatus(vote);
        const timeLeft = voteStatus === 'ongoing'
          ? calculateTimeLeft(vote.stop_at || '')
          : voteStatus === 'upcoming'
            ? calculateTimeLeft(vote.start_at || '')
            : null;

        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              vote,
              voteItems,
              voteStatus,
              timeLeft,
              isLoading: false,
              error: null,
            },
            results: {
              ...state.results,
              voteItems,
              totalVotes: voteItems.reduce((sum: number, item: VoteItem) => sum + (item.vote_total || 0), 0),
              lastUpdateTime: Date.now(),
            },
          }),
          false,
          'loadVoteDetail:success'
        );
      } catch (error) {
        console.error('Load vote detail error:', error);
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              isLoading: false,
              error: error instanceof Error ? error.message : 'Failed to load vote details',
            },
          }),
          false,
          'loadVoteDetail:exception'
        );
      }
    },

    loadVoteResults: async (voteId: number) => {
      const { startResultsLoading, setResultsError, updateResults } = get();

      startResultsLoading();

      try {
        const responseData = await getVoteResults(voteId);

        if (!responseData) {
          setResultsError('Failed to load vote results: No data returned');
          return;
        }

        const { results, totalVotes } = responseData;
        const voteItems: VoteItem[] = results.map((result) => ({
          id: result.id,
          vote_id: result.voteId,
          artist_id: result.artistId,
          group_id: result.groupId,
          vote_total: result.voteTotal,
          star_candy_bonus_total: 0,
          star_candy_total: 0,
          artist: result.artist ? {
            id: result.artist.id,
            birth_date: null,
            created_at: '',
            dd: null,
            debut_date: null,
            debut_dd: null,
            debut_mm: null,
            debut_yy: null,
            deleted_at: null,
            gender: null,
            group_id: result.groupId,
            image: result.artist.image,
            is_kpop: false,
            is_musical: false,
            is_solo: true,
            mm: null,
            name: result.artist.name,
            updated_at: '',
            yy: null,
            artistGroup: result.artist.artistGroup ? {
              id: result.artist.artistGroup.id,
              created_at: '',
              debut_date: null,
              debut_dd: null,
              debut_mm: null,
              debut_yy: null,
              deleted_at: null,
              image: null,
              name: result.artist.artistGroup.name,
              updated_at: '',
            } : undefined,
          } : undefined,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        }));

        updateResults(voteItems, totalVotes);
      } catch (error) {
        console.error('Load vote results error:', error);
        setResultsError('Failed to load vote results');
      }
    },

    submitUserVote: async (userId: string, totalBonusRemain: number = 0) => {
      const { currentVote, submission, startSubmission, completeSubmission } = get();

      if (!currentVote.vote || !submission.selectedItemId) {
        completeSubmission(false, 'Invalid vote data');
        return false;
      }

      startSubmission();

      try {
        const request: VoteSubmissionRequest = {
          voteId: currentVote.vote.id,
          voteItemId: submission.selectedItemId as number,
          amount: submission.voteAmount,
          userId,
          totalBonusRemain,
        };

        const response = await submitVote(request);

        if (!response.success) {
          completeSubmission(false, response.error || 'Failed to submit vote');
          return false;
        }

        completeSubmission(true);

        // 성공 후 투표 결과 새로고침
        const { loadVoteResults } = get();
        await loadVoteResults(currentVote.vote.id);

        return true;
      } catch (error) {
        console.error('Submit vote error:', error);
        completeSubmission(false, 'Failed to submit vote');
        return false;
      }
    },

    startStatusUpdates: () => {
      const { currentVote, updateTimeLeft } = get();

      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
      }

      statusUpdateInterval = setInterval(() => {
        const { currentVote } = get();

        if (!currentVote.vote) return;

        if (currentVote.vote) {
          const timeLeft = calculateTimeLeft(currentVote.vote);
          updateTimeLeft(timeLeft);

          // 상태 변경 체크
          if (currentVote.vote.start_at && currentVote.vote.stop_at) {
            const newStatus = calculateVoteStatus(currentVote.vote);
            if (newStatus !== currentVote.voteStatus) {
              set(
                (state) => ({
                  currentVote: {
                    ...state.currentVote,
                    voteStatus: newStatus,
                  },
                }),
                false,
                'statusUpdate'
              );
            }
          }
        }
      }, 1000);
    },

    stopStatusUpdates: () => {
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
      }
    },
  };
}
