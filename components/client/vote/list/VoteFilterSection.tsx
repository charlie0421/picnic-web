'use client';

import React, { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import VoteStatusFilter from './VoteStatusFilter';
import VoteAreaFilter from './VoteAreaFilter';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';

const VoteFilterSection: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 현재 URL 파라미터에서 상태 읽기
  const currentStatus = (searchParams.get('status') as VoteStatus) || VOTE_STATUS.ONGOING;
  const currentArea = (searchParams.get('area') as VoteArea) || VOTE_AREAS.ALL;

  // URL 업데이트 함수 - useCallback으로 안정화
  const updateURL = useCallback((newStatus: VoteStatus, newArea: VoteArea) => {
    const params = new URLSearchParams();
    params.set('status', newStatus);
    params.set('area', newArea);
    
    const newURL = `${pathname}?${params.toString()}`;
    router.push(newURL, { scroll: false });
  }, [pathname, router]);

  // 상태 변경 핸들러
  const handleStatusChange = useCallback((status: VoteStatus) => {
    updateURL(status, currentArea);
  }, [updateURL, currentArea]);

  // 지역 변경 핸들러
  const handleAreaChange = useCallback((area: VoteArea) => {
    updateURL(currentStatus, area);
  }, [updateURL, currentStatus]);

  return (
    <div className='flex justify-between items-center mb-4'>
      <div className='justify-start'>
        <VoteAreaFilter
          selectedArea={currentArea}
          onAreaChange={handleAreaChange}
        />
      </div>
      <div className='justify-end'>
        <VoteStatusFilter
          selectedStatus={currentStatus}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
};

export default VoteFilterSection; 