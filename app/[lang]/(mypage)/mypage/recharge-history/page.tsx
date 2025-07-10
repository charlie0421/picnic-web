import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RechargeHistoryClient from './RechargeHistoryClient';

export default async function RechargeHistoryPage() {
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/recharge-history');
  }

  return (
    <RechargeHistoryClient 
      initialUser={user}
    />
  );
} 