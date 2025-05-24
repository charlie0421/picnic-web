// 실제 프로젝트의 타입들을 import
import type { 
  Vote, 
  VoteItem, 
  VoteReward, 
  VotePick,
  VoteComment,
  VoteCommentLike,
  VoteCommentReport,
  VoteShareBonus,
  VoteAchieve,
  Artist,
  ArtistGroup,
  Reward,
  UserProfiles,
  Banner
} from '@/types/interfaces';

// re-export
export type { 
  Vote, 
  VoteItem, 
  VoteReward, 
  VotePick,
  VoteComment,
  VoteCommentLike,
  VoteCommentReport,
  VoteShareBonus,
  VoteAchieve,
  Artist,
  ArtistGroup,
  Reward,
  UserProfiles,
  Banner
};

// 추가적인 도메인 타입들 (실제 프로젝트에 없는 타입들)

// 투표 상태 타입
export type VoteStatus = 'upcoming' | 'ongoing' | 'completed';

// 투표 검색 필터
export interface VoteFilter {
  status?: VoteStatus;
  category?: string;
  search?: string;
  sortBy?: 'startTime' | 'endTime' | 'popular';
  sortOrder?: 'asc' | 'desc';
}

// 투표 결과 (집계용)
export interface VoteResult {
  voteItemId: string | number;
  title: string;
  voteCount: number;
  percentage: number;
  rank: number;
}

// 사용자 투표 기록 (간단한 버전)
export interface UserVote {
  id: string;
  userId: string;
  voteId: string | number;
  voteItemId: string | number;
  createdAt: string;
}

// 배너 타입 (추가 속성)
export interface VoteBanner extends Banner {
  voteId?: string | number;
  order: number;
  isActive?: boolean;
}

// 확장된 VoteItem 타입 (클라이언트용)
export interface EnhancedVoteItem extends VoteItem {
  artist?: Artist & { artistGroup?: ArtistGroup };
  isAnimating?: boolean;
  voteChange?: number;
} 