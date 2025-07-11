'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';
import { useQuickLogout } from '@/lib/auth/logout';
import Link from 'next/link';


interface Translations {
  error_logout: string;
  label_default_user: string;
  label_default_email: string;
  label_default_email_message: string;
  label_mypage_provider_profile: string;
  label_mypage_provider_google: string;
  label_mypage_provider_apple: string;
  label_mypage_provider_kakao: string;
  label_mypage_provider_wechat: string;
  label_mypage_provider_default: string;
  label_mypage_account_management: string;
  label_mypage_edit_profile: string;
  label_debug: string;
  label_mypage_logout: string;
  label_mypage_activity_history: string;
  label_mypage_my_votes: string;
  label_mypage_my_posts: string;
  label_mypage_my_comments: string;
  label_mypage_service_info: string;
  label_mypage_menu_service: string;
  label_mypage_notice: string;
  label_mypage_faq: string;
  label_mypage_menu_policy: string;
  label_mypage_terms_of_use: string;
  label_mypage_privacy_policy: string;
  label_mypage_withdrawal: string;
  // 새로 추가된 번역 키들
  label_loading: string;
  label_mypage_my_recharge_history: string;
  // 별사탕 관련 번역 키들
  label_mypage_star_candy: string;
  label_mypage_star_candy_bonus: string;
  label_mypage_star_candy_total: string;
  // 게스트 상태용 번역 키들
  label_mypage_guest_welcome: string;
  label_mypage_guest_description: string;
  label_mypage_guest_login_button: string;
  label_mypage_guest_login_benefits: string;
  label_mypage_guest_benefit_1: string;
  label_mypage_guest_benefit_2: string;
  label_mypage_guest_benefit_3: string;
  label_mypage_guest_benefit_4: string;
  label_mypage_guest_profile_placeholder: string;
}

interface MyPageClientProps {
  initialUser: User | null;
  initialUserProfile: UserProfiles | null;
  translations: Translations;
}

// API 응답 타입 정의
interface ApiUserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  star_candy: number;
  star_candy_bonus: number;
  total_candy: number;
  is_admin: boolean;
  is_super_admin: boolean;
  provider: string;
  provider_display_name: string;
  created_at: string;
  updated_at: string;
}

// 🎯 서버에서 받은 초기 데이터 기반 클라이언트 컴포넌트
export default function MyPageClient({ initialUser, initialUserProfile, translations }: MyPageClientProps) {
  const { logout } = useQuickLogout();
  const [apiUserProfile, setApiUserProfile] = useState<ApiUserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(!!initialUser); // 로그인된 사용자만 로딩 상태
  
  // 간편한 번역 함수 (props로 받은 번역 사용)
  const t = (key: keyof Translations) => translations[key] || key;

  // 게스트 상태 여부 확인
  const isGuest = !initialUser;

  // API에서 최신 사용자 프로필 정보 가져오기 (provider 정보 포함) - 로그인된 사용자만
  useEffect(() => {
    if (!initialUser) return; // 게스트는 API 호출하지 않음

    const fetchUserProfile = async () => {
      try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setApiUserProfile(data.user);
          }
        }
      } catch (error) {
        console.error('프로필 정보 로드 실패:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchUserProfile();
  }, [initialUser]);

  // Provider별 아이콘 반환 함수
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return '🔍'; // Google 아이콘
      case 'kakao':
        return '💛'; // Kakao 아이콘
      case 'apple':
        return '🍎'; // Apple 아이콘
      case 'github':
        return '🐙'; // GitHub 아이콘
      case 'facebook':
        return '📘'; // Facebook 아이콘
      case 'twitter':
        return '🐦'; // Twitter 아이콘
      case 'discord':
        return '💬'; // Discord 아이콘
      case 'email':
      default:
        return '📧'; // 이메일 아이콘
    }
  };

  // 디버그 모드 감지 (개발 환경 또는 로컬호스트)
  const isDebugMode = process.env.NODE_ENV === 'development' || 
    (typeof window !== 'undefined' && window.location.hostname === 'localhost');

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error(t('error_logout'), error);
    }
  };

  // 로그인 페이지로 이동
  const handleLoginRedirect = () => {
    window.location.href = '/login?returnTo=/mypage';
  };

  // 🚀 API와 초기 데이터를 조합한 사용자 정보 추출 (로그인된 사용자만)
  const getUserInfo = useCallback(() => {
    if (isGuest) {
      return {
        nickname: t('label_mypage_guest_profile_placeholder'),
        email: t('label_default_email_message'),
        avatar_url: null,
        provider: 'guest',
        provider_display_name: t('label_mypage_provider_default'),
        star_candy: 0,
        star_candy_bonus: 0,
        total_candy: 0,
        source: 'guest'
      };
    }

    // 1. API에서 가져온 최신 정보 우선 사용 (provider 정보 포함)
    if (apiUserProfile) {
      return {
        nickname: apiUserProfile.name || t('label_default_user'),
        email: apiUserProfile.email || t('label_default_email'),
        avatar_url: apiUserProfile.avatar_url || null,
        provider: apiUserProfile.provider || 'email',
        provider_display_name: apiUserProfile.provider_display_name || t('label_mypage_provider_default'),
        star_candy: apiUserProfile.star_candy || 0,
        star_candy_bonus: apiUserProfile.star_candy_bonus || 0,
        total_candy: apiUserProfile.total_candy || 0,
        source: 'api'
      };
    }

    // 2. API 로딩 중이거나 실패 시 초기 데이터 사용 (fallback)
    if (initialUserProfile) {
      return {
        nickname: initialUserProfile.nickname || 
                 initialUserProfile.email?.split('@')[0] || 
                 initialUser?.email?.split('@')[0] || 
                 t('label_default_user'),
        email: initialUserProfile.email || 
               initialUser?.email || 
               t('label_default_email'), 
        avatar_url: initialUserProfile.avatar_url || null,
        provider: 'email',
        provider_display_name: t('label_mypage_provider_default'),
        star_candy: initialUserProfile.star_candy || 0,
        star_candy_bonus: initialUserProfile.star_candy_bonus || 0,
        total_candy: (initialUserProfile.star_candy || 0) + (initialUserProfile.star_candy_bonus || 0),
        source: 'userProfile'
      };
    }
    
    // 3. 초기 사용자 토큰 정보 사용
    if (initialUser) {
      return {
        nickname: initialUser.user_metadata?.name || 
                 initialUser.user_metadata?.full_name || 
                 initialUser.email?.split('@')[0] || 
                 t('label_default_user'),
        email: initialUser.email || t('label_default_email'),
        avatar_url: null, // JWT 토큰 이미지는 사용하지 않음
        provider: initialUser.app_metadata?.provider || 'email',
        provider_display_name: initialUser.app_metadata?.provider || t('label_mypage_provider_default'),
        star_candy: 0,
        star_candy_bonus: 0,
        total_candy: 0,
        source: 'token'
      };
    }

    // 4. 기본값 (이 경우는 발생하지 않아야 함)
    return {
      nickname: t('label_default_user'),
      email: t('label_default_email_message'),
      avatar_url: null,
      provider: 'email',
      provider_display_name: t('label_mypage_provider_default'),
      star_candy: 0,
      star_candy_bonus: 0,
      total_candy: 0,
      source: 'default'
    };
  }, [apiUserProfile, initialUserProfile, initialUser, t, isGuest]);

  const userInfo = getUserInfo();

  // 게스트 상태일 때 로그인 유도 UI 렌더링
  if (isGuest) {
    return (
      <div className='container mx-auto px-4 py-4 max-w-4xl'>
        {/* 게스트 환영 헤더 */}
        <div className='bg-gradient-to-r from-primary-500 to-primary-700 rounded-lg shadow-md p-6 mb-4 text-white text-center'>
          <div className='flex items-center justify-center mb-3'>
            <div className='w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-3xl'>
              👋
            </div>
          </div>
          <h1 className='text-2xl font-bold mb-2'>{t('label_mypage_guest_welcome')}</h1>
          <p className='text-base opacity-90 mb-4'>{t('label_mypage_guest_description')}</p>
          <button
            onClick={handleLoginRedirect}
            className='bg-white text-primary-600 px-6 py-2 rounded-full font-semibold hover:bg-gray-100 transition-colors text-base shadow-lg'
          >
            {t('label_mypage_guest_login_button')}
          </button>
        </div>

        {/* 로그인 혜택 소개 */}
        <div className='bg-white rounded-lg shadow-md p-4 mb-4'>
          <h2 className='text-lg font-bold text-gray-900 mb-3 text-center'>
            {t('label_mypage_guest_login_benefits')}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div className='flex items-center p-3 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg'>
              <div className='w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center mr-3'>
                <span className='text-white text-lg'>🗳️</span>
              </div>
              <p className='text-gray-700 text-sm'>{t('label_mypage_guest_benefit_1')}</p>
            </div>
            <div className='flex items-center p-3 bg-gradient-to-r from-sub-50 to-sub-100 rounded-lg'>
              <div className='w-10 h-10 bg-gradient-to-r from-sub-500 to-sub-600 rounded-lg flex items-center justify-center mr-3'>
                <span className='text-white text-lg'>🌟</span>
              </div>
              <p className='text-gray-700 text-sm'>{t('label_mypage_guest_benefit_2')}</p>
            </div>
            <div className='flex items-center p-3 bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-lg'>
              <div className='w-10 h-10 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mr-3'>
                <span className='text-white text-lg'>👤</span>
              </div>
              <p className='text-gray-700 text-sm'>{t('label_mypage_guest_benefit_3')}</p>
            </div>
            <div className='flex items-center p-3 bg-gradient-to-r from-point-50 to-point-100 rounded-lg'>
              <div className='w-10 h-10 bg-gradient-to-r from-point-500 to-point-600 rounded-lg flex items-center justify-center mr-3'>
                <span className='text-white text-lg'>🎯</span>
              </div>
              <p className='text-gray-700 text-sm'>{t('label_mypage_guest_benefit_4')}</p>
            </div>
          </div>
        </div>

        {/* 서비스 정보 카드 (게스트도 접근 가능) */}
        <div className='bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-1'>
          <div className='bg-white rounded-2xl p-4'>
            <div className='flex items-center mb-4'>
              <div className='w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mr-3'>
                <span className='text-xl'>🛠️</span>
              </div>
              <h2 className='text-lg font-bold text-gray-900'>
                {t('label_mypage_service_info')}
              </h2>
            </div>
            
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <Link href='/notice' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>📢</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_notice')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/faq' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>❓</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_faq')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/terms' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>📋</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_terms_of_use')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/privacy' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>🔒</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_privacy_policy')}
                    </h3>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        
        {/* 페이지 하단 버전 정보 */}
        <div className='mt-4 pt-3 border-t border-gray-200 text-right'>
          <p className='text-xs text-gray-400'>
            v{process.env.NEXT_PUBLIC_BUILD_VERSION 
              ? process.env.NEXT_PUBLIC_BUILD_VERSION.split('.').slice(0, 2).join('.')
              : 'dev'
            }
          </p>
        </div>
      </div>
    );
  }

  // 로그인된 사용자용 기존 UI
  return (
    <div className='container mx-auto px-4 py-4 max-w-4xl'>
      {/* 상단 헤더 */}
      <div className='bg-white rounded-lg shadow-md p-4 mb-4'>
        <div className='flex flex-col md:flex-row items-center gap-4'>
          {/* 프로필 이미지 */}
          <div className='relative'>
            <div className='w-20 h-20 rounded-full border-2 border-primary'>
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
                <div className={`text-2xl text-gray-600 ${userInfo.avatar_url ? 'hidden' : ''}`}>
                  👤
                </div>
              </div>
            </div>
          </div>

          {/* 사용자 정보 */}
          <div className='flex-1 text-center md:text-left'>
            <h1 className='text-xl font-bold text-gray-900 mb-2'>
              {userInfo.nickname}
            </h1>
            
            {/* 이메일과 로그인 수단을 한 줄로 */}
            <div className='flex flex-wrap items-center gap-2 justify-center md:justify-start mb-2'>
              <p className='text-gray-600 text-sm'>{userInfo.email}</p>
              <span className='inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-800 rounded-full text-xs'>
                <span>
                  {isLoadingProfile ? t('label_loading') : userInfo.provider_display_name}
                </span>
              </span>
            </div>

            {/* 스타 캔디 정보 */}
            {!isLoadingProfile && apiUserProfile && (
              <div className='bg-sub-200 p-2 rounded-lg'>
                <div className='text-center'>
                  <div className='text-primary-500 font-semibold text-base mb-1'>
                    {t('label_mypage_star_candy_total')}: {userInfo.total_candy.toLocaleString()}
                  </div>
                  <div className='text-xs text-gray-600 flex items-center justify-center gap-1'>
                    <img 
                      src="/images/star-candy/star_100.png" 
                      alt={t('label_mypage_star_candy')} 
                      className="w-5 h-5" 
                    />
                    <span>{userInfo.star_candy.toLocaleString()}</span>
                {userInfo.star_candy_bonus > 0 && (
                      <span> + 🎁 {userInfo.star_candy_bonus.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 팬시 메뉴 카드 섹션 */}
      <div className='mt-4 space-y-4'>
        {/* 계정 관리 카드 */}
        <div className='bg-gradient-to-r from-primary-400 to-primary-600 rounded-2xl p-1'>
          <div className='bg-white rounded-2xl p-4'>
            <div className='flex items-center mb-4'>
              <div className='w-10 h-10 bg-gradient-to-r from-primary-400 to-primary-600 rounded-xl flex items-center justify-center mr-3'>
                <span className='text-xl'>👤</span>
              </div>
              <h2 className='text-lg font-bold text-gray-900'>
                {t('label_mypage_account_management')}
              </h2>
            </div>
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              {isDebugMode && (
                <Link href='/mypage/edit-profile' className='group'>
                  <div className='bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-primary-200 h-16'>
                    <div className='flex items-center justify-center space-x-2 h-full'>
                      <div className='w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm'>✏️</span>
                      </div>
                      <div>
                        <h3 className='font-semibold text-gray-900 group-hover:text-primary-600 transition-colors text-sm'>
                          {t('label_mypage_edit_profile')}
                          <span className='ml-1 px-1 py-0.5 bg-primary-100 text-primary-600 text-xs rounded-full'>
                            {t('label_debug')}
                          </span>
                        </h3>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
              
              <button onClick={handleLogout} className='group text-left'>
                <div className='bg-gradient-to-r from-point-50 to-point-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-point-200 h-16'>
                  <div className='flex items-center justify-center space-x-2 h-full'>
                    <div className='w-8 h-8 bg-gradient-to-r from-point-500 to-point-600 rounded-lg flex items-center justify-center'>
                      <span className='text-white text-sm'>🚪</span>
                    </div>
                    <div>
                      <h3 className='font-semibold text-gray-900 group-hover:text-point-600 transition-colors text-sm'>
                        {t('label_mypage_logout')}
                      </h3>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 활동 내역 카드 - 투표 내역은 모든 사용자에게 표시 */}
        <div className='bg-gradient-to-r from-secondary-400 to-secondary-600 rounded-2xl p-1'>
          <div className='bg-white rounded-2xl p-4'>
            <div className='flex items-center mb-4'>
              <div className='w-10 h-10 bg-gradient-to-r from-secondary-400 to-secondary-600 rounded-xl flex items-center justify-center mr-3'>
                <span className='text-xl'>📊</span>
              </div>
              <h2 className='text-lg font-bold text-gray-900'>
                {t('label_mypage_activity_history')}
              </h2>
            </div>
            
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <Link href='/mypage/vote-history' className='group'>
                <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>🗳️</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                      {t('label_mypage_my_votes')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/mypage/posts' className='group'>
                <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>📝</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                      {t('label_mypage_my_posts')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/mypage/comments' className='group'>
                <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>💬</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                      {t('label_mypage_my_comments')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/mypage/recharge-history' className='group'>
                <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>💳</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                      {t('label_mypage_my_recharge_history')}
                    </h3>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* 서비스 정보 카드 */}
        <div className='bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-1'>
          <div className='bg-white rounded-2xl p-4'>
            <div className='flex items-center mb-4'>
              <div className='w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mr-3'>
                <span className='text-xl'>🛠️</span>
              </div>
              <h2 className='text-lg font-bold text-gray-900'>
                {t('label_mypage_service_info')}
              </h2>
            </div>
            
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <Link href='/notice' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>📢</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_notice')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/faq' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>❓</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_faq')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/terms' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>📋</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_terms_of_use')}
                    </h3>
                  </div>
                </div>
              </Link>
              
              <Link href='/privacy' className='group'>
                <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
                  <div className='text-center h-full flex flex-col justify-center'>
                    <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                      <span className='text-white text-sm'>🔒</span>
                    </div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                      {t('label_mypage_privacy_policy')}
                    </h3>
                  </div>
                </div>
              </Link>
            </div>

            {/* 탈퇴 버튼 (디버그 모드에서만, 별도 영역) */}
            {isDebugMode && (
              <div className='mt-4 pt-4 border-t border-gray-200'>
                <Link href='/mypage/withdrawal' className='group'>
                  <div className='bg-gradient-to-r from-point-50 to-point-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-point-200'>
                    <div className='flex items-center justify-center space-x-2'>
                      <div className='w-8 h-8 bg-gradient-to-r from-point-500 to-point-600 rounded-lg flex items-center justify-center'>
                        <span className='text-white text-sm'>⚠️</span>
                      </div>
                      <div className='text-center'>
                        <h3 className='font-semibold text-gray-900 group-hover:text-point-600 transition-colors text-sm'>
                          {t('label_mypage_withdrawal')}
                          <span className='ml-1 px-1 py-0.5 bg-point-100 text-point-600 text-xs rounded-full'>
                            {t('label_debug')}
                          </span>
                        </h3>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
      
      {/* 페이지 하단 버전 정보 */}
      <div className='mt-4 pt-3 border-t border-gray-200 text-right'>
        <p className='text-xs text-gray-400'>
          v{process.env.NEXT_PUBLIC_BUILD_VERSION 
            ? process.env.NEXT_PUBLIC_BUILD_VERSION.split('.').slice(0, 2).join('.')
            : 'dev'
          }
        </p>
      </div>
    </div>
  );
} 