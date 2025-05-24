'use client';

import { Badge } from '@/components/common';
import { VoteStatus as VoteStatusType } from '@/stores/voteFilterStore';
import { getVoteStatusLabel, getVoteStatusColor } from '@/components/server/utils';

export interface VoteStatusProps {
  status: VoteStatusType;
  className?: string;
}

export function VoteStatus({ status, className }: VoteStatusProps) {
  const label = getVoteStatusLabel(status);
  const colorClass = getVoteStatusColor(status);
  
  // Badge variant 매핑
  const variantMap: Record<VoteStatusType, 'info' | 'success' | 'default'> = {
    upcoming: 'info',
    ongoing: 'success',
    completed: 'default'
  };
  
  return (
    <Badge 
      variant={variantMap[status]}
      size="sm"
      className={className}
    >
      {label}
    </Badge>
  );
} 