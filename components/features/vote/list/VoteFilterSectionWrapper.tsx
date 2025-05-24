'use client';

import React, { Suspense } from 'react';
import VoteFilterSection from './VoteFilterSection';

// VoteFilterSection을 위한 로딩 컴포넌트
const VoteFilterSectionSkeleton = () => (
  <div className='flex justify-between items-center mb-4'>
    <div className='justify-start'>
      {/* 영역 필터 스켈레톤 */}
      <div className='flex space-x-2'>
        <div className='h-8 w-16 bg-gray-200 rounded animate-pulse'></div>
        <div className='h-8 w-20 bg-gray-200 rounded animate-pulse'></div>
        <div className='h-8 w-18 bg-gray-200 rounded animate-pulse'></div>
      </div>
    </div>
    <div className='justify-end'>
      {/* 상태 필터 스켈레톤 */}
      <div className='flex space-x-2'>
        <div className='h-8 w-16 bg-gray-200 rounded animate-pulse'></div>
        <div className='h-8 w-12 bg-gray-200 rounded animate-pulse'></div>
        <div className='h-8 w-12 bg-gray-200 rounded animate-pulse'></div>
      </div>
    </div>
  </div>
);

const VoteFilterSectionWrapper: React.FC = () => {
  return (
    <Suspense fallback={<VoteFilterSectionSkeleton />}>
      <VoteFilterSection />
    </Suspense>
  );
};

export default VoteFilterSectionWrapper; 