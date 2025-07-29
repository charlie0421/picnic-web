'use client';

import { useEffect, useRef, useCallback, useState, useReducer, useMemo } from 'react';
import { useRealtimeSSE } from './useRealtimeSSE';
import { 
  VoteRealtimeEvent, 
  ConnectionStatus,
  ConnectionInfo,
} from '@/lib/supabase/realtime';
import { VoteItem } from '@/types/interfaces';
import { useVoteStore } from '@/stores/voteStore';

function useDebounce<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]) as T;
}

function useThrottle<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRunRef.current >= delay) {
      lastRunRef.current = now;
      callback(...args);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = Date.now();
        callback(...args);
      }, delay - (now - lastRunRef.current));
    }
  }, [callback, delay]) as T;
}

interface VoteRealtimeState {
  voteItems: VoteItem[] | null;
  totalVotes: number | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  lastEvent: VoteRealtimeEvent | null;
  eventCount: number;
  connectionStatus: ConnectionStatus;
  connectionInfo: ConnectionInfo;
}

type VoteRealtimeAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: Error | null }
  | { type: 'SET_VOTE_DATA'; payload: { voteItems: VoteItem[] | null; totalVotes: number | null } }
  | { type: 'SET_CONNECTION_STATUS'; payload: { status: ConnectionStatus; error?: string } }
  | { type: 'SET_EVENT'; payload: VoteRealtimeEvent };

function voteRealtimeReducer(state: VoteRealtimeState, action: VoteRealtimeAction): VoteRealtimeState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_VOTE_DATA':
      return {
        ...state,
        voteItems: action.payload.voteItems,
        totalVotes: action.payload.totalVotes,
        lastUpdated: new Date(),
        isLoading: false,
      };
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.payload.status,
        connectionInfo: {
            ...state.connectionInfo,
            status: action.payload.status,
        }
      };
    case 'SET_EVENT':
      return {
        ...state,
        lastEvent: action.payload,
        eventCount: state.eventCount + 1,
        lastUpdated: new Date(),
      };
    default:
      return state;
  }
}

const createInitialState = (): VoteRealtimeState => ({
  voteItems: null,
  totalVotes: null,
  isLoading: true,
  error: null,
  lastUpdated: null,
  lastEvent: null,
  eventCount: 0,
  connectionStatus: 'disconnected',
  connectionInfo: {
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: 0,
    isOnline: true,
    isVisible: true,
  },
});

export function useVoteRealtimeOptimized(options: any = {}): any {
  const { voteId, artistVoteId, enabled = true, onVoteUpdate, onError } = options;
  
  const [state, dispatch] = useReducer(voteRealtimeReducer, createInitialState());
  const { loadVoteResults } = useVoteStore();

  const refreshData = useCallback(async () => {
    if (!voteId) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await loadVoteResults(voteId);
      const currentResults = useVoteStore.getState().results;
      dispatch({
        type: 'SET_VOTE_DATA',
        payload: {
          voteItems: currentResults.voteItems,
          totalVotes: currentResults.totalVotes
        }
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load vote data');
      dispatch({ type: 'SET_ERROR', payload: error });
      onError?.(error);
    }
  }, [voteId, loadVoteResults, onError]);

  const throttledEventHandler = useThrottle(
    useCallback((event: any) => {
      const sseEvent = event as { type: string; eventType: string; new: any };
      const wrappedEvent: VoteRealtimeEvent = {
          type: `${sseEvent.type}_${sseEvent.eventType.toLowerCase()}` as any,
          payload: sseEvent as any,
      };
      dispatch({ type: 'SET_EVENT', payload: wrappedEvent });
      onVoteUpdate?.(wrappedEvent);

      if (wrappedEvent.type === 'vote_item_updated' || wrappedEvent.type === 'vote_pick_created') {
          refreshData().catch(console.error);
      }
    }, [onVoteUpdate, refreshData]),
    1000
  );

  const { isConnected: isVoteConnected, error: voteError } = useRealtimeSSE({
    channel: 'vote',
    channelId: (enabled && voteId) ? voteId : '',
    onEvent: throttledEventHandler,
  });

  const { isConnected: isArtistVoteConnected, error: artistVoteError } = useRealtimeSSE({
    channel: 'artist-vote',
    channelId: (enabled && artistVoteId) ? artistVoteId : '',
    onEvent: throttledEventHandler,
  });

  useEffect(() => {
    const isConnected = isVoteConnected || isArtistVoteConnected;
    const error = voteError || artistVoteError;
    const status: ConnectionStatus = isConnected ? 'connected' : error ? 'error' : 'disconnected';
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status, error: error || undefined } });
  }, [isVoteConnected, isArtistVoteConnected, voteError, artistVoteError]);

  useEffect(() => {
    if (enabled && voteId) {
      refreshData();
    }
  }, [enabled, voteId, refreshData]);
  
  return {
    voteItems: state.voteItems,
    totalVotes: state.totalVotes,
    isLoading: state.isLoading,
    connectionStatus: state.connectionStatus,
    isConnected: state.connectionStatus === 'connected',
    lastEvent: state.lastEvent,
    eventCount: state.eventCount,
    error: state.error,
    refreshData,
  };
} 