'use client';

import dynamic from 'next/dynamic';

const LazyVoteFilterSection = dynamic(
  () => import('./VoteFilterSection'),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
        <div className="w-40 h-10 bg-gray-100 rounded-lg animate-pulse" />
        <div className="w-48 h-10 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    ),
  },
);

export function VoteFilterSectionDeferred() {
  return <LazyVoteFilterSection />;
}

export default VoteFilterSectionDeferred;

