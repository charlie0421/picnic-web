import React from 'react';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserProfiles } from '@/types/interfaces';
import { getTranslations } from 'next-intl/server';
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

  // 클라이언트 컴포넌트에서 필요한 모든 번역 준비
  const t = await getTranslations();
  const translations = {
    error_logout: t('error_logout'),
    label_default_user: t('label_default_user'),
    label_default_email: t('label_default_email'),
    label_default_email_message: t('label_default_email_message'),
    label_mypage_provider_profile: t('label_mypage_provider_profile'),
    label_mypage_provider_google: t('label_mypage_provider_google'),
    label_mypage_provider_apple: t('label_mypage_provider_apple'),
    label_mypage_provider_kakao: t('label_mypage_provider_kakao'),
    label_mypage_provider_wechat: t('label_mypage_provider_wechat'),
    label_mypage_provider_default: t('label_mypage_provider_default'),
    label_mypage_account_management: t('label_mypage_account_management'),
    label_mypage_edit_profile: t('label_mypage_edit_profile'),
    label_debug: t('label_debug'),
    label_mypage_logout: t('label_mypage_logout'),
    label_mypage_activity_history: t('label_mypage_activity_history'),
    label_mypage_my_votes: t('label_mypage_my_votes'),
    label_mypage_my_posts: t('label_mypage_my_posts'),
    label_mypage_my_comments: t('label_mypage_my_comments'),
    label_mypage_service_info: t('label_mypage_service_info'),
    label_mypage_menu_service: t('label_mypage_menu_service'),
    label_mypage_notice: t('label_mypage_notice'),
    label_mypage_faq: t('label_mypage_faq'),
    label_mypage_menu_policy: t('label_mypage_menu_policy'),
    label_mypage_terms_of_use: t('label_mypage_terms_of_use'),
    label_mypage_privacy_policy: t('label_mypage_privacy_policy'),
    label_mypage_withdrawal: t('label_mypage_withdrawal')
  };

  // 클라이언트 컴포넌트에 초기 데이터와 번역 전달
  return (
    <MyPageClient 
      initialUser={user} 
      initialUserProfile={userProfile}
      translations={translations}
    />
  );
}
