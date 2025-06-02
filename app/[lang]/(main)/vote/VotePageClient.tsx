'use client';

import React from 'react';
import { VoteList } from '@/components/client/vote/list';
import { useVoteFilterStore } from '@/stores/voteFilterStore';

/**
 * 클라이언트 사이드 투표 페이지 컴포넌트
 * 테스트 목적으로 생성된 컴포넌트입니다.
 */
export default function VotePageClient() {
  const { selectedStatus, selectedArea } = useVoteFilterStore();

  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      {/* 투표 섹션 */}
      <section>
        <VoteList
          className="w-full"
          useStore={true}
        />
      </section>
    </main>
  );
}