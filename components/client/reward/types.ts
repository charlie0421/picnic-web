// 리워드 관련 타입 정의

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  type: RewardType;
  value: number;
  currency?: string; // 포인트, 코인 등
  imageUrl?: string;
  expiryDate?: string;
  conditions?: RewardCondition[];
  status: RewardStatus;
  createdAt: string;
  updatedAt: string;
}

export type RewardType = 'point' | 'coupon' | 'badge' | 'item' | 'experience';

export type RewardStatus = 'active' | 'inactive' | 'expired' | 'claimed';

export interface RewardCondition {
  type: 'vote_participation' | 'vote_win' | 'level' | 'achievement';
  value: string | number;
  description: string;
}

export interface UserReward {
  id: string;
  userId: string;
  rewardId: string;
  reward: RewardItem;
  claimedAt: string;
  usedAt?: string;
  status: UserRewardStatus;
}

export type UserRewardStatus = 'claimed' | 'used' | 'expired';

export interface RewardClaim {
  rewardId: string;
  userId: string;
  claimType: 'manual' | 'automatic';
  metadata?: Record<string, any>;
} 