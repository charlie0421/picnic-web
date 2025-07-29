"use client";

import { useEffect, useState, useRef } from 'react';

type SseEvent = {
  type: string;
  payload: any;
};

type UseRealtimeSSEOptions = {
  channel: string; // e.g., 'vote' or 'artist-vote'
  channelId: number | string;
  onEvent: (event: SseEvent) => void;
};

export function useRealtimeSSE({
  channel,
  channelId,
  onEvent,
}: UseRealtimeSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!channel || !channelId) return;

    const url = `/api/realtime/${channel}/${channelId}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[SSE] Connection opened for ${channel}: ${channelId}`);
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        onEvent(parsedData);
      } catch (e) {
        console.error('[SSE] Failed to parse message data:', event.data, e);
      }
    };

    eventSource.onerror = (err) => {
      console.error(`[SSE] Connection error for ${channel}: ${channelId}`, err);
      setError('Connection failed. Retrying...');
      setIsConnected(false);
      // EventSource handles reconnection automatically.
    };

    return () => {
      console.log(`[SSE] Closing connection for ${channel}: ${channelId}`);
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [channel, channelId, onEvent]);

  return { isConnected, error };
} 