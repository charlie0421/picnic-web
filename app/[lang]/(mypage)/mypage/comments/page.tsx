import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CommentsClient from './CommentsClient';

export default async function CommentsPage() {
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/comments');
  }

  return (
    <CommentsClient 
      initialUser={user}
    />
  );
} 