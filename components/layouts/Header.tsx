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
  const { isAuthenticated, userProfile, user, signOut, isLoading, isInitialized } = useAuth();
  const { currentLanguage } = useLanguageStore();
  const pathname = usePathname();

  // 🐛 디버그 모드 체크
  const isDebugMode = process.env.NODE_ENV === 'development';

  // 🎯 DB 프로필 이미지 우선 (OAuth는 최초 가입시에만 사용)
  const getUserInfo = useCallback(() => {
    // 1. DB 프로필이 있으면 무조건 DB 사용 (사용자가 관리하는 프로필)
    if (userProfile) {
      return {
        nickname: userProfile.nickname || userProfile.email?.split('@')[0] || user?.email?.split('@')[0] || '사용자',
        email: userProfile.email || user?.email || '이메일 정보 없음', 
        avatar_url: userProfile.avatar_url || null, // DB의 프로필 이미지만 사용
        provider: 'profile',
        source: 'userProfile'
      };
    }
    
    // 2. DB 프로필이 없을 때만 JWT 토큰 사용 (최초 로그인 시 임시)
    if (user) {
      return {
        nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        email: user.email || '이메일 정보 없음',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || 'unknown',
        source: 'token'
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
  }, [userProfile, user]); // userProfile 우선

  // 사용자 정보 가져오기
  const userInfo = getUserInfo();

  // 디버깅 로그 (개발 환경에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // 🚨 관리자 권한 상태 별도 로깅
      if (isAuthenticated && !isLoading) {
        const isAdminFromProfile = userProfile?.is_admin;
        const isSuperAdminFromProfile = userProfile?.is_super_admin;
        const isAdminFromMetadata = user?.user_metadata?.is_admin;
        const isSuperAdminFromMetadata = user?.user_metadata?.is_super_admin;
        
        const finalIsAdmin = isAdminFromProfile || isSuperAdminFromProfile || isAdminFromMetadata || isSuperAdminFromMetadata;
        
        // 🐛 개발 환경 임시 관리자 체크
        const isDevTempAdmin = process.env.NODE_ENV === 'development' && 
                              isAuthenticated && 
                              !isLoading && 
                              !userProfile &&
                              user;

        // 🔧 개발 환경 fallback 관리자 체크
        const isDevFallbackAdmin = process.env.NODE_ENV === 'development' && 
                                  isAuthenticated && 
                                  !isLoading &&
                                  user &&
                                  (Date.now() - (window as any).authStartTime || 0) > 2000;

        console.log('🚨 [Header] 관리자 권한 상태:', {
          '📊 기본 정보': {
            isAuthenticated,
            isLoading,
            hasUserProfile: !!userProfile,
            hasUser: !!user
          },
          '🔑 권한 정보': {
            profile_isAdmin: isAdminFromProfile,
            profile_isSuperAdmin: isSuperAdminFromProfile,
            metadata_isAdmin: isAdminFromMetadata,
            metadata_isSuperAdmin: isSuperAdminFromMetadata,
            finalIsAdmin,
            devTempAdmin: isDevTempAdmin,
            devFallbackAdmin: isDevFallbackAdmin
          },
          '🎯 결과': {
            showAdminMenus: finalIsAdmin || isDevTempAdmin || isDevFallbackAdmin ? '✅' : '❌'
          }
        });
      }
    }
  }, [isAuthenticated, isLoading, userProfile, user]);

  return (
    <header className='border-b border-gray-200 bg-white relative'>
      <div className='container mx-auto px-2 sm:px-4 py-2'>
        <div className='flex items-center justify-between w-full gap-2 sm:gap-4'>
          {/* 좌측: 로고 + 메뉴 */}
          <div className='flex items-center gap-2 sm:gap-4 flex-1 min-w-0'>
            {/* 로고 */}
            <div className='flex items-center flex-shrink-0'>
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

            {/* 메뉴 - 스크롤 가능한 영역 */}
            <div className='flex-1 overflow-x-auto scrollbar-hide'>
              <div className='flex items-center space-x-2 sm:space-x-4 min-w-max'>
                {PORTAL_MENU.map((menuItem) => {
                  // 🔐 권한별 메뉴 노출 조건 (요구사항에 따라 수정)
                  
                  // VOTE 메뉴는 항상 노출
                  if (menuItem.type === 'vote') {
                    return (
                      <PortalMenuItem
                        key={menuItem.path}
                        portalType={menuItem.type}
                      />
                    );
                  }

                  // COMMUNITY, PIC, NOVEL 메뉴는 로그인한 관리자만 노출
                  const isAdminOnlyMenu = ['community', 'pic', 'novel'].includes(menuItem.type);
                  if (isAdminOnlyMenu) {
                    // 로그인하지 않았으면 숨김
                    if (!isAuthenticated) {
                      return null;
                    }

                    // 🔄 userProfile 로딩 상태 체크
                    const isUserProfileLoading = isAuthenticated && !userProfile && !isLoading;

                    // userProfile이 아직 로딩 중이면 메뉴를 숨김 (로딩 후 점진적 표시)
                    if (isUserProfileLoading) {
                      if (process.env.NODE_ENV === 'development') {
                        console.log(`⏳ [Header] ${menuItem.type} 메뉴 - userProfile 로딩 중...`);
                      }
                      return null;
                    }

                    // 🔍 관리자 권한 확인 (DB의 userProfile 우선, 백업으로 user metadata 활용)
                    const isAdmin = userProfile?.is_admin || 
                                   userProfile?.is_super_admin || 
                                   user?.user_metadata?.is_admin || 
                                   user?.user_metadata?.is_super_admin;

                    // 🐛 개발 환경에서 userProfile이 없는 경우 임시 관리자 권한 부여
                    const isDevTempAdmin = process.env.NODE_ENV === 'development' && 
                                          isAuthenticated && 
                                          !isLoading && 
                                          !userProfile &&
                                          user; // JWT 사용자가 있으면 임시 관리자로 간주

                    // 🔧 개발 환경에서 userProfile 로딩이 실패한 경우도 고려
                    const isDevFallbackAdmin = process.env.NODE_ENV === 'development' && 
                                              isAuthenticated && 
                                              !isLoading &&
                                              user &&
                                              // userProfile이 2초 이상 로드되지 않으면 개발환경에서는 관리자로 간주
                                              (Date.now() - (window as any).authStartTime || 0) > 2000;

                    // 디버깅용 로그 (개발 환경에서만)
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`🔍 [Header] ${menuItem.type} 메뉴:`, {
                        isAdmin,
                        isDevTempAdmin,
                        isDevFallbackAdmin,
                        shouldShow: isAdmin || isDevTempAdmin || isDevFallbackAdmin,
                        isLoading: isUserProfileLoading
                      });
                    }

                    // 관리자가 아니면 숨김 (개발환경 임시관리자는 제외)
                    if (!isAdmin && !isDevTempAdmin && !isDevFallbackAdmin) {
                      return null;
                    }
                  }

                  return (
                    <PortalMenuItem
                      key={menuItem.path}
                      portalType={menuItem.type}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우측 메뉴 - 항상 표시 */}
          <div className='flex items-center space-x-2 sm:space-x-3 flex-shrink-0'>
            {/* 언어 선택기 */}
            <div className='flex-shrink-0'>
              <LanguageSelector />
            </div>

            {/* 프로필/로그인 버튼 */}
            <div className='flex-shrink-0'>
              {isAuthenticated ? (
                <Link href='/mypage' className='block'>
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
                <Link href='/mypage' className='block'>
                  <div className='p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-gray-200'>
                    <MenuIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
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
