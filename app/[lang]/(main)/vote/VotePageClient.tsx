'use client';

import React from 'react';
import BannerList from '@/components/features/vote/BannerList';
import VoteList from '@/components/features/vote/list/VoteList';

interface VotePageClientProps {
  filter?: string;
}

const VotePageClient: React.FC<VotePageClientProps> = ({ filter }) => {
  return (
    <div className='container mx-auto px-4 py-6 space-y-4'>
      <BannerList />
      <VoteList status={filter} />
    </div>
  );
};

export default VotePageClient; 