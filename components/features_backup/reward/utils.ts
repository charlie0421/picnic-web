import { RewardItem, RewardType, RewardStatus, UserReward } from './types';

/**
 * 리워드 아이콘을 반환하는 함수
 */
export function getRewardIcon(type: RewardType): string {
  const icons: Record<RewardType, string> = {
    point: '💰',
    coupon: '🎟️',
    badge: '🏅',
    item: '🎁',
    experience: '⭐'
  };
  
  return icons[type] || '🎁';
}

/**
 * 리워드 상태별 색상 클래스 반환
 */
export function getRewardStatusColor(status: RewardStatus): string {
  const colors = {
    active: 'text-green-600 bg-green-100',
    inactive: 'text-gray-600 bg-gray-100',
    expired: 'text-red-600 bg-red-100',
    claimed: 'text-blue-600 bg-blue-100'
  };
  
  return colors[status] || 'text-gray-600 bg-gray-100';
}

/**
 * 리워드 만료 여부를 확인하는 함수
 */
export function isRewardExpired(reward: RewardItem): boolean {
  if (!reward.expiryDate) return false;
  
  const now = new Date();
  const expiryDate = new Date(reward.expiryDate);
  
  return now > expiryDate;
}

/**
 * 리워드 만료까지 남은 시간 계산
 */
export function getTimeUntilExpiry(expiryDate: string): string {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();
  
  if (diff <= 0) return '만료됨';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}일 ${hours}시간 남음`;
  } else if (hours > 0) {
    return `${hours}시간 남음`;
  } else {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}분 남음`;
  }
}

/**
 * 리워드 값을 포맷하는 함수
 */
export function formatRewardValue(reward: RewardItem): string {
  switch (reward.type) {
    case 'point':
      return `${reward.value.toLocaleString()} ${reward.currency || '포인트'}`;
    case 'coupon':
      return `${reward.value}% 할인`;
    case 'badge':
      return reward.title;
    case 'item':
      return `${reward.title} x${reward.value}`;
    case 'experience':
      return `${reward.value.toLocaleString()} EXP`;
    default:
      return String(reward.value);
  }
}

/**
 * 사용자가 리워드를 받을 수 있는지 확인
 */
export function canClaimReward(reward: RewardItem): boolean {
  return reward.status === 'active' && !isRewardExpired(reward);
}

/**
 * 사용자 리워드 필터링
 */
export function filterUserRewards(
  rewards: UserReward[],
  filter: 'all' | 'available' | 'used' | 'expired'
): UserReward[] {
  switch (filter) {
    case 'available':
      return rewards.filter(r => r.status === 'claimed' && !r.usedAt);
    case 'used':
      return rewards.filter(r => r.status === 'used');
    case 'expired':
      return rewards.filter(r => r.status === 'expired');
    default:
      return rewards;
  }
}

/**
 * 리워드 정렬
 */
export function sortRewards(
  rewards: RewardItem[],
  sortBy: 'value' | 'expiry' | 'created' = 'created'
): RewardItem[] {
  return [...rewards].sort((a, b) => {
    switch (sortBy) {
      case 'value':
        return b.value - a.value;
      case 'expiry':
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default:
        return 0;
    }
  });
}

/**
 * 리워드 조건을 충족하는지 확인하는 함수 (예시)
 */
export function checkRewardConditions(
  reward: RewardItem,
  userContext: {
    voteCount?: number;
    level?: number;
    achievements?: string[];
  }
): boolean {
  if (!reward.conditions || reward.conditions.length === 0) {
    return true;
  }
  
  return reward.conditions.every(condition => {
    switch (condition.type) {
      case 'vote_participation':
        return (userContext.voteCount || 0) >= Number(condition.value);
      case 'level':
        return (userContext.level || 0) >= Number(condition.value);
      case 'achievement':
        return userContext.achievements?.includes(String(condition.value)) || false;
      default:
        return false;
    }
  });
} 