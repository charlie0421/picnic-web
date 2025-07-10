import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PostsClient from './PostsClient';

export default async function PostsPage() {
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/posts');
  }

  return (
    <PostsClient 
      initialUser={user}
    />
  );
} 