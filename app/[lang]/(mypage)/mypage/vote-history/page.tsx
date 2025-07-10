import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VoteHistoryClient from './VoteHistoryClient';

export default async function VoteHistoryPage() {
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/vote-history');
  }

  return (
    <VoteHistoryClient 
      initialUser={user}
    />
  );
} 