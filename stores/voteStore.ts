import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Vote, VoteItem } from '@/types/interfaces';
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  submitVote, 
  getVoteResults, 
  checkCanVote, 
  fetchVoteDetail, 
  fetchVoteList,
  calculateVoteStatus,
  calculateTimeLeft,
  VoteSubmissionRequest,
  CanVoteRequest
} from '@/lib/data-fetching/vote-api';

// 투표 상태 타입 정의
export interface VoteSubmissionState {
  isSubmitting: boolean;
  selectedItemId: string | number | null;
  voteAmount: number;
  availableVotes: number;
  error: string | null;
}

export interface VoteParticipationState {
  hasVoted: boolean;
  userVoteItemId: string | number | null;
  userVoteAmount: number;
  participationError: string | null;
}

export interface VoteResultsState {
  voteItems: VoteItem[];
  totalVotes: number;
  lastUpdateTime: number | null;
  isLoading: boolean;
  error: string | null;
}

export interface VoteDetailState {
  vote: Vote | null;
  voteItems: VoteItem[];
  voteStatus: 'upcoming' | 'ongoing' | 'ended';
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  isLoading: boolean;
  error: string | null;
}

// 메인 투표 스토어 인터페이스
interface VoteStore {
  // 현재 투표 상세 정보
  currentVote: VoteDetailState;
  
  // 투표 참여 상태
  participation: VoteParticipationState;
  
  // 투표 제출 상태
  submission: VoteSubmissionState;
  
  // 투표 결과 상태
  results: VoteResultsState;
  
  // 실시간 구독 상태
  isSubscribed: boolean;
  
  // Actions
  // 투표 데이터 설정
  setCurrentVote: (vote: Vote, voteItems: VoteItem[], voteStatus: 'upcoming' | 'ongoing' | 'ended') => void;
  
  // 투표 아이템 업데이트 (실시간)
  updateVoteItems: (updatedItems: VoteItem[]) => void;
  
  // 개별 투표 아이템 업데이트
  updateVoteItem: (itemId: string | number, updates: Partial<VoteItem>) => void;
  
  // 투표 선택
  selectVoteItem: (itemId: string | number | null) => void;
  
  // 투표량 설정
  setVoteAmount: (amount: number) => void;
  
  // 투표 제출 시작
  startSubmission: () => void;
  
  // 투표 제출 완료
  completeSubmission: (success: boolean, error?: string) => void;
  
  // 사용자 참여 상태 설정
  setUserParticipation: (hasVoted: boolean, voteItemId?: string | number, voteAmount?: number) => void;
  
  // 투표 결과 로딩 시작
  startResultsLoading: () => void;
  
  // 투표 결과 업데이트
  updateResults: (voteItems: VoteItem[], totalVotes: number) => void;
  
  // 투표 결과 에러 설정
  setResultsError: (error: string) => void;
  
  // 실시간 구독 상태 설정
  setSubscriptionStatus: (isSubscribed: boolean) => void;
  
  // 시간 남은 시간 업데이트
  updateTimeLeft: (timeLeft: { days: number; hours: number; minutes: number; seconds: number } | null) => void;
  
  // 에러 초기화
  clearErrors: () => void;
  
  // 투표 상태 초기화
  resetVoteState: () => void;
  
  // 특정 투표 상태만 초기화
  resetSubmissionState: () => void;
  resetParticipationState: () => void;
  resetResultsState: () => void;

  // API 연동 액션들
  // 투표 상세 정보 로드
  loadVoteDetail: (supabaseClient: SupabaseClient, voteId: string | number) => Promise<void>;
  
  // 투표 결과 로드
  loadVoteResults: (voteId: number) => Promise<void>;
  
  // 투표 가능 여부 확인
  checkVoteEligibility: (userId: string, voteAmount: number) => Promise<boolean>;
  
  // 투표 제출
  submitUserVote: (userId: string, totalBonusRemain?: number) => Promise<boolean>;
  
  // 투표 상태 자동 업데이트 시작
  startStatusUpdates: () => void;
  
  // 투표 상태 자동 업데이트 중지
  stopStatusUpdates: () => void;
}

// 초기 상태
const initialVoteDetailState: VoteDetailState = {
  vote: null,
  voteItems: [],
  voteStatus: 'upcoming',
  timeLeft: null,
  isLoading: false,
  error: null,
};

const initialParticipationState: VoteParticipationState = {
  hasVoted: false,
  userVoteItemId: null,
  userVoteAmount: 0,
  participationError: null,
};

const initialSubmissionState: VoteSubmissionState = {
  isSubmitting: false,
  selectedItemId: null,
  voteAmount: 1,
  availableVotes: 10, // 기본값, 실제로는 서버에서 가져와야 함
  error: null,
};

const initialResultsState: VoteResultsState = {
  voteItems: [],
  totalVotes: 0,
  lastUpdateTime: null,
  isLoading: false,
  error: null,
};

// 상태 업데이트 타이머 저장용
let statusUpdateInterval: NodeJS.Timeout | null = null;

// Zustand 스토어 생성
export const useVoteStore = create<VoteStore>()(
  devtools(
    (set, get) => ({
      // 초기 상태
      currentVote: initialVoteDetailState,
      participation: initialParticipationState,
      submission: initialSubmissionState,
      results: initialResultsState,
      isSubscribed: false,

      // 기존 Actions 구현
      setCurrentVote: (vote, voteItems, voteStatus) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              vote,
              voteItems,
              voteStatus,
              isLoading: false,
              error: null,
            },
            results: {
              ...state.results,
              voteItems,
              totalVotes: voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
              lastUpdateTime: Date.now(),
            },
          }),
          false,
          'setCurrentVote'
        ),

      updateVoteItems: (updatedItems) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              voteItems: updatedItems,
            },
            results: {
              ...state.results,
              voteItems: updatedItems,
              totalVotes: updatedItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
              lastUpdateTime: Date.now(),
            },
          }),
          false,
          'updateVoteItems'
        ),

      updateVoteItem: (itemId, updates) =>
        set(
          (state) => {
            const updateItemInArray = (items: VoteItem[]) =>
              items.map((item) =>
                item.id === itemId ? { ...item, ...updates } : item
              );

            const updatedCurrentItems = updateItemInArray(state.currentVote.voteItems);
            const updatedResultItems = updateItemInArray(state.results.voteItems);

            return {
              currentVote: {
                ...state.currentVote,
                voteItems: updatedCurrentItems,
              },
              results: {
                ...state.results,
                voteItems: updatedResultItems,
                totalVotes: updatedResultItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
                lastUpdateTime: Date.now(),
              },
            };
          },
          false,
          'updateVoteItem'
        ),

      selectVoteItem: (itemId) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              selectedItemId: itemId,
              error: null,
            },
          }),
          false,
          'selectVoteItem'
        ),

      setVoteAmount: (amount) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              voteAmount: Math.max(1, Math.min(amount, state.submission.availableVotes)),
            },
          }),
          false,
          'setVoteAmount'
        ),

      startSubmission: () =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              isSubmitting: true,
              error: null,
            },
          }),
          false,
          'startSubmission'
        ),

      completeSubmission: (success, error) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              isSubmitting: false,
              error: success ? null : (error || '투표 제출에 실패했습니다.'),
              // 성공 시 선택 상태 초기화
              selectedItemId: success ? null : state.submission.selectedItemId,
              voteAmount: success ? 1 : state.submission.voteAmount,
            },
            participation: success
              ? {
                  ...state.participation,
                  hasVoted: true,
                  userVoteItemId: state.submission.selectedItemId,
                  userVoteAmount: state.submission.voteAmount,
                  participationError: null,
                }
              : state.participation,
          }),
          false,
          'completeSubmission'
        ),

      setUserParticipation: (hasVoted, voteItemId, voteAmount = 0) =>
        set(
          (state) => ({
            participation: {
              ...state.participation,
              hasVoted,
              userVoteItemId: voteItemId || null,
              userVoteAmount: voteAmount,
              participationError: null,
            },
          }),
          false,
          'setUserParticipation'
        ),

      startResultsLoading: () =>
        set(
          (state) => ({
            results: {
              ...state.results,
              isLoading: true,
              error: null,
            },
          }),
          false,
          'startResultsLoading'
        ),

      updateResults: (voteItems, totalVotes) =>
        set(
          (state) => ({
            results: {
              ...state.results,
              voteItems,
              totalVotes,
              lastUpdateTime: Date.now(),
              isLoading: false,
              error: null,
            },
          }),
          false,
          'updateResults'
        ),

      setResultsError: (error) =>
        set(
          (state) => ({
            results: {
              ...state.results,
              error,
              isLoading: false,
            },
          }),
          false,
          'setResultsError'
        ),

      setSubscriptionStatus: (isSubscribed) =>
        set(
          () => ({ isSubscribed }),
          false,
          'setSubscriptionStatus'
        ),

      updateTimeLeft: (timeLeft) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              timeLeft,
            },
          }),
          false,
          'updateTimeLeft'
        ),

      clearErrors: () =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              error: null,
            },
            submission: {
              ...state.submission,
              error: null,
            },
            participation: {
              ...state.participation,
              participationError: null,
            },
            results: {
              ...state.results,
              error: null,
            },
          }),
          false,
          'clearErrors'
        ),

      resetVoteState: () =>
        set(
          () => ({
            currentVote: initialVoteDetailState,
            participation: initialParticipationState,
            submission: initialSubmissionState,
            results: initialResultsState,
            isSubscribed: false,
          }),
          false,
          'resetVoteState'
        ),

      resetSubmissionState: () =>
        set(
          () => ({
            submission: initialSubmissionState,
          }),
          false,
          'resetSubmissionState'
        ),

      resetParticipationState: () =>
        set(
          () => ({
            participation: initialParticipationState,
          }),
          false,
          'resetParticipationState'
        ),

      resetResultsState: () =>
        set(
          () => ({
            results: initialResultsState,
          }),
          false,
          'resetResultsState'
        ),

      // API 연동 액션들
      loadVoteDetail: async (supabaseClient, voteId) => {
        const { currentVote } = get();
        
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
          const { vote, voteItems, error } = await fetchVoteDetail(supabaseClient, voteId);
          
          if (error || !vote) {
            set(
              (state) => ({
                currentVote: {
                  ...state.currentVote,
                  isLoading: false,
                  error: error || 'Vote not found',
                },
              }),
              false,
              'loadVoteDetail:error'
            );
            return;
          }

          const voteStatus = calculateVoteStatus(vote.start_at || '', vote.stop_at || '');
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
                totalVotes: voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
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
                error: 'Failed to load vote details',
              },
            }),
            false,
            'loadVoteDetail:exception'
          );
        }
      },

      loadVoteResults: async (voteId) => {
        const { startResultsLoading, setResultsError, updateResults } = get();
        
        startResultsLoading();

        try {
          const response = await getVoteResults(voteId);
          
          if (!response.success || !response.data) {
            setResultsError(response.error || 'Failed to load vote results');
            return;
          }

          const { results, totalVotes } = response.data;
          const voteItems: VoteItem[] = results.map((result) => ({
            id: result.id,
            vote_id: result.voteId,
            artist_id: result.artistId,
            group_id: result.groupId,
            vote_total: result.voteTotal,
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

      checkVoteEligibility: async (userId, voteAmount) => {
        try {
          const request: CanVoteRequest = { userId, voteAmount };
          const response = await checkCanVote(request);
          
          if (!response.success) {
            set(
              (state) => ({
                submission: {
                  ...state.submission,
                  error: response.error || 'Failed to check vote eligibility',
                },
              }),
              false,
              'checkVoteEligibility:error'
            );
            return false;
          }

          return response.canVote || false;
        } catch (error) {
          console.error('Check vote eligibility error:', error);
          set(
            (state) => ({
              submission: {
                ...state.submission,
                error: 'Failed to check vote eligibility',
              },
            }),
            false,
            'checkVoteEligibility:exception'
          );
          return false;
        }
      },

      submitUserVote: async (userId, totalBonusRemain = 0) => {
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

          let targetDate: string | null = null;
          if (currentVote.voteStatus === 'upcoming' && currentVote.vote.start_at) {
            targetDate = currentVote.vote.start_at;
          } else if (currentVote.voteStatus === 'ongoing' && currentVote.vote.stop_at) {
            targetDate = currentVote.vote.stop_at;
          }

          if (targetDate) {
            const timeLeft = calculateTimeLeft(targetDate);
            updateTimeLeft(timeLeft);
            
            // 상태 변경 체크
            if (currentVote.vote.start_at && currentVote.vote.stop_at) {
              const newStatus = calculateVoteStatus(currentVote.vote.start_at, currentVote.vote.stop_at);
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
    }),
    {
      name: 'vote-store',
      // 개발 환경에서만 devtools 활성화
      enabled: process.env.NODE_ENV === 'development',
    }
  )
); 