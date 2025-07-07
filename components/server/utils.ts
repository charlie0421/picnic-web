import { Vote, VoteItem } from '@/types/interfaces';
import { formatVotePeriodWithTimeZone } from '@/utils/date';

export type VoteStatus = 'upcoming' | 'ongoing' | 'completed';

export interface VoteResult {
  voteItemId: number;
  title: string;
  voteCount: number;
  percentage: number;
  rank: number;
}

/**
 * 투표 상태를 결정하는 함수
 */
export function getVoteStatus(vote: Vote): VoteStatus {
  const now = new Date();
  const startDate = vote.start_at ? new Date(vote.start_at) : null;
  const endDate = vote.stop_at ? new Date(vote.stop_at) : null;

  if (!startDate || !endDate) {
    return 'upcoming';
  }

  if (now < startDate) {
    return 'upcoming';
  } else if (now >= startDate && now <= endDate) {
    return 'ongoing';
  } else {
    return 'completed';
  }
}

/**
 * 투표 종료까지 남은 시간을 계산하는 함수
 */
export function getRemainingTime(endTime: string | null): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  if (!endTime) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

/**
 * 투표 항목의 퍼센티지를 계산하는 함수
 */
export function calculateVotePercentage(voteItem: VoteItem, totalVotes: number): number {
  if (totalVotes === 0) return 0;
  const itemVotes = voteItem.vote_total || 0;
  return Math.round((itemVotes / totalVotes) * 100);
}

/**
 * 투표 항목들을 정렬하는 함수
 */
export function sortVoteItems(items: VoteItem[], sortBy: 'votes' | 'id' = 'votes'): VoteItem[] {
  const sortedItems = [...items];
  
  if (sortBy === 'votes') {
    return sortedItems.sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0));
  } else {
    return sortedItems.sort((a, b) => a.id - b.id);
  }
}

/**
 * 남은 시간을 포맷팅하는 함수
 */
export function formatRemainingTime(remaining: {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}): string {
  if (remaining.days > 0) {
    return `${remaining.days}일 ${remaining.hours}시간`;
  } else if (remaining.hours > 0) {
    return `${remaining.hours}시간 ${remaining.minutes}분`;
  } else if (remaining.minutes > 0) {
    return `${remaining.minutes}분 ${remaining.seconds}초`;
  } else {
    return `${remaining.seconds}초`;
  }
}

/**
 * 투표 날짜 범위를 포맷팅하는 함수 (시간대 정보 포함)
 */
export function formatVoteDateRange(startDate: string | null, endDate: string | null, language: string = 'ko'): string {
  if (!startDate || !endDate) return '날짜 미정';
  
  try {
    return formatVotePeriodWithTimeZone(startDate, endDate, language);
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    // 폴백: 기존 방식
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return `${start.toLocaleString('ko-KR', options)} ~ ${end.toLocaleString('ko-KR', options)}`;
  }
}

/**
 * 투표 가능 여부를 확인하는 함수
 */
export function canVote(vote: Vote): boolean {
  const status = getVoteStatus(vote);
  return status === 'ongoing';
}

/**
 * 전체 투표수를 계산하는 함수
 */
export function calculateTotalVotes(voteItems: VoteItem[]): number {
  return voteItems.reduce((total, item) => total + (item.vote_total || 0), 0);
}

/**
 * 투표 결과를 순위별로 정렬합니다
 */
export function sortVoteResults(items: VoteItem[]): VoteResult[] {
  const totalVotes = calculateTotalVotes(items);
  
  return items
    .map(item => ({
      voteItemId: item.id,
      title: item.artist?.name ? String(item.artist.name) : `항목 ${item.id}`,
      voteCount: item.vote_total || 0,
      percentage: calculateVotePercentage(item, totalVotes),
      rank: 0
    }))
    .sort((a, b) => b.voteCount - a.voteCount)
    .map((result, index) => ({
      ...result,
      rank: index + 1
    }));
}

/**
 * 투표 상태에 따른 한국어 라벨을 반환합니다
 */
export function getVoteStatusLabel(status: VoteStatus): string {
  const labels: Record<VoteStatus, string> = {
    upcoming: '예정',
    ongoing: '진행중',
    completed: '종료'
  };
  return labels[status];
}

/**
 * 투표 상태에 따른 색상 클래스를 반환합니다
 */
export function getVoteStatusColor(status: VoteStatus): string {
  const colors: Record<VoteStatus, string> = {
    upcoming: 'text-blue-600 bg-blue-100',
    ongoing: 'text-green-600 bg-green-100',
    completed: 'text-gray-600 bg-gray-100'
  };
  return colors[status];
}

/**
 * 상위 투표 아이템을 가져오는 함수
 */
export function getTopVoteItems(items: VoteItem[], limit: number = 3): VoteItem[] {
  return items
    .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
    .slice(0, limit);
}

/**
 * 투표 결과를 포맷팅하는 함수
 */
export function formatVoteResults(items: VoteItem[]): {
  item: VoteItem;
  percentage: number;
  rank: number;
}[] {
  const totalVotes = calculateTotalVotes(items);
  const sorted = sortVoteItems(items, 'votes');
  
  return sorted.map((item, index) => ({
    item,
    percentage: calculateVotePercentage(item, totalVotes),
    rank: index + 1,
  }));
}

/**
 * 투표 시작까지 남은 시간을 포맷팅하는 함수
 */
export function formatTimeUntilStart(startTime: string | null): string {
  if (!startTime) return '시작 시간 미정';
  
  const now = new Date();
  const start = new Date(startTime);
  const diff = start.getTime() - now.getTime();
  
  if (diff <= 0) return '시작됨';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}일 후 시작`;
  if (hours > 0) return `${hours}시간 후 시작`;
  return `${minutes}분 후 시작`;
} 