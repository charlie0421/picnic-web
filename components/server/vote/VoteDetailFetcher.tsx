import 'server-only';
import React from 'react';
import { notFound } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import type { User } from '@supabase/supabase-js';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';

export interface VoteDetailFetcherProps {
  voteId: string;
  className?: string;
}

// API 라우트를 통해 데이터를 가져오는 함수
async function getVoteDetailsFromApi(voteId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_WEB_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_WEB_DOMAIN}`
    : 'http://127.0.0.1:3100';

  const res = await fetch(`${baseUrl}/api/votes/${voteId}`, {
    cache: 'no-store', // 실시간 투표 데이터를 위해 캐시 사용 안 함
  });

  if (!res.ok) {
    console.error(`Failed to fetch vote details from API, status: ${res.status}`);
    return null;
  }
  return res.json();
}

export default async function VoteDetailFetcher({ voteId, className }: VoteDetailFetcherProps) {
  const data = await getVoteDetailsFromApi(voteId);

  if (!data) {
    return notFound();
  }

  const { vote, rewards, user, userVotes } = data;
  const voteItems = vote?.vote_item || [];

  return (
    <HybridVoteDetailPresenter
      vote={vote as Vote}
      initialItems={voteItems as unknown as VoteItem[]}
      rewards={rewards as Reward[] || []}
      user={user as User | null}
      userVotes={userVotes}
      className={className}
      enableRealtime={true}
      pollingInterval={10000}
      maxRetries={3}
    />
  );
}
