'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {usePathname} from 'next/navigation';
import {useAuth} from '@/lib/supabase/auth-provider';
import {useLanguageStore} from '@/stores/languageStore';
import {DefaultAvatar, ProfileImageContainer,} from '@/components/ui/ProfileImageContainer';
import PortalMenuItem from './PortalMenuItem';
import {PORTAL_MENU} from '@/config/navigation';
import {Menu as MenuIcon} from 'lucide-react';
import LanguageSelector from './LanguageSelector';

const Header: React.FC = () => {
  const { isAuthenticated, userProfile, user, signOut } = useAuth();
  const { currentLanguage } = useLanguageStore();
  const pathname = usePathname();

  // 🎯 JWT 토큰 기반 사용자 정보 우선 사용 (mypage와 동일한 로직)
  const getUserInfo = useCallback(() => {
    // 1. 토큰에서 직접 정보 가져오기 (가장 빠르고 확실함)
    if (user) {
      return {
        nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        email: user.email || '이메일 정보 없음',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || 'unknown',
        source: 'token'
      };
    }
    
    // 2. userProfile에서 가져오기 (fallback)
    if (userProfile) {
      return {
        nickname: userProfile.nickname || userProfile.email?.split('@')[0] || '사용자',
        email: userProfile.email || '이메일 정보 없음', 
        avatar_url: userProfile.avatar_url || null,
        provider: 'profile',
        source: 'userProfile'
      };
    }
    
    // 3. 기본값
    return {
      nickname: '사용자',
      email: '로그인 후 이메일이 표시됩니다',
      avatar_url: null,
      provider: 'none',
      source: 'default'
    };
  }, [user, userProfile]);

  // 사용자 정보 가져오기
  const userInfo = getUserInfo();

  // 디버깅 로그 (개발 환경에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [Header] 사용자 정보 상태:', {
        isAuthenticated,
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        userInfo: {
          source: userInfo.source,
          nickname: userInfo.nickname,
          hasAvatar: !!userInfo.avatar_url
        }
      });
    }
  }, [isAuthenticated, user, userProfile, userInfo]);

  return (
    <header className='border-b border-gray-200 bg-white relative'>
      <div className='container mx-auto px-2 sm:px-4 py-2'>
        <div className='flex-1 overflow-x-auto py-1 scrollbar-hide'>
          <div className='flex items-center w-full gap-2 sm:gap-4'>
            {/* 로고 */}
            <div className='flex items-center'>
              <div className='flex items-center space-x-2'>
                <Link href="/">
                  <Image
                    src='/images/logo.png'
                    alt='logo'
                    width={40}
                    height={40}
                    priority
                    className='w-8 h-8 sm:w-10 sm:h-10'
                  />
                </Link>
              </div>
            </div>

            {/* 메뉴 */}
            <div className='flex items-center space-x-4 flex-1'>
              {PORTAL_MENU.map((menuItem) => {
                const isAdminMenu = ['community', 'pic', 'novel'].includes(
                  menuItem.type,
                );
                if (isAdminMenu && !isAuthenticated) {
                  return null;
                }
                return (
                  <PortalMenuItem
                    key={menuItem.path}
                    portalType={menuItem.type}
                  />
                );
              })}
            </div>

            {/* 우측 메뉴 */}
            <div className='flex items-center space-x-2 sm:space-x-4'>
              <LanguageSelector />

              {isAuthenticated ? (
                <Link href='/mypage'>
                  {userInfo.avatar_url ? (
                    <ProfileImageContainer
                      avatarUrl={userInfo.avatar_url}
                      width={32}
                      height={32}
                      borderRadius={8}
                    />
                  ) : (
                    <DefaultAvatar width={32} height={32} />
                  )}
                </Link>
              ) : (
                <Link href='/mypage'>
                  <div className='p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-gray-200'>
                    <MenuIcon className="w-6 h-6 text-gray-700" />
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
