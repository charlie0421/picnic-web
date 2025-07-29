'use client';

import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { VoteRealtimeEvent, ConnectionStatus } from '@/lib/supabase/realtime';
import { useVoteRealtime } from '@/hooks/useVoteRealtime';
import { Database } from '@/types/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

// 투표 관련 타입 정의
type VoteData = Database['public']['Tables']['vote']['Row'];
type VoteItemData = Database['public']['Tables']['vote_item']['Row'];
type VotePickData = Database['public']['Tables']['vote_pick']['Row'];

// 상태 타입 정의
interface VoteRealtimeState {
  // 투표 정보
  vote: VoteData | null;
  voteItems: VoteItemData[];
  votePicks: VotePickData[];
  
  // 연결 상태
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  
  // 통계
  totalVotes: number;
  lastUpdateTime: Date | null;
  eventCount: number;
  
  // 로딩 상태
  isLoading: boolean;
  error: string | null;
}

// 액션 타입 정의
type VoteRealtimeAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_VOTE_DATA'; payload: { vote: VoteData; voteItems: VoteItemData[]; votePicks: VotePickData[] } }
  | { type: 'UPDATE_VOTE'; payload: VoteData }
  | { type: 'UPDATE_VOTE_ITEM'; payload: VoteItemData }
  | { type: 'ADD_VOTE_PICK'; payload: VotePickData }
  | { type: 'INCREMENT_EVENT_COUNT' }
  | { type: 'RESET_STATE' };

// 초기 상태
const initialState: VoteRealtimeState = {
  vote: null,
  voteItems: [],
  votePicks: [],
  connectionStatus: 'disconnected',
  isConnected: false,
  totalVotes: 0,
  lastUpdateTime: null,
  eventCount: 0,
  isLoading: false,
  error: null
};

// 리듀서 함수
function voteRealtimeReducer(state: VoteRealtimeState, action: VoteRealtimeAction): VoteRealtimeState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
      
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
      
    case 'SET_CONNECTION_STATUS':
      return { 
        ...state, 
        connectionStatus: action.payload,
        isConnected: action.payload === 'connected'
      };
      
    case 'SET_VOTE_DATA':
      const { vote, voteItems, votePicks } = action.payload;
      return {
        ...state,
        vote,
        voteItems,
        votePicks,
        totalVotes: votePicks.reduce((sum, pick) => sum + (pick.amount || 0), 0),
        lastUpdateTime: new Date(),
        isLoading: false,
        error: null
      };
      
    case 'UPDATE_VOTE':
      return {
        ...state,
        vote: action.payload,
        lastUpdateTime: new Date()
      };
      
    case 'UPDATE_VOTE_ITEM':
      const updatedItems = state.voteItems.map(item =>
        item.id === action.payload.id ? action.payload : item
      );
      return {
        ...state,
        voteItems: updatedItems,
        lastUpdateTime: new Date()
      };
      
    case 'ADD_VOTE_PICK':
      const newPicks = [...state.votePicks, action.payload];
      return {
        ...state,
        votePicks: newPicks,
        totalVotes: newPicks.reduce((sum, pick) => sum + (pick.amount || 0), 0),
        lastUpdateTime: new Date()
      };
      
    case 'INCREMENT_EVENT_COUNT':
      return {
        ...state,
        eventCount: state.eventCount + 1
      };
      
    case 'RESET_STATE':
      return initialState;
      
    default:
      return state;
  }
}

// Context 타입 정의
interface VoteRealtimeContextType extends VoteRealtimeState {
  // 액션 함수들
  loadVoteData: (voteId: number) => Promise<void>;
  resetState: () => void;
  
  // 유틸리티 함수들
  getVoteItemById: (itemId: number) => VoteItemData | undefined;
  getVotesByItemId: (itemId: number) => VotePickData[];
  getTotalVotesByItemId: (itemId: number) => number;
  getVotePercentage: (itemId: number) => number;
}

// Context 생성
const VoteRealtimeContext = createContext<VoteRealtimeContextType | null>(null);

// Provider Props 타입
interface VoteRealtimeProviderProps {
  children: ReactNode;
  voteId?: number;
  autoLoad?: boolean;
}

/**
 * 실시간 투표 데이터를 관리하는 Context Provider
 */
export function VoteRealtimeProvider({ 
  children, 
  voteId, 
  autoLoad = true 
}: VoteRealtimeProviderProps) {
  const [state, dispatch] = useReducer(voteRealtimeReducer, initialState);
  const { t } = useLocaleRouter();

  // 실시간 연결 관리
  const { connectionStatus, lastEvent, eventCount } = useVoteRealtime({
    voteId,
    autoConnect: !!voteId,
    onConnectionStatusChange: (status) => {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
    },
    onVoteUpdate: (event) => {
      handleRealtimeEvent(event);
    }
  });

  // 실시간 이벤트 처리
  const handleRealtimeEvent = useCallback((event: VoteRealtimeEvent) => {
    dispatch({ type: 'INCREMENT_EVENT_COUNT' });
    
    // payload에서 실제 데이터 추출 (Supabase Realtime v2 형식)
    const payloadData = (event.payload as any)?.new || event.payload;

    switch (event.type) {
      case 'vote_updated':
        dispatch({ type: 'UPDATE_VOTE', payload: payloadData as unknown as VoteData });
        break;
        
      case 'vote_item_updated':
        dispatch({ type: 'UPDATE_VOTE_ITEM', payload: payloadData as unknown as VoteItemData });
        break;
        
      case 'vote_pick_created':
        dispatch({ type: 'ADD_VOTE_PICK', payload: payloadData as unknown as VotePickData });
        break;
        
      default:
        console.warn(`[VoteRealtimeContext] ${t('vote.unknownEventType') || '알 수 없는 이벤트 타입'}:`, event);
    }
  }, [t]);

  // 투표 데이터 로드
  const loadVoteData = useCallback(async (targetVoteId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // TODO: 실제 API 호출로 교체
      // 현재는 더미 데이터로 대체
      const mockVote: VoteData = {
        id: targetVoteId,
        area: 'global',
        created_at: new Date().toISOString(),
        deleted_at: null,
        main_image: null,
        order: 1,
        result_image: null,
        start_at: new Date().toISOString(),
        stop_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        title: { ko: t('vote.testVote.title') || '테스트 투표', en: 'Test Vote' },
        updated_at: new Date().toISOString(),
        visible_at: new Date().toISOString(),
        vote_category: 'artist',
        vote_content: t('vote.testVote.content') || '가장 좋아하는 아티스트를 선택하세요',
        vote_sub_category: 'kpop',
        wait_image: null
      };

      const mockVoteItems: VoteItemData[] = [
        {
          id: 1,
          artist_id: 1,
          created_at: new Date().toISOString(),
          deleted_at: null,
          group_id: 1,
          updated_at: new Date().toISOString(),
          vote_id: targetVoteId,
          vote_total: 150
        },
        {
          id: 2,
          artist_id: 2,
          created_at: new Date().toISOString(),
          deleted_at: null,
          group_id: 2,
          updated_at: new Date().toISOString(),
          vote_id: targetVoteId,
          vote_total: 120
        }
      ];

      const mockVotePicks: VotePickData[] = [];

      dispatch({
        type: 'SET_VOTE_DATA',
        payload: {
          vote: mockVote,
          voteItems: mockVoteItems,
          votePicks: mockVotePicks
        }
      });
    } catch (error) {
      console.error(`[VoteRealtimeContext] ${t('vote.loadError') || '투표 데이터 로드 오류'}:`, error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error instanceof Error ? error.message : (t('vote.loadErrorMessage') || '투표 데이터를 불러오는데 실패했습니다.') 
      });
    }
  }, [t]);

  // 상태 초기화
  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // 유틸리티 함수들
  const getVoteItemById = useCallback((itemId: number) => {
    return state.voteItems.find(item => item.id === itemId);
  }, [state.voteItems]);

  const getVotesByItemId = useCallback((itemId: number) => {
    return state.votePicks.filter(pick => pick.vote_item_id === itemId);
  }, [state.votePicks]);

  const getTotalVotesByItemId = useCallback((itemId: number) => {
    return getVotesByItemId(itemId).reduce((sum, pick) => sum + (pick.amount || 0), 0);
  }, [getVotesByItemId]);

  const getVotePercentage = useCallback((itemId: number) => {
    if (state.totalVotes === 0) return 0;
    const itemVotes = getTotalVotesByItemId(itemId);
    return (itemVotes / state.totalVotes) * 100;
  }, [state.totalVotes, getTotalVotesByItemId]);

  // 자동 로드 효과
  useEffect(() => {
    if (autoLoad && voteId && connectionStatus === 'connected') {
      loadVoteData(voteId);
    }
  }, [autoLoad, voteId, connectionStatus, loadVoteData]);

  // Context 값 생성
  const contextValue: VoteRealtimeContextType = {
    ...state,
    loadVoteData,
    resetState,
    getVoteItemById,
    getVotesByItemId,
    getTotalVotesByItemId,
    getVotePercentage
  };

  return (
    <VoteRealtimeContext.Provider value={contextValue}>
      {children}
    </VoteRealtimeContext.Provider>
  );
}

/**
 * VoteRealtimeContext를 사용하는 커스텀 훅
 */
export function useVoteRealtimeContext(): VoteRealtimeContextType {
  const context = useContext(VoteRealtimeContext);
  
  if (!context) {
    throw new Error('useVoteRealtimeContext는 VoteRealtimeProvider 내부에서 사용해야 합니다.');
  }
  
  return context;
}

/**
 * 특정 투표 항목의 데이터만 반환하는 훅
 */
export function useVoteItem(itemId: number) {
  const { getVoteItemById, getTotalVotesByItemId, getVotePercentage } = useVoteRealtimeContext();
  
  return {
    voteItem: getVoteItemById(itemId),
    totalVotes: getTotalVotesByItemId(itemId),
    percentage: getVotePercentage(itemId)
  };
} 