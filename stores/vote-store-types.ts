import { Vote, VoteItem } from '@/types/interfaces';
import { VoteSubmissionRequest } from '@/lib/data-fetching/client/vote-api-enhanced';

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
export interface VoteStore {
  // 현재 투표 상세 정보
  currentVote: VoteDetailState;

  // 투표 참여 상태
  participation: VoteParticipationState;

  // 투표 제출 상태
  submission: VoteSubmissionState;

  // 투표 결과 상태
  results: VoteResultsState;

  // Actions
  // 투표 데이터 설정
  setCurrentVote: (vote: Vote, voteItems: VoteItem[], voteStatus: 'upcoming' | 'ongoing' | 'ended') => void;

  // 투표 아이템 업데이트
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
  loadVoteDetail: (voteId: string | number) => Promise<void>;

  // 투표 결과 로드
  loadVoteResults: (voteId: number) => Promise<void>;

  // 투표 제출
  submitUserVote: (userId: string, totalBonusRemain?: number) => Promise<boolean>;

  // 투표 상태 자동 업데이트 시작/중지
  startStatusUpdates: () => void;
  stopStatusUpdates: () => void;
}

// 초기 상태
export const initialVoteDetailState: VoteDetailState = {
  vote: null,
  voteItems: [],
  voteStatus: 'upcoming',
  timeLeft: null,
  isLoading: false,
  error: null,
};

export const initialParticipationState: VoteParticipationState = {
  hasVoted: false,
  userVoteItemId: null,
  userVoteAmount: 0,
  participationError: null,
};

export const initialSubmissionState: VoteSubmissionState = {
  isSubmitting: false,
  selectedItemId: null,
  voteAmount: 1,
  availableVotes: 10, // 기본값, 실제로는 서버에서 가져와야 함
  error: null,
};

export const initialResultsState: VoteResultsState = {
  voteItems: [],
  totalVotes: 0,
  lastUpdateTime: null,
  isLoading: false,
  error: null,
};
