import { VoteItem } from '@/types/interfaces';

/** Duration for vote change animation display (ms) */
export const VOTE_CHANGE_ANIMATION_MS = 3000;

export interface VoteRankCardProps {
  item: VoteItem & {
    artist?: any;
    rank?: number;
    _realtimeInfo?: {
      isHighlighted?: boolean;
      rankChange?: 'up' | 'down' | 'same' | 'new';
      isNew?: boolean;
      isUpdated?: boolean;
    };
  };
  rank: number;
  className?: string;
  showVoteChange?: boolean;
  voteChange?: number;
  isAnimating?: boolean;
  voteTotal?: number;
  voteDisplay?: string;
  onVoteChange?: (newTotal: number) => void;
  enableMotionAnimations?: boolean;
}

export function getFullWidthSize(rank: number) {
  switch (rank) {
    case 1:
      return {
        image: 'md:w-32 md:h-32 sm:w-32 sm:h-32',
        padding: 'p-2 sm:p-3',
        name: 'text-sm',
        votes: 'text-sm',
      };
    case 2:
      return {
        image: 'w-24 h-24 sm:w-20 sm:h-20',
        padding: 'p-1 sm:p-2',
        name: 'text-xs',
        votes: 'text-xs',
      };
    case 3:
      return {
        image: 'w-10 h-10 sm:w-13 sm:h-13',
        padding: 'p-1',
        name: 'text-xs',
        votes: 'text-xs',
      };
    default:
      return {
        image: 'w-12 h-12',
        padding: 'p-1',
        name: 'text-xs',
        votes: 'text-xs',
      };
  }
}

/**
 * Returns rank-based gradient/border/shadow class string.
 * Shared by both the static and animated rendering paths.
 */
export function getRankStyles(rank: number, isUpdated?: boolean): string {
  if (rank === 1) {
    return `bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 ${
      isUpdated ? 'border-green-400 shadow-green-200' : 'border-yellow-300'
    } shadow-xl`;
  }
  if (rank === 2) {
    return `bg-gradient-to-br from-gray-50 to-gray-100 border ${
      isUpdated ? 'border-green-400 shadow-green-200' : 'border-gray-300'
    } shadow-lg`;
  }
  return `bg-gradient-to-br from-amber-50 to-amber-100 border ${
    isUpdated ? 'border-green-400 shadow-green-200' : 'border-amber-300'
  } shadow-lg`;
}
