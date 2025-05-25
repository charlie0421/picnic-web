'use client';

import React from 'react';

const VoteLoadingSkeleton: React.FC = () => {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8'>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className='bg-white rounded-lg shadow-sm border animate-pulse'
        >
          <div className='aspect-square bg-gray-200 rounded-t-lg'></div>
          <div className='p-4'>
            <div className='h-4 bg-gray-200 rounded mb-2'></div>
            <div className='h-3 bg-gray-200 rounded w-3/4 mb-2'></div>
            <div className='h-3 bg-gray-200 rounded w-1/2'></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VoteLoadingSkeleton; 