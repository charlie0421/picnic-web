'use client';

import React from 'react';
import BannerList from '@/components/features/vote/BannerList';
import VoteList from '@/components/features/vote/list/VoteList';
import { Vote } from '@/types/interfaces';

interface VotePageClientProps {
  filter?: string;
  initialVotes?: Vote[];
}

const VotePageClient: React.FC<VotePageClientProps> = ({
  filter,
  initialVotes,
}) => {
  return (
    <div className='container mx-auto px-4 py-6 space-y-4'>
      <BannerList />
      <VoteList status={filter} initialVotes={initialVotes} />
    </div>
  );
};

export default VotePageClient;
