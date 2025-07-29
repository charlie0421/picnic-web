'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRealtimeSSE } from './useRealtimeSSE';
import {
  ConnectionStatus,
  VoteRealtimeEvent,
} from '@/lib/supabase/realtime'; // Keep types

interface UseVoteRealtimeOptions {
  voteId?: number;
  artistVoteId?: number;
  autoConnect?: boolean;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onVoteUpdate?: (event: VoteRealtimeEvent) => void;
}

interface UseVoteRealtimeReturn {
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  lastEvent: VoteRealtimeEvent | null;
  eventCount: number;
}

export function useVoteRealtime(
  options: UseVoteRealtimeOptions = {}
): UseVoteRealtimeReturn {
  const { voteId, artistVoteId, autoConnect = true, onVoteUpdate } = options;

  const [lastEvent, setLastEvent] = useState<VoteRealtimeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const handleEvent = useCallback((event: any) => {
    // The event from SSE is the direct payload, we need to wrap it
    const wrappedEvent: VoteRealtimeEvent = {
      type: `${event.type}_${event.eventType.toLowerCase()}`,
      payload: event,
    } as any;
      
    setLastEvent(wrappedEvent);
    setEventCount((prev) => prev + 1);
    onVoteUpdate?.(wrappedEvent);
  }, [onVoteUpdate]);

  const voteSse = useRealtimeSSE({
    channel: 'vote',
    channelId: voteId || '',
    onEvent: handleEvent,
  });

  const artistVoteSse = useRealtimeSSE({
    channel: 'artist-vote',
    channelId: artistVoteId || '',
    onEvent: handleEvent,
  });

  const isConnected = voteSse.isConnected || artistVoteSse.isConnected;
  const error = voteSse.error || artistVoteSse.error;
  
  const connectionStatus: ConnectionStatus = isConnected ? 'connected' : error ? 'error' : 'disconnected';

  return {
    connectionStatus,
    isConnected,
    lastEvent,
    eventCount,
  };
}

/**
 * 투표 실시간 연결 상태만 추적하는 간단한 훅
 * 
 * @param voteId 투표 ID
 * @returns 연결 상태 정보
 */
export function useVoteConnectionStatus(voteId?: number) {
  const { connectionStatus, isConnected } = useVoteRealtime({
    voteId,
    autoConnect: !!voteId,
  });

  return {
    connectionStatus,
    isConnected,
  };
}

/**
 * 투표 이벤트만 수신하는 훅
 * 
 * @param voteId 투표 ID
 * @param onEvent 이벤트 콜백
 * @returns 이벤트 정보
 */
export function useVoteEvents(
  voteId: number | undefined,
  onEvent?: (event: VoteRealtimeEvent) => void
) {
  const { lastEvent, eventCount, isConnected } = useVoteRealtime({
    voteId,
    autoConnect: !!voteId,
    onVoteUpdate: onEvent
  });

  return {
    lastEvent,
    eventCount,
    isConnected
  };
} 