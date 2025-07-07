'use client';

import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { User } from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';
import { useLogout } from '@/lib/auth/logout';
import Link from 'next/link';

interface MyPageClientProps {
  initialUser: User;
  initialUserProfile: UserProfiles | null;
}

// 🎯 서버에서 받은 초기 데이터 기반 클라이언트 컴포넌트
export default function MyPageClient({ initialUser, initialUserProfile }: MyPageClientProps) {
  const t = useTranslations();
  const { logout } = useLogout();

  // 디버그 모드 감지 (개발 환경 또는 로컬호스트)
  const isDebugMode = process.env.NODE_ENV === 'development' || 
    (typeof window !== 'undefined' && window.location.hostname === 'localhost');

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await logout({
        clearAllStorage: true,
        redirectTo: '/login',
        showNotification: true
      });
    } catch (error) {
      console.error(t('error_logout') || '로그아웃 중 오류:', error);
    }
  };

  // 🚀 서버에서 받은 데이터 기반으로 사용자 정보 추출 (토큰 관리 불필요)
  const getUserInfo = useCallback(() => {
    // 1. DB 프로필이 있으면 무조건 DB 사용
    if (initialUserProfile) {
      return {
        nickname: initialUserProfile.nickname || 
                 initialUserProfile.email?.split('@')[0] || 
                 initialUser?.email?.split('@')[0] || 
                 t('label_default_user') || '사용자',
        email: initialUserProfile.email || 
               initialUser?.email || 
               t('label_default_email') || '이메일 정보 없음', 
        avatar_url: initialUserProfile.avatar_url || null,
        provider: 'profile',
        source: 'userProfile'
      };
    }
    
    // 2. DB 프로필이 없을 때만 JWT 토큰 사용 (최초 로그인 시 임시)
    if (initialUser) {
      return {
        nickname: initialUser.user_metadata?.name || 
                 initialUser.user_metadata?.full_name || 
                 initialUser.email?.split('@')[0] || 
                 t('label_default_user') || '사용자',
        email: initialUser.email || t('label_default_email') || '이메일 정보 없음',
        avatar_url: initialUser.user_metadata?.avatar_url || 
                   initialUser.user_metadata?.picture || null,
        provider: initialUser.app_metadata?.provider || 'unknown',
        source: 'token'
      };
    }

    // 3. 기본값 (이 경우는 발생하지 않아야 함 - 서버에서 이미 체크)
    return {
      nickname: t('label_default_user') || '사용자',
      email: t('label_default_email_message') || '로그인 후에 이메일이 표시됩니다',
      avatar_url: null,
      provider: 'none',
      source: 'default'
    };
  }, [initialUserProfile, initialUser, t]);

  const userInfo = getUserInfo();

  return (
    <div className='container mx-auto px-4 py-8 max-w-4xl'>
      {/* 상단 헤더 */}
      <div className='bg-white rounded-lg shadow-md p-6 mb-8'>
        <div className='flex flex-col md:flex-row items-center gap-6'>
          {/* 프로필 이미지 */}
          <div className='relative'>
            <div className='w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1'>
              <div className='w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden'>
                {userInfo.avatar_url ? (
                  <img
                    src={userInfo.avatar_url}
                    alt={userInfo.nickname}
                    className='w-full h-full object-cover'
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`text-3xl text-gray-600 ${userInfo.avatar_url ? 'hidden' : ''}`}>
                  👤
                </div>
              </div>
            </div>
          </div>

          {/* 사용자 정보 */}
          <div className='flex-1 text-center md:text-left'>
            <h1 className='text-2xl font-bold text-gray-900 mb-2'>
              {userInfo.nickname}
            </h1>
            <p className='text-gray-600 mb-2'>{userInfo.email}</p>
            <div className='flex flex-wrap gap-2 justify-center md:justify-start'>
              <span className='px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm'>
                {userInfo.provider === 'profile' ? t('label_mypage_provider_profile') || 'DB 프로필' : 
                 userInfo.provider === 'google' ? t('label_mypage_provider_google') || 'Google' :
                 userInfo.provider === 'apple' ? t('label_mypage_provider_apple') || 'Apple' :
                 userInfo.provider === 'kakao' ? t('label_mypage_provider_kakao') || 'Kakao' :
                 userInfo.provider === 'wechat' ? t('label_mypage_provider_wechat') || 'WeChat' : t('label_mypage_provider_default') || '기본'}
              </span>
              {process.env.NODE_ENV === 'development' && (
                <span className='px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm'>
                  {userInfo.source}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className='mt-8 border-t border-gray-200 pt-6'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <h2 className='text-lg font-semibold mb-4'>{t('label_mypage_account_management') || '계정 관리'}</h2>
            <ul className='space-y-3'>
              {isDebugMode && (
                <li>
                  <Link
                    href='/mypage/edit-profile'
                    className='text-primary-600 hover:underline'
                  >
                    {t('label_mypage_edit_profile') || '프로필 수정'} ({t('label_debug') || '디버그'})
                  </Link>
                </li>
              )}
              <li>
                <button
                  onClick={handleLogout}
                  className='text-red-600 hover:underline'
                >
                  {t('label_mypage_logout') || '로그아웃'}
                </button>
              </li>
            </ul>
          </div>

          <div>
            {isDebugMode && (
              <>
                <h2 className='text-lg font-semibold mb-4'>{t('label_mypage_activity_history') || '활동 내역'} ({t('label_debug') || '디버그'})</h2>
                <ul className='space-y-3'>
                  <li>
                    <Link href='/mypage/vote-history' className='text-primary-600 hover:underline'>
                      {t('label_mypage_my_votes') || '내 투표 보기'}
                    </Link>
                  </li>
                  <li>
                    <Link href='/mypage/posts' className='text-primary-600 hover:underline'>
                      {t('label_mypage_my_posts') || '내 게시글 보기'}
                    </Link>
                  </li>
                  <li>
                    <Link href='/mypage/comments' className='text-primary-600 hover:underline'>
                      {t('label_mypage_my_comments') || '내 댓글 보기'}
                    </Link>
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 서비스 정보 */}
      <div className='bg-white rounded-lg shadow-md p-6'>
        <h2 className='text-lg font-semibold mb-4 text-gray-900'>
          {t('label_mypage_service_info') || '서비스 정보'}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <h3 className='font-medium text-gray-900 mb-3'>{t('label_mypage_menu_service')}</h3>
            <ul className='space-y-2'>
              <li>
                <Link href='/notice' className='text-primary-600 hover:underline'>
                  {t('label_mypage_notice')}
                </Link>
              </li>
              <li>
                <Link href='/faq' className='text-primary-600 hover:underline'>
                  {t('label_mypage_faq')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className='font-medium text-gray-900 mb-3'>{t('label_mypage_menu_policy')}</h3>
            <ul className='space-y-2'>
              <li>
                <Link href='/terms' className='text-primary-600 hover:underline'>
                  {t('label_mypage_terms_of_use')}
                </Link>
              </li>
              <li>
                <Link href='/privacy' className='text-primary-600 hover:underline'>
                  {t('label_mypage_privacy_policy')}
                </Link>
              </li>
              {isDebugMode && (
                <li>
                  <Link href='/mypage/withdrawal' className='text-red-600 hover:underline'>
                    {t('label_mypage_withdrawal')} ({t('label_debug') || '디버그'})
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 