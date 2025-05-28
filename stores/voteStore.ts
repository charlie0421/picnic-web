import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Vote, VoteItem } from '@/types/interfaces';

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

      // Actions 구현
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
    }),
    {
      name: 'vote-store',
      // 개발 환경에서만 devtools 활성화
      enabled: process.env.NODE_ENV === 'development',
    }
  )
); 