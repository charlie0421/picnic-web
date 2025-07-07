import React from 'react';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserProfiles } from '@/types/interfaces';
import MyPageClient from './MyPageClient';

// 🚀 서버 컴포넌트로 변경: 토큰 관리 문제 해결
export default async function MyPage() {
  // 서버 사이드에서 인증 처리 - 토큰 관리 불필요
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage');
  }

  // 사용자 프로필도 서버에서 미리 가져오기
  let userProfile: UserProfiles | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    userProfile = data;
  } catch (error) {
    console.warn('사용자 프로필 로드 실패:', error);
  }

  // 클라이언트 컴포넌트에 초기 데이터 전달
  return (
    <MyPageClient 
      initialUser={user} 
      initialUserProfile={userProfile}
    />
  );
}
