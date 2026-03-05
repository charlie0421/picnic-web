import { Vote, VoteItem } from '@/types/interfaces';
import {
  ConnectionState,
  ConnectionQuality,
  ThresholdConfig,
  ERROR_RATE_PENALTY,
  CONSECUTIVE_ERROR_PENALTY,
} from './vote-detail-types';

// ---------------------------------------------------------------------------
// Params interface (consumed by useVotePolling hook)
// ---------------------------------------------------------------------------

export interface UseVotePollingParams {
  vote: Vote;
  voteId: number | string;
  initialItems: VoteItem[];
  pollingInterval: number;
  enableRealtime: boolean;
}

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  maxErrorCount: 3,
  maxConsecutiveErrors: 2,
  minConnectionQuality: 70,
  realtimeRetryDelay: 30000,
  pollingInterval: 1000,
  qualityCheckInterval: 15000,
};

// ---------------------------------------------------------------------------
// Factory helpers for initial state
// ---------------------------------------------------------------------------

export function createInitialConnectionState(): ConnectionState {
  return {
    mode: 'polling',
    isConnected: false,
    lastUpdate: null,
    errorCount: 0,
    retryCount: 0,
  };
}

export function createInitialConnectionQuality(): ConnectionQuality {
  return {
    score: 100,
    latency: 0,
    errorRate: 0,
    consecutiveErrors: 0,
    consecutiveSuccesses: 0,
    lastConnectionTime: null,
    averageResponseTime: 0,
  };
}

// ---------------------------------------------------------------------------
// Pure computation: connection quality
// ---------------------------------------------------------------------------

export function computeConnectionQuality(
  prev: ConnectionQuality,
  success: boolean,
  responseTime?: number,
): ConnectionQuality {
  const newConsecutiveErrors = success ? 0 : prev.consecutiveErrors + 1;
  const newConsecutiveSuccesses = success ? prev.consecutiveSuccesses + 1 : 0;
  const newErrorRate = success
    ? Math.max(0, prev.errorRate - 0.1)
    : Math.min(1, prev.errorRate + 0.2);

  let newScore = 100;
  newScore -= newErrorRate * ERROR_RATE_PENALTY;
  newScore -= newConsecutiveErrors * CONSECUTIVE_ERROR_PENALTY;
  newScore = Math.max(0, Math.min(100, newScore));

  const newLatency = responseTime ? responseTime : prev.latency;
  const newAverageResponseTime = responseTime
    ? prev.averageResponseTime * 0.8 + responseTime * 0.2
    : prev.averageResponseTime;

  return {
    ...prev,
    score: newScore,
    latency: newLatency,
    errorRate: newErrorRate,
    consecutiveErrors: newConsecutiveErrors,
    consecutiveSuccesses: newConsecutiveSuccesses,
    lastConnectionTime: success ? new Date() : prev.lastConnectionTime,
    averageResponseTime: newAverageResponseTime,
  };
}

// ---------------------------------------------------------------------------
// Transform raw vote items into the shape the UI expects
// ---------------------------------------------------------------------------

export function transformVoteItems(items: any[]): VoteItem[] {
  return items
    .filter((item: any) => !item.deleted_at)
    .map((item: any) => ({
      id: item.id,
      artist_id: item.artist_id,
      group_id: item.group_id,
      vote_id: item.vote_id,
      vote_total: item.vote_total || 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
      artist: item.artist
        ? { id: item.artist.id, name: item.artist.name, image: item.artist.image, ...item.artist }
        : null,
      name: item.artist?.name || 'Unknown',
      image_url: item.artist?.image || '',
      total_votes: item.vote_total || 0,
      rank: 0,
    }))
    .sort((a: any, b: any) => (b.total_votes || 0) - (a.total_votes || 0))
    .map((item: any, index: number) => ({ ...item, rank: index + 1 }));
}

// ---------------------------------------------------------------------------
// Build a summary object from a user's vote_pick rows
// ---------------------------------------------------------------------------

export type VotePickRow = {
  vote_item_id: number;
  amount: number | null;
  created_at: string;
};

export function buildUserVoteSummary(
  userVoteData: VotePickRow[],
  shouldLog?: boolean,
): any | null {
  if (!userVoteData || userVoteData.length === 0) return null;

  if (userVoteData.length > 1 && shouldLog) {
    console.log(`[Polling] 사용자가 ${userVoteData.length}번 투표함:`, userVoteData);
    return {
      totalVotes: userVoteData.reduce((sum, vote) => sum + (vote.amount || 0), 0),
      voteCount: userVoteData.length,
      lastVoteItem: userVoteData[0].vote_item_id,
      allVoteItems: Array.from(new Set(userVoteData.map(v => v.vote_item_id))),
      votes: userVoteData,
    };
  }

  return {
    totalVotes: userVoteData[0].amount || 0,
    voteCount: 1,
    lastVoteItem: userVoteData[0].vote_item_id,
    allVoteItems: [userVoteData[0].vote_item_id],
    votes: userVoteData,
  };
}
