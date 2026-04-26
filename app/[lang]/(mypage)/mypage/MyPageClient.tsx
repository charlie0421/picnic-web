'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';
import { useLogout } from '@/lib/auth/logout';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import MyPageAccountMenu from '@/components/server/mypage/MyPageAccountMenu';
import StarCandyBalanceBox from '@/components/common/StarCandyBalanceBox';
import { useAuth } from '@/lib/supabase/auth-provider';
import { getProviderDisplayName } from '@/utils/storage';
import { ProfileImageContainer } from '@/components/ui/ProfileImageContainer';

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

export default function MyPageClient({ 
  initialUser, 
  initialUserProfile, 
  translations,
  children,
  showDebugMenus
}: MyPageClientProps) {
  const logout = useLogout();
  const { setIsLoading } = useGlobalLoading();
  const { user, userProfile, loadUserProfile } = useAuth();
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(() => !!initialUser && !initialUserProfile);
  
  const t = (key: string) => translations[key] || key;

  const isGuest = !initialUser;

  const initialUserId = initialUser?.id ?? null;

  useEffect(() => {
    if (!initialUserId) {
      setIsLoadingProfile(false);
      return;
    }

    if (userProfile) {
      setIsLoadingProfile(false);
      return;
    }

    let cancelled = false;
    setIsLoadingProfile(true);

    loadUserProfile(initialUserId)
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialUserId, userProfile, loadUserProfile]);

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
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const lang = path.split('/')?.[1] || 'en';
      // returnTo도 언어 프리픽스를 포함하도록 수정
      window.location.href = `/${lang}/login?returnTo=/${lang}/mypage`;
    } catch {
      window.location.href = '/login?returnTo=/mypage';
    }
  };

  const resolvedProfile = useMemo<UserProfiles | null>(() => {
    if (userProfile) {
      return userProfile;
    }
    if (initialUserProfile) {
      return initialUserProfile;
    }
    return null;
  }, [userProfile, initialUserProfile]);

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

    if (resolvedProfile) {
      const starCandy = resolvedProfile.star_candy || 0;
      const starCandyBonus = resolvedProfile.star_candy_bonus || 0;
      const providerKey = user?.app_metadata?.provider || 'email';
      const providerDisplay = getProviderDisplayName(providerKey) || t('label_mypage_provider_default');

      return {
        nickname: resolvedProfile.nickname || initialUser?.email?.split('@')[0] || t('label_default_user'),
        email: resolvedProfile.email || initialUser?.email || t('label_default_email'), 
        avatar_url: resolvedProfile.avatar_url || null,
        provider: providerKey,
        provider_display_name: providerDisplay,
        star_candy: starCandy,
        star_candy_bonus: starCandyBonus,
        total_candy: starCandy + starCandyBonus,
        source: userProfile ? 'context' : 'userProfile'
      };
    }
    
    if (initialUser) {
      const providerKey = initialUser.app_metadata?.provider || 'email';
      return {
        nickname: initialUser.user_metadata?.name || initialUser.email?.split('@')[0] || t('label_default_user'),
        email: initialUser.email || t('label_default_email'),
        avatar_url: null,
        provider: providerKey,
        provider_display_name: getProviderDisplayName(providerKey) || t('label_mypage_provider_default'),
        star_candy: 0,
        star_candy_bonus: 0,
        total_candy: 0,
        source: 'user'
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
  }, [resolvedProfile, initialUser, user, t, isGuest, userProfile]);

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
                <ProfileImageContainer
                  avatarUrl={userInfo.avatar_url}
                  width={80}
                  height={80}
                  borderRadius={80}
                  className="w-full h-full"
                />
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
            {!isLoadingProfile && resolvedProfile && (
              <div className="mt-3">
                <StarCandyBalanceBox
                  starCandy={userInfo.star_candy}
                  starCandyBonus={userInfo.star_candy_bonus}
                  totalCandy={userInfo.total_candy}
                  isLoading={isLoadingProfile}
                  autoFetch={false}
                  compact={true}
                />
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
