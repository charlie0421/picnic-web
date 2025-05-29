'use client';

import React, { useCallback, useEffect } from 'react';
import VoteStatusFilter from './VoteStatusFilter';
import VoteAreaFilter from './VoteAreaFilter';
import { useVoteFilterStore, VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';
import { useRouter, useSearchParams } from 'next/navigation';

const VoteFilterSection: React.FC = () => {
  const { 
    selectedStatus, 
    selectedArea, 
    setSelectedStatus, 
    setSelectedArea 
  } = useVoteFilterStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 파라미터 업데이트 함수
  const updateUrlParams = useCallback((status: typeof selectedStatus, area: typeof selectedArea) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', status);
    params.set('area', area);
    
    // 현재 URL과 새로운 URL이 다를 때만 업데이트
    const newUrl = `?${params.toString()}`;
    const currentUrl = `?${searchParams.toString()}`;
    
    if (newUrl !== currentUrl) {
      console.log('[VoteFilterSection] URL 업데이트:', { status, area, newUrl });
      router.push(newUrl, { scroll: false });
    }
  }, [router, searchParams]);

  // 상태 변경 핸들러
  const handleStatusChange = useCallback((status: typeof selectedStatus) => {
    if (status === selectedStatus) return;
    
    console.log('[VoteFilterSection] Status 변경:', status);
    setSelectedStatus(status);
    updateUrlParams(status, selectedArea);
  }, [selectedStatus, selectedArea, setSelectedStatus, updateUrlParams]);

  // 영역 변경 핸들러
  const handleAreaChange = useCallback((area: typeof selectedArea) => {
    if (area === selectedArea) return;
    
    console.log('[VoteFilterSection] Area 변경:', area);
    setSelectedArea(area);
    updateUrlParams(selectedStatus, area);
  }, [selectedStatus, selectedArea, setSelectedArea, updateUrlParams]);

  // 초기 URL 파라미터 설정
  useEffect(() => {
    const urlStatus = searchParams.get('status') as typeof selectedStatus;
    const urlArea = searchParams.get('area') as typeof selectedArea;
    
    // URL에 파라미터가 없으면 기본값으로 설정
    if (!urlStatus || !urlArea) {
      const defaultStatus = urlStatus || selectedStatus || VOTE_STATUS.ONGOING;
      const defaultArea = urlArea || selectedArea || VOTE_AREAS.ALL;
      
      updateUrlParams(defaultStatus, defaultArea);
    }
  }, []);

  return (
    <div className='flex justify-between items-center mb-4'>
      <div className='justify-start'>
        <VoteAreaFilter
          selectedArea={selectedArea}
          onAreaChange={handleAreaChange}
        />
      </div>
      <div className='justify-end'>
        <VoteStatusFilter
          selectedStatus={selectedStatus}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
};

export default VoteFilterSection; 