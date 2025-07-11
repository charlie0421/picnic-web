'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useAuth } from '@/lib/supabase/auth-provider';
import { PortalType } from '@/utils/enums';
import { isVoteRelatedPath, PORTAL_MENU } from '@/config/navigation';
import menuConfig from '@/config/menu.json';
import { Menu as MenuIcon, X, User, LogIn, Settings } from 'lucide-react';
import { DefaultAvatar, ProfileImageContainer } from '@/components/ui/ProfileImageContainer';

interface MobileNavigationMenuProps {
  className?: string;
}

const MobileNavigationMenu: React.FC<MobileNavigationMenuProps> = ({ className = '' }) => {
  const { isAuthenticated, userProfile, user, isLoading, isInitialized } = useAuth();
  const { currentLocale, getLocalizedPath, extractLocaleFromPath } = useLocaleRouter();
  const { setIsLoading: setGlobalLoading } = useGlobalLoading();
  const pathname = usePathname();
  
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 현재 경로에서 로케일 정보 추출
  const { path: currentPath } = extractLocaleFromPath(pathname);

  // 사용자 정보 가져오기 (Header와 동일한 로직)
  const getUserInfo = () => {
    // 1. DB 프로필이 있으면 무조건 DB 사용
    if (userProfile) {
      return {
        nickname: userProfile.nickname || userProfile.email?.split('@')[0] || user?.email?.split('@')[0] || '사용자',
        email: userProfile.email || user?.email || '이메일 정보 없음', 
        avatar_url: userProfile.avatar_url || null,
        provider: 'profile',
        source: 'userProfile'
      };
    }
    
    // 2. DB 프로필이 없을 때만 JWT 토큰 사용
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
  };

  // 안정적인 인증 상태 확인 (Header와 동일한 로직)
  const getStableAuthState = () => {
    if (!isInitialized) {
      return { showUserArea: false, showLoading: true, reason: 'not_initialized' };
    }
    if (isLoading) {
      return { showUserArea: false, showLoading: true, reason: 'loading' };
    }
    if (!isAuthenticated || !user) {
      return { showUserArea: false, showLoading: false, reason: 'not_authenticated' };
    }
    if (isAuthenticated && user && userProfile === null) {
      const hasSocialImage = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      if (hasSocialImage) {
        return { showUserArea: false, showLoading: true, reason: 'profile_loading_with_social_image' };
      }
      return { showUserArea: true, showLoading: false, reason: 'authenticated_no_social_image' };
    }
    return { showUserArea: true, showLoading: false, reason: 'fully_authenticated' };
  };

  const userInfo = getUserInfo();
  const stableAuthState = getStableAuthState();

  // 메뉴 필터링 함수
  const getVisibleMenuItems = () => {
    return PORTAL_MENU.filter((menuItem) => {
      // VOTE 메뉴는 항상 노출
      if (menuItem.type === 'vote') {
        return true;
      }

      // COMMUNITY, PIC, NOVEL 메뉴는 로그인한 관리자만 노출
      const isAdminOnlyMenu = ['community', 'pic', 'novel'].includes(menuItem.type);
      if (isAdminOnlyMenu) {
        if (!isAuthenticated) return false;

        const isUserProfileLoading = isAuthenticated && !userProfile && !isLoading;
        if (isUserProfileLoading) return false;

        const isAdmin = userProfile?.is_admin || 
                       userProfile?.is_super_admin || 
                       user?.user_metadata?.is_admin || 
                       user?.user_metadata?.is_super_admin;

        const isDevTempAdmin = process.env.NODE_ENV === 'development' && 
                              isAuthenticated && 
                              !isLoading && 
                              !userProfile &&
                              user;

        const isDevFallbackAdmin = process.env.NODE_ENV === 'development' && 
                                  isAuthenticated && 
                                  !isLoading &&
                                  user &&
                                  (Date.now() - (window as any).authStartTime || 0) > 2000;

        return isAdmin || isDevTempAdmin || isDevFallbackAdmin;
      }

      return true;
    });
  };

  // 메뉴 항목 클릭 핸들러
  const handleMenuItemClick = (href: string) => {
    if (pathname !== href) {
      setGlobalLoading(true);
    }
    setIsOpen(false);
  };

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC 키로 메뉴 닫기
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen]);

  const visibleMenuItems = getVisibleMenuItems();

  // 프로필 이미지 로딩 상태 확인
  const isProfileImageLoading = () => {
    if (!stableAuthState.showUserArea || stableAuthState.showLoading) {
      return false;
    }
    
    if (isAuthenticated && user && userProfile === null) {
      const hasSocialImage = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      return !!hasSocialImage;
    }
    
    return false;
  };

  const profileImageLoading = isProfileImageLoading();

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* 프로필/햄버거 통합 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='relative hover:bg-gray-100 rounded-lg transition-colors p-1'
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
      >
        {stableAuthState.showLoading ? (
          // 로딩 중일 때 shimmer 효과
          <div className="w-8 h-8 rounded-lg shimmer-effect" />
        ) : stableAuthState.showUserArea ? (
          // 인증된 사용자 - 프로필 이미지
          profileImageLoading ? (
            <div className="w-8 h-8 rounded-lg shimmer-effect" />
          ) : userInfo.avatar_url ? (
            <ProfileImageContainer
              avatarUrl={userInfo.avatar_url}
              width={32}
              height={32}
              borderRadius={8}
            />
          ) : (
            <DefaultAvatar width={32} height={32} />
          )
        ) : (
          // 미인증 사용자 - 기본 아바타
          <div className='p-2 border border-gray-200 rounded-lg'>
            <User className="w-5 h-5 text-gray-700" />
          </div>
        )}
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <>
          {/* 배경 오버레이 */}
          <div className="fixed inset-0 bg-black/20 z-40" />
          
          {/* 메뉴 컨테이너 */}
          <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[200px] z-50 overflow-hidden">
            {/* 메뉴 헤더 */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {stableAuthState.showUserArea ? '메뉴' : '시작하기'}
                </span>
                <span className="text-xs text-gray-500">
                  {stableAuthState.showUserArea ? `${visibleMenuItems.length}개` : '로그인 필요'}
                </span>
              </div>
            </div>

            {/* 미인증 사용자용 메뉴 */}
            {!stableAuthState.showUserArea && (
              <div className="py-1">
                <Link
                  href="/login"
                  prefetch={true}
                  onClick={() => handleMenuItemClick('/login')}
                  className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogIn className="w-4 h-4 mr-3 text-primary-500" />
                  <div>
                    <div className="font-medium">로그인</div>
                    <div className="text-xs text-gray-500">계정에 로그인하세요</div>
                  </div>
                </Link>
                
                <Link
                  href="/mypage"
                  prefetch={true}
                  onClick={() => handleMenuItemClick('/mypage')}
                  className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User className="w-4 h-4 mr-3 text-gray-500" />
                  <div>
                    <div className="font-medium">회원가입</div>
                    <div className="text-xs text-gray-500">새 계정을 만드세요</div>
                  </div>
                </Link>

                {/* 구분선 */}
                <div className="border-t border-gray-100 my-1" />

                {/* VOTE 메뉴 (미인증 사용자도 접근 가능) */}
                {visibleMenuItems
                  .filter(item => item.type === 'vote')
                  .map((menuItem) => {
                    const localizedMenuPath = getLocalizedPath(menuItem.path, currentLocale);
                    const isActive = currentPath.startsWith(menuItem.path) ||
                                    (menuItem.type === PortalType.VOTE && isVoteRelatedPath(currentPath));

                    return (
                      <Link
                        key={menuItem.path}
                        href={localizedMenuPath}
                        prefetch={true}
                        onClick={() => handleMenuItemClick(localizedMenuPath)}
                        className={`flex items-center px-4 py-3 text-sm transition-colors ${
                          isActive 
                            ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-500' 
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium">{menuItem.name}</span>
                          {isActive && (
                            <div className="w-2 h-2 bg-primary-500 rounded-full" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
              </div>
            )}

            {/* 인증된 사용자용 메뉴 */}
            {stableAuthState.showUserArea && (
              <div className="py-1">
                {/* 사용자 정보 */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                  <Link
                    href="/mypage"
                    prefetch={true}
                    onClick={() => handleMenuItemClick('/mypage')}
                    className="flex items-center space-x-3 hover:bg-gray-100 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    {userInfo.avatar_url ? (
                      <ProfileImageContainer
                        avatarUrl={userInfo.avatar_url}
                        width={20}
                        height={20}
                        borderRadius={4}
                      />
                    ) : (
                      <User className="w-5 h-5 text-gray-500" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {userInfo.nickname}
                      </div>
                      <div className="text-xs text-gray-500">마이페이지</div>
                    </div>
                  </Link>
                </div>

                {/* 네비게이션 메뉴들 */}
                {visibleMenuItems.map((menuItem) => {
                  const localizedMenuPath = getLocalizedPath(menuItem.path, currentLocale);
                  const isActive = currentPath.startsWith(menuItem.path) ||
                                  (menuItem.type === PortalType.VOTE && isVoteRelatedPath(currentPath));

                  return (
                    <Link
                      key={menuItem.path}
                      href={localizedMenuPath}
                      prefetch={true}
                      onClick={() => handleMenuItemClick(localizedMenuPath)}
                      className={`block px-4 py-3 text-sm transition-colors ${
                        isActive 
                          ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-500' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{menuItem.name}</span>
                        {isActive && (
                          <div className="w-2 h-2 bg-primary-500 rounded-full" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* 메뉴 푸터 */}
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                {stableAuthState.showUserArea 
                  ? '탭하여 이동 • 외부 터치로 닫기'
                  : '로그인하면 더 많은 기능을 이용할 수 있습니다'
                }
              </p>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .shimmer-effect {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0f0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

export default MobileNavigationMenu; 