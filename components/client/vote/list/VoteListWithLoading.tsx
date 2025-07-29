'use client';

import React from 'react';
import OptimizedRealtimeVoteResults from './OptimizedRealtimeVoteResults';

interface VoteListWithLoadingProps {
  voteId: number;
  artistVoteId?: number;
}

const VoteListWithLoading: React.FC<VoteListWithLoadingProps> = ({ voteId, artistVoteId }) => {
  return (
    <div className="mt-6">
      <OptimizedRealtimeVoteResults 
        voteId={voteId} 
        artistVoteId={artistVoteId}
        showDebugInfo={process.env.NODE_ENV === 'development'}
        enablePerformanceMonitoring={process.env.NODE_ENV === 'development'}
      />
    </div>
  );
};

export default VoteListWithLoading; 