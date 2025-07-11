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
import { useTranslations } from '@/hooks/useTranslations';

interface MobileNavigationMenuProps {
  className?: string;
}

const MobileNavigationMenu: React.FC<MobileNavigationMenuProps> = ({ className = '' }) => {
  const { isAuthenticated, userProfile, user, isLoading } = useAuth();
  const { currentLocale, getLocalizedPath } = useLocaleRouter();
  const { isLoading: globalLoading, setIsLoading } = useGlobalLoading();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { tDynamic: t } = useTranslations();

  // 안정적인 인증 상태 관리
  const stableAuthState = {
    showLoading: isLoading,
    showUserArea: !isLoading && isAuthenticated,
    showGuestArea: !isLoading && !isAuthenticated,
  };

  // 사용자 정보 (안전하게 접근) - DB 프로필만 사용
  const userInfo = {
    avatar_url: userProfile?.avatar_url || null, // JWT 토큰 이미지 제거
    name: userProfile?.nickname || user?.user_metadata?.full_name || user?.email || null,
    is_admin: userProfile?.is_admin || false,
  };

  // 프로필 이미지 로딩 상태
  const profileImageLoading = stableAuthState.showUserArea && !userInfo.name;

  // 관리자 권한에 따른 메뉴 필터링
  const getFilteredMenuItems = () => {
    const adminOnlyPortals = [PortalType.COMMUNITY, PortalType.PIC, PortalType.NOVEL];
    
    return PORTAL_MENU.filter(item => {
      // VOTE는 항상 표시
      if (item.type === PortalType.VOTE) return true;
      
      // 나머지는 관리자만 표시
      return userInfo.is_admin && adminOnlyPortals.includes(item.type as PortalType);
    });
  };

  const filteredMenuItems = getFilteredMenuItems();

  const handleLinkClick = (href: string) => {
    setIsLoading(true);
    setIsOpen(false);
  };

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

  // 외부 클릭으로 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <div className="flex items-center">
        {/* 프로필/햄버거 통합 버튼 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className='relative hover:bg-gray-100 rounded-lg transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center'
          aria-label={t('common.menu.openMenu')}
          aria-expanded={isOpen}
        >
          {stableAuthState.showLoading ? (
            // 로딩 중일 때 shimmer 효과
            <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
          ) : stableAuthState.showUserArea ? (
            // 인증된 사용자 - 프로필 이미지
            profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
              <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
            ) : userInfo.avatar_url ? (
              <ProfileImageContainer
                avatarUrl={userInfo.avatar_url}
                width={40} // 태블릿 크기에 맞춤
                height={40}
                borderRadius={8}
                className="w-full h-full object-cover"
              />
            ) : (
              <DefaultAvatar width={40} height={40} className="w-full h-full" />
            )
          ) : (
            // 미인증 사용자 - User 아이콘
            <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
              <User className="w-5 h-5 text-gray-600" />
            </div>
          )}
        </button>
      </div>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-4">
            {stableAuthState.showUserArea ? (
              // 인증된 사용자 메뉴
              <>
                {/* 사용자 정보 섹션 */}
                <div className="flex items-center space-x-3 mb-4 pb-4 border-b">
                  {profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
                    <div className="w-12 h-12 rounded-lg shimmer-effect bg-gray-200" />
                  ) : userInfo.avatar_url ? (
                    <ProfileImageContainer
                      avatarUrl={userInfo.avatar_url}
                      width={48} // 드롭다운에서는 더 큰 크기
                      height={48}
                      borderRadius={8}
                    />
                  ) : (
                    <DefaultAvatar width={48} height={48} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {userInfo.name || t('common.user.unknown')}
                    </p>
                    {userInfo.is_admin && (
                      <p className="text-xs text-blue-600">{t('common.user.admin')}</p>
                    )}
                  </div>
                </div>

                {/* 네비게이션 메뉴 */}
                {filteredMenuItems.length > 0 && (
                  <div className="mb-4">
                    <div className="space-y-1">
                      {filteredMenuItems.map((item) => {
                        const isActive = isVoteRelatedPath(pathname) && item.type === PortalType.VOTE;
                        return (
                          <Link
                            key={item.type}
                            href={getLocalizedPath(item.path)}
                            onClick={() => handleLinkClick(item.path)}
                            className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {t(`nav.menu.${item.type.toLowerCase()}`)}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 마이페이지 링크 */}
                <div className="pt-2 border-t">
                  {pathname.includes('/mypage') ? (
                    // 현재 마이페이지에 있을 때 - 비활성화된 상태로 표시
                    <div className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm text-blue-700 bg-blue-50 font-medium cursor-default">
                      <Settings className="w-4 h-4" />
                      <span>{t('nav.menu.mypage')}</span>
                    </div>
                  ) : (
                    // 다른 페이지에 있을 때 - 클릭 가능한 링크
                    <Link
                      href={getLocalizedPath('/mypage')}
                      onClick={() => handleLinkClick('/mypage')}
                      className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>{t('nav.menu.mypage')}</span>
                    </Link>
                  )}
                </div>
              </>
            ) : (
              // 미인증 사용자 메뉴
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  {t('common.auth.loginPrompt')}
                </p>
                
                <Link
                  href={getLocalizedPath('/login')}
                  onClick={() => handleLinkClick('/login')}
                  className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{t('common.auth.login')}</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
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
    </div>
  );
};

export default MobileNavigationMenu; 