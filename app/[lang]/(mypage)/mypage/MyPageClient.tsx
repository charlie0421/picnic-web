'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';
import { useLogout } from '@/lib/auth/logout';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import MyPageAccountMenu from '@/components/server/mypage/MyPageAccountMenu';

interface Translations {
  [key: string]: string;
}

interface MyPageClientProps {
  initialUser: User | null;
  initialUserProfile: UserProfiles | null;
  translations: Translations;
  children: React.ReactNode;
  showDebugMenus: boolean;
}

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

export default function MyPageClient({ 
  initialUser, 
  initialUserProfile, 
  translations,
  children,
  showDebugMenus
}: MyPageClientProps) {
  const logout = useLogout();
  const { setIsLoading } = useGlobalLoading();
  const [apiUserProfile, setApiUserProfile] = useState<ApiUserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(!!initialUser);
  
  const t = (key: string) => translations[key] || key;

  const isGuest = !initialUser;

  useEffect(() => {
    if (!initialUser) return;

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

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await logout();
    } catch (error) {
      console.error(t('error_logout'), error);
      setIsLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    setIsLoading(true);
    window.location.href = '/login?returnTo=/mypage';
  };

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

    if (initialUserProfile) {
      return {
        nickname: initialUserProfile.nickname || initialUser?.email?.split('@')[0] || t('label_default_user'),
        email: initialUserProfile.email || initialUser?.email || t('label_default_email'), 
        avatar_url: initialUserProfile.avatar_url || null,
        provider: 'email',
        provider_display_name: t('label_mypage_provider_default'),
        star_candy: initialUserProfile.star_candy || 0,
        star_candy_bonus: initialUserProfile.star_candy_bonus || 0,
        total_candy: (initialUserProfile.star_candy || 0) + (initialUserProfile.star_candy_bonus || 0),
        source: 'userProfile'
      };
    }
    
    if (initialUser) {
      return {
        nickname: initialUser.user_metadata?.name || initialUser.email?.split('@')[0] || t('label_default_user'),
        email: initialUser.email || t('label_default_email'),
        avatar_url: null,
        provider: initialUser.app_metadata?.provider || 'email',
        provider_display_name: initialUser.app_metadata?.provider || t('label_mypage_provider_default'),
        star_candy: 0,
        star_candy_bonus: 0,
        total_candy: 0,
        source: 'token'
      };
    }

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

  if (isGuest) {
    return (
      <div className='container mx-auto px-4 py-6'>
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
        {children}
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

  return (
    <div className='container mx-auto px-4 py-6'>
      <div className='bg-white rounded-lg shadow-md p-4 mb-4'>
        <div className='flex flex-col md:flex-row items-center gap-4'>
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
          <div className='flex-1 text-center md:text-left'>
            <h1 className='text-xl font-bold text-gray-900 mb-2'>
              {userInfo.nickname}
            </h1>
            <div className='flex flex-wrap items-center gap-2 justify-center md:justify-start mb-2'>
              <p className='text-gray-600 text-sm'>{userInfo.email}</p>
              <span className='inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-800 rounded-full text-xs'>
                <span>
                  {isLoadingProfile ? t('label_loading') : userInfo.provider_display_name}
                </span>
              </span>
            </div>
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

      <div className='mt-4 space-y-4'>
        <MyPageAccountMenu 
          handleLogout={handleLogout}
          showDebugMenus={showDebugMenus}
        />
        {children}
      </div>
      
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
