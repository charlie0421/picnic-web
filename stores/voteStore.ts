import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Vote, VoteItem } from '@/types/interfaces';
import { 
  submitVote, 
  getVoteResults, 
  fetchVoteList,
  calculateVoteStatus,
  calculateTimeLeft,
  VoteSubmissionRequest
} from '@/lib/data-fetching/client/vote-api-enhanced';
import { 
  VoteRealtimeService,
  VoteRealtimeEvent, 
  ConnectionStatus,
  VoteEventListener,
  ConnectionStatusListener
} from '@/lib/supabase/realtime';

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

// 실시간 상태 타입 추가
export interface RealtimeState {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  currentVoteId: number | null;
  eventCount: number;
  lastEvent: VoteRealtimeEvent | null;
  autoSync: boolean; // 자동 동기화 여부
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
  
  // 실시간 구독 상태 (기존)
  isSubscribed: boolean;
  
  // 실시간 상태 (새로 추가)
  realtime: RealtimeState;
  
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

  // 실시간 관련 액션들 (새로 추가)
  // 실시간 연결 시작
  startRealtimeConnection: (voteId: number) => Promise<void>;
  
  // 실시간 연결 중지
  stopRealtimeConnection: () => Promise<void>;
  
  // 실시간 이벤트 처리
  handleRealtimeEvent: (event: VoteRealtimeEvent) => void;
  
  // 연결 상태 업데이트
  updateConnectionStatus: (status: ConnectionStatus) => void;
  
  // 자동 동기화 설정
  setAutoSync: (enabled: boolean) => void;

  // API 연동 액션들
  // 투표 상세 정보 로드
  loadVoteDetail: (voteId: string | number) => Promise<void>;
  
  // 투표 결과 로드
  loadVoteResults: (voteId: number) => Promise<void>;
  

  
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

// 실시간 초기 상태 (새로 추가)
const initialRealtimeState: RealtimeState = {
  isConnected: false,
  connectionStatus: 'disconnected',
  currentVoteId: null,
  eventCount: 0,
  lastEvent: null,
  autoSync: true,
};

// 상태 업데이트 타이머 저장용
let statusUpdateInterval: NodeJS.Timeout | null = null;

// 실시간 서비스 및 리스너 참조 (지연 로딩)
let realtimeService: VoteRealtimeService | null = null;
let eventListener: VoteEventListener | null = null;
let statusListener: ConnectionStatusListener | null = null;

// 실시간 서비스 가져오기 (브라우저에서만)
const getRealtimeServiceSafely = async () => {
  if (typeof window === 'undefined') return null;
  if (!realtimeService) {
    try {
      const { getVoteRealtimeService } = await import('@/lib/supabase/realtime');
      realtimeService = getVoteRealtimeService();
    } catch (error) {
      console.error('[VoteStore] Failed to load realtime service:', error);
      return null;
    }
  }
  return realtimeService;
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
      realtime: initialRealtimeState,

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
            realtime: initialRealtimeState,
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

      // 실시간 관련 액션들 (새로 추가)
      // 실시간 연결 시작
      startRealtimeConnection: async (voteId) => {
        // 기존 연결이 있다면 먼저 중지
        get().stopRealtimeConnection();
        
        // 상태 업데이트
        set(
          (state) => ({
            realtime: {
              ...state.realtime,
              currentVoteId: voteId,
              connectionStatus: 'connecting',
            },
          }),
          false,
          'startRealtimeConnection:connecting'
        );
        
        // 이벤트 리스너 생성
        eventListener = (event: VoteRealtimeEvent) => {
          get().handleRealtimeEvent(event);
        };
        
        // 상태 리스너 생성
        statusListener = (status: ConnectionStatus) => {
          get().updateConnectionStatus(status);
        };
        
        try {
          // 실시간 서비스 가져오기
          const service = await getRealtimeServiceSafely();
          if (!service) {
            console.warn('[VoteStore] 실시간 서비스를 사용할 수 없습니다.');
            return;
          }
          
          // 리스너 등록
          service.addEventListener(eventListener);
          service.addStatusListener(statusListener);
          
          // 투표 구독 시작
          service.subscribeToVote(voteId);
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[VoteStore] 실시간 연결 시작: 투표 ${voteId}`);
          }
        } catch (error) {
          console.error('[VoteStore] 실시간 연결 실패:', error);
          set(
            (state) => ({
              realtime: {
                ...state.realtime,
                connectionStatus: 'error',
              },
            }),
            false,
            'startRealtimeConnection:error'
          );
        }
      },
      
      // 실시간 연결 중지
      stopRealtimeConnection: async () => {
        const { realtime } = get();
        
        if (realtime.currentVoteId !== null) {
          try {
            const service = await getRealtimeServiceSafely();
            if (service) {
              // 구독 해제
              service.unsubscribeFromVote(realtime.currentVoteId);
              
              if (process.env.NODE_ENV === 'development') {
                console.log(`[VoteStore] 실시간 연결 중지: 투표 ${realtime.currentVoteId}`);
              }
            }
          } catch (error) {
            console.error('[VoteStore] 실시간 연결 해제 실패:', error);
          }
        }
        
        // 리스너 제거
        if (eventListener) {
          try {
            const service = await getRealtimeServiceSafely();
            if (service) {
              service.removeEventListener(eventListener);
            }
          } catch (error) {
            console.error('[VoteStore] 이벤트 리스너 제거 실패:', error);
          }
          eventListener = null;
        }
        
        if (statusListener) {
          try {
            const service = await getRealtimeServiceSafely();
            if (service) {
              service.removeStatusListener(statusListener);
            }
          } catch (error) {
            console.error('[VoteStore] 상태 리스너 제거 실패:', error);
          }
          statusListener = null;
        }
        
        // 상태 초기화
        set(
          (state) => ({
            realtime: {
              ...state.realtime,
              isConnected: false,
              connectionStatus: 'disconnected',
              currentVoteId: null,
            },
          }),
          false,
          'stopRealtimeConnection'
        );
      },
      
      // 실시간 이벤트 처리
      handleRealtimeEvent: (event) => {
        const { realtime, results } = get();
        
        // 이벤트 카운트 및 마지막 이벤트 업데이트
        set(
          (state) => ({
            realtime: {
              ...state.realtime,
              eventCount: state.realtime.eventCount + 1,
              lastEvent: event,
            },
          }),
          false,
          'handleRealtimeEvent:updateEvent'
        );
        
        // 자동 동기화가 비활성화되어 있으면 이벤트만 기록하고 종료
        if (!realtime.autoSync) {
          return;
        }
        
        // 이벤트 타입별 처리
        switch (event.type) {
          case 'vote_item_updated': {
            const updatedItem = event.payload.new as VoteItem;
            
            // 현재 결과에서 해당 아이템 업데이트
            const updatedVoteItems = results.voteItems.map(item => 
              item.id === updatedItem.id 
                ? { ...item, ...updatedItem }
                : item
            );
            
            // 총 투표수 재계산
            const totalVotes = updatedVoteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);
            
            // 결과 업데이트
            get().updateResults(updatedVoteItems, totalVotes);
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[VoteStore] 투표 아이템 업데이트:', updatedItem);
            }
            break;
          }
          
          case 'vote_pick_created': {
            const newPick = event.payload.new;
            
            // 해당 투표 아이템의 총 투표수 업데이트를 위해 전체 결과 새로고침
            // 실제로는 더 효율적인 방법으로 특정 아이템만 업데이트할 수 있음
            if (realtime.currentVoteId) {
              get().loadVoteResults(realtime.currentVoteId);
            }
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[VoteStore] 새 투표 생성:', newPick);
            }
            break;
          }
          
          case 'vote_updated': {
            const updatedVote = event.payload.new as Vote;
            
            // 투표 정보 업데이트
            set(
              (state) => ({
                currentVote: {
                  ...state.currentVote,
                  vote: state.currentVote.vote 
                    ? { ...state.currentVote.vote, ...updatedVote }
                    : null,
                },
              }),
              false,
              'handleRealtimeEvent:voteUpdated'
            );
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[VoteStore] 투표 정보 업데이트:', updatedVote);
            }
            break;
          }
          
          default:
            if (process.env.NODE_ENV === 'development') {
              console.log('[VoteStore] 처리되지 않은 이벤트:', event);
            }
            break;
        }
      },
      
      // 연결 상태 업데이트
      updateConnectionStatus: (status) => {
        set(
          (state) => ({
            realtime: {
              ...state.realtime,
              connectionStatus: status,
              isConnected: status === 'connected',
            },
          }),
          false,
          'updateConnectionStatus'
        );
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[VoteStore] 연결 상태 변경:', status);
        }
      },
      
      // 자동 동기화 설정
      setAutoSync: (enabled) => {
        set(
          (state) => ({
            realtime: {
              ...state.realtime,
              autoSync: enabled,
            },
          }),
          false,
          'setAutoSync'
        );
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[VoteStore] 자동 동기화:', enabled ? '활성화' : '비활성화');
        }
      },

      // API 연동 액션들
      loadVoteDetail: async (voteId) => {
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
                error: error instanceof Error ? error.message : 'Failed to load vote details',
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
    }),
    {
      name: 'vote-store',
      // 개발 환경에서만 devtools 활성화
      enabled: process.env.NODE_ENV === 'development',
    }
  )
); 