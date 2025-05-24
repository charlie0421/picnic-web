'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vote, VoteFilter, VoteStatus } from '../types';
import { getVoteStatus } from '../../../server/utils';
import { VoteCard } from '../common/VoteCard';
import { Badge } from '@/components/common';

export interface VoteListPresenterProps {
  votes: Vote[];
  filter?: VoteFilter;
  onVoteClick?: (voteId: string | number) => void;
  className?: string;
}

export function VoteListPresenter({ 
  votes, 
  filter,
  onVoteClick,
  className 
}: VoteListPresenterProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<VoteStatus | 'all'>('all');
  
  const filteredVotes = votes.filter(vote => {
    if (selectedStatus === 'all') return true;
    const voteStatus = getVoteStatus(vote);
    return voteStatus === selectedStatus;
  });
  
  const statusOptions: Array<{ value: VoteStatus | 'all'; label: string }> = [
    { value: 'all', label: '전체' },
    { value: 'ongoing', label: '진행중' },
    { value: 'upcoming', label: '예정' },
    { value: 'completed', label: '종료' }
  ];

  const handleVoteClick = (voteId: string | number) => {
    if (onVoteClick) {
      onVoteClick(voteId);
    } else {
      // 기본 라우팅 동작
      router.push(`/vote/${voteId}`);
    }
  };
  
  return (
    <div className={className}>
      {/* 필터 탭 */}
      <div className="flex gap-2 mb-6">
        {statusOptions.map(option => (
          <button
            key={option.value}
            onClick={() => setSelectedStatus(option.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedStatus === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      
      {/* 투표 목록 */}
      {filteredVotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVotes.map(vote => (
            <VoteCard
              key={vote.id}
              vote={vote}
              onClick={() => handleVoteClick(vote.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">표시할 투표가 없습니다.</p>
        </div>
      )}
    </div>
  );
} 