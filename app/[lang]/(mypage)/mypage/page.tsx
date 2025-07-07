import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserProfiles } from '@/types/interfaces';
import MyPageClient from './MyPageClient';

// 🚀 서버 컴포넌트로 변경: 토큰 관리 문제 해결
export default async function MyPage({ params }: { params: Promise<{ lang: string }> }) {
  // Next.js 15에서 params는 Promise 타입
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리 - 토큰 관리 불필요
  const user = await getServerUser();
  
  // 로그아웃 상태에서도 접근 허용 (리다이렉트 제거)
  // if (!user) {
  //   redirect('/login?returnTo=/mypage');
  // }

  // 사용자 프로필도 서버에서 미리 가져오기 (로그인 상태일 때만)
  let userProfile: UserProfiles | null = null;
  if (user) {
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
  }

  // 서버사이드에서 번역 로드
  let localeMessages: Record<string, string> = {};
  try {
    localeMessages = await import(`../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`../../../../public/locales/en.json`).then(m => m.default);
  }
  
  // 필요한 번역 키들을 추출
  const translations = {
    error_logout: localeMessages.error_logout || 'Logout error',
    label_default_user: localeMessages.label_default_user || 'User',
    label_default_email: localeMessages.label_default_email || 'user@example.com',
    label_default_email_message: localeMessages.label_default_email_message || 'No email provided',
    label_mypage_provider_profile: localeMessages.label_mypage_provider_profile || 'Profile',
    label_mypage_provider_google: localeMessages.label_mypage_provider_google || 'Google',
    label_mypage_provider_apple: localeMessages.label_mypage_provider_apple || 'Apple',
    label_mypage_provider_kakao: localeMessages.label_mypage_provider_kakao || 'Kakao',
    label_mypage_provider_wechat: localeMessages.label_mypage_provider_wechat || 'WeChat',
    label_mypage_provider_default: localeMessages.label_mypage_provider_default || 'Email',
    label_mypage_account_management: localeMessages.label_mypage_account_management || 'Account Management',
    label_mypage_edit_profile: localeMessages.label_mypage_edit_profile || 'Edit Profile',
    label_debug: localeMessages.label_debug || 'Debug',
    label_mypage_logout: localeMessages.label_mypage_logout || 'Logout',
    label_mypage_activity_history: localeMessages.label_mypage_activity_history || 'Activity History',
    label_mypage_my_votes: localeMessages.label_mypage_my_votes || 'My Votes',
    label_mypage_my_posts: localeMessages.label_mypage_my_posts || 'My Posts',
    label_mypage_my_comments: localeMessages.label_mypage_my_comments || 'My Comments',
    label_mypage_service_info: localeMessages.label_mypage_service_info || 'Service Information',
    label_mypage_menu_service: localeMessages.label_mypage_menu_service || 'Service',
    label_mypage_notice: localeMessages.label_mypage_notice || 'Notice',
    label_mypage_notice_desc: localeMessages.label_mypage_notice_desc || 'Service announcements',
    label_mypage_faq: localeMessages.label_mypage_faq || 'FAQ',
    label_mypage_faq_desc: localeMessages.label_mypage_faq_desc || 'Frequently asked questions',
    label_mypage_menu_policy: localeMessages.label_mypage_menu_policy || 'Policy',
    label_mypage_terms_of_use: localeMessages.label_mypage_terms_of_use || 'Terms of Use',
    label_mypage_terms_desc: localeMessages.label_mypage_terms_desc || 'Service terms',
    label_mypage_privacy_policy: localeMessages.label_mypage_privacy_policy || 'Privacy Policy',
    label_mypage_privacy_desc: localeMessages.label_mypage_privacy_desc || 'Privacy policy information',
    label_mypage_withdrawal: localeMessages.label_mypage_withdrawal || 'Account Withdrawal',
    label_mypage_withdrawal_desc: localeMessages.label_mypage_withdrawal_desc || 'Delete account',
    label_loading: localeMessages.label_loading || 'Loading...',
    label_mypage_edit_profile_desc: localeMessages.label_mypage_edit_profile_desc || 'Update your profile',
    label_mypage_logout_desc: localeMessages.label_mypage_logout_desc || 'Sign out of your account',
    label_mypage_my_votes_desc: localeMessages.label_mypage_my_votes_desc || 'View your voting history',
    label_mypage_my_posts_desc: localeMessages.label_mypage_my_posts_desc || 'View your posts',
    label_mypage_my_comments_desc: localeMessages.label_mypage_my_comments_desc || 'View your comments',
    label_mypage_star_candy: localeMessages.label_mypage_star_candy || 'Star Candy',
    label_mypage_star_candy_bonus: localeMessages.label_mypage_star_candy_bonus || 'Bonus',
    label_mypage_star_candy_total: localeMessages.label_mypage_star_candy_total || 'Total',
    label_mypage_guest_welcome: localeMessages.label_mypage_guest_welcome || 'Welcome to Picnic!',
    label_mypage_guest_description: localeMessages.label_mypage_guest_description || 'Sign in to unlock more features',
    label_mypage_guest_login_button: localeMessages.label_mypage_guest_login_button || 'Sign In',
    label_mypage_guest_login_benefits: localeMessages.label_mypage_guest_login_benefits || 'Sign in to enjoy these features:',
    label_mypage_guest_benefit_1: localeMessages.label_mypage_guest_benefit_1 || 'Vote for your favorite artists',
    label_mypage_guest_benefit_2: localeMessages.label_mypage_guest_benefit_2 || 'Recharge and manage Star Candy',
    label_mypage_guest_benefit_3: localeMessages.label_mypage_guest_benefit_3 || 'Profile settings and activity history',
    label_mypage_guest_benefit_4: localeMessages.label_mypage_guest_benefit_4 || 'Personalized content recommendations',
    label_mypage_guest_profile_placeholder: localeMessages.label_mypage_guest_profile_placeholder || 'Guest User'
  };

  // 클라이언트 컴포넌트에 초기 데이터와 번역 전달 (user는 null일 수 있음)
  return (
    <MyPageClient 
      initialUser={user} 
      initialUserProfile={userProfile}
      translations={translations}
    />
  );
}
