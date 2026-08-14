'use client';

import React, { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import VoteStatusFilter from './VoteStatusFilter';
import VoteAreaFilter from './VoteAreaFilter';
import {
  VoteStatus,
  VoteArea,
  normalizeVoteStatus,
  normalizeVoteArea,
} from '@/stores/voteFilterStore';

/**
 * 투표 목록 필터.
 *
 * 앱 `VoteListContent` 와 같은 배치 — 위에 종류 태그 칩(가로 스크롤),
 * 아래 오른쪽에 상태 드롭다운. 필터의 진실은 URL 쿼리이며 저장하지 않는다.
 */
const VoteFilterSection: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 현재 URL 파라미터에서 상태 읽기. 알 수 없는 값이 오면 기본값으로 좁힌다.
  const currentStatus = normalizeVoteStatus(searchParams.get('status'));
  const currentArea = normalizeVoteArea(searchParams.get('area'));

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
    <div className='mb-4 flex flex-col gap-2.5'>
      <VoteAreaFilter
        selectedArea={currentArea}
        onAreaChange={handleAreaChange}
      />
      <div className='flex justify-end'>
        <VoteStatusFilter
          selectedStatus={currentStatus}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
};

export default VoteFilterSection;
