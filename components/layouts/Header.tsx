'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import {usePathname} from 'next/navigation';
import {useAuth} from '@/lib/supabase/auth-provider';
import {useLanguageStore} from '@/stores/languageStore';
import NavigationLink from '@/components/client/NavigationLink';
import {DefaultAvatar, ProfileImageContainer,} from '@/components/ui/ProfileImageContainer';
import PortalMenuItem from './PortalMenuItem';
import MobileNavigationMenu from './MobileNavigationMenu';
import MobilePortalMenu from './MobilePortalMenu';
import {PORTAL_MENU} from '@/config/navigation';
import {Menu as MenuIcon, ChevronRight} from 'lucide-react';
import LanguageSelector from './LanguageSelector';

const Header: React.FC = () => {
  const { isAuthenticated, userProfile, user, signOut, isLoading, isInitialized } = useAuth();
  const { currentLanguage } = useLanguageStore();
  const pathname = usePathname();
  
  // 스크롤 상태 관리
  const [isScrolled, setIsScrolled] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // 스크롤 상태 확인 함수
  const checkScrollState = useCallback(() => {
    if (menuContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = menuContainerRef.current;
      setIsScrolled(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  // 스크롤 이벤트 핸들러
  const handleScroll = useCallback(() => {
    checkScrollState();
  }, [checkScrollState]);

  // 컴포넌트 마운트 시 스크롤 상태 체크 및 힌트 표시
  useEffect(() => {
    const timer = setTimeout(() => {
      checkScrollState();
      if (canScrollRight) {
        setShowScrollHint(true);
        // 3초 후 힌트 숨김
        setTimeout(() => setShowScrollHint(false), 3000);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [checkScrollState, canScrollRight]);

  // 윈도우 리사이즈 시 스크롤 상태 재확인
  useEffect(() => {
    const handleResize = () => {
      setTimeout(checkScrollState, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScrollState]);

  // 🐛 디버그 모드 체크
  const isDebugMode = process.env.NODE_ENV === 'development';

  // 🎯 DB 프로필 이미지만 사용 (OAuth 토큰 이미지 제외)
  const getUserInfo = useCallback(() => {
    // 1. DB 프로필이 있으면 DB 사용 (사용자가 관리하는 프로필)
    if (userProfile) {
      return {
        nickname: userProfile.nickname || userProfile.email?.split('@')[0] || user?.email?.split('@')[0] || '사용자',
        email: userProfile.email || user?.email || '이메일 정보 없음', 
        avatar_url: userProfile.avatar_url || null, // DB의 프로필 이미지만 사용
        provider: 'profile',
        source: 'userProfile'
      };
    }
    
    // 2. DB 프로필이 없을 때는 JWT 토큰의 기본 정보만 사용 (이미지 제외)
    if (user) {
      return {
        nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        email: user.email || '이메일 정보 없음',
        avatar_url: null, // JWT 토큰의 이미지는 사용하지 않음
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

  // 🔍 안정적인 인증 상태 확인 함수
  const getStableAuthState = useCallback(() => {
    // 초기화가 완료되지 않은 경우
    if (!isInitialized) {
      return {
        showUserArea: false,
        showHamburger: false,
        showLoading: true,
        reason: 'not_initialized'
      };
    }

    // 로딩 중인 경우
    if (isLoading) {
      return {
        showUserArea: false,
        showHamburger: false,
        showLoading: true,
        reason: 'loading'
      };
    }

    // 인증되지 않은 경우
    if (!isAuthenticated || !user) {
      return {
        showUserArea: false,
        showHamburger: true,
        showLoading: false,
        reason: 'not_authenticated'
      };
    }

    // 인증된 경우 (JWT만 있거나 프로필도 있는 경우 모두 사용자 영역 표시)
    return {
      showUserArea: true,
      showHamburger: false,
      showLoading: false,
      reason: 'authenticated'
    };
  }, [isAuthenticated, user, isLoading, isInitialized]);

  // 🔍 프로필 이미지 로딩 상태 확인
  const isProfileImageLoading = useCallback(() => {
    // DB 프로필이 로딩 중인지만 확인 (JWT 이미지는 사용하지 않음)
    return isAuthenticated && user && userProfile === null;
  }, [isAuthenticated, user, userProfile]);

  // 사용자 정보 가져오기
  const userInfo = getUserInfo();
  const profileImageLoading = isProfileImageLoading();
  const stableAuthState = getStableAuthState();

  // 디버깅 로그 (개발 환경에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [Header] 인증 상태 디버깅:', {
        '📊 기본 상태': {
          isAuthenticated,
          isLoading,
          isInitialized,
          hasUser: !!user,
          hasUserProfile: !!userProfile
        },
        '🎯 계산된 상태': {
          stableAuthState,
          profileImageLoading,
          userInfo: {
            source: userInfo.source,
            hasAvatar: !!userInfo.avatar_url,
            provider: userInfo.provider
          }
        }
      });

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
  }, [isAuthenticated, isLoading, userProfile, user, stableAuthState, profileImageLoading]);

  return (
    <header className='border-b border-gray-200 bg-white relative'>
      <div className='container mx-auto px-2 sm:px-4 py-2'>
        {/* 메인 헤더 라인 */}
        <div className='flex items-center justify-between w-full gap-2 sm:gap-4'>
          {/* 좌측: 로고 + 메뉴 */}
          <div className='flex items-center gap-2 sm:gap-4 flex-1 min-w-0'>
            {/* 로고 */}
            <div className='flex items-center flex-shrink-0'>
              <NavigationLink 
                href="/"
              >
                <Image
                  src='/images/logo.png'
                  alt='logo'
                  width={40}
                  height={40}
                  priority
                  className='w-8 h-8 sm:w-10 sm:h-10 rounded-lg'
                />
              </NavigationLink>
            </div>

            {/* 모바일 포털메뉴 - 모바일과 태블릿에서 표시 */}
            <div className='md:hidden flex items-center'>
              <MobilePortalMenu />
            </div>

            {/* 데스크탑 메뉴 - 데스크탑에서만 표시 */}
            <div className='hidden md:flex flex-1 relative'>
              {/* 메뉴 컨테이너 */}
              <div 
                ref={menuContainerRef}
                className='overflow-x-auto scrollbar-hide scroll-smooth'
                onScroll={handleScroll}
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                <div className='flex items-center space-x-1 sm:space-x-2 min-w-max'>
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

              {/* 오른쪽 그라디언트 페이드 효과 (더 많은 콘텐츠가 있을 때) */}
              {canScrollRight && (
                <div className='absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none flex items-center justify-end pr-1'>
                  <ChevronRight 
                    className={`w-3 h-3 text-gray-400 transition-all duration-300 ${
                      showScrollHint ? 'animate-pulse' : ''
                    }`} 
                  />
                </div>
              )}

              {/* 왼쪽 그라디언트 페이드 효과 (스크롤된 상태일 때) */}
              {isScrolled && (
                <div className='absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none' />
              )}
            </div>
          </div>

          {/* 우측 메뉴 - 항상 표시 */}
          <div className='flex items-center gap-3'>
            {/* 언어 선택기 - 모든 화면에서 표시 */}
            <div className='flex items-center justify-center h-8 sm:h-10'>
              <LanguageSelector />
            </div>

            {/* 모바일 햄버거 메뉴 - 모바일과 태블릿에서 표시 */}
            <div className='md:hidden flex items-center justify-center h-8 sm:h-10'>
              <MobileNavigationMenu />
            </div>

            {/* 프로필/로그인 버튼 - 데스크탑에서만 표시 (모바일/태블릿은 MobileNavigationMenu가 처리) */}
            <div className='hidden md:flex items-center justify-center h-8 sm:h-10'>
              {stableAuthState.showLoading ? (
                // 로딩 중일 때 shimmer 효과
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg shimmer-effect bg-gray-200 flex-shrink-0"></div>
              ) : stableAuthState.showUserArea ? (
                // 인증된 사용자 영역
                <NavigationLink 
                  href='/mypage' 
                  className='block w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-lg overflow-hidden'
                >
                  {profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
                    // DB 프로필 로딩 중이거나 프로필 이미지가 없는 경우 shimmer 효과만 표시
                    <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200"></div>
                  ) : userInfo.avatar_url ? (
                    <ProfileImageContainer
                      avatarUrl={userInfo.avatar_url}
                      width={40} // 데스크탑 기준 40px
                      height={40}
                      borderRadius={8}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <DefaultAvatar 
                      width={40} // 데스크탑 기준 40px
                      height={40} 
                      className="w-full h-full"
                    />
                  )}
                </NavigationLink>
              ) : stableAuthState.showHamburger ? (
                // 미인증 사용자 햄버거 메뉴
                <NavigationLink 
                  href='/mypage' 
                  className='flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0'
                >
                  <div className='w-full h-full hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-gray-200 flex items-center justify-center'>
                    <MenuIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                  </div>
                </NavigationLink>
              ) : null}
            </div>
          </div>
        </div>

        {/* 모바일 포털 메뉴 라인 제거 - 상단으로 이동됨 */}
      </div>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .shimmer-effect {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </header>
  );
};

export default Header;
