'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useAuth } from '@/lib/supabase/auth-provider';
import { PortalType } from '@/utils/enums';
import { isVoteRelatedPath, PORTAL_MENU } from '@/config/navigation';
import NavigationLink from '@/components/client/NavigationLink';
import menuConfig from '@/config/menu.json';
import { 
  Menu as MenuIcon, 
  X, 
  User, 
  LogIn, 
  Settings, 
  Vote,
  Users,
  Image,
  BookOpen,
  Star,
  ChevronRight
} from 'lucide-react';
import { DefaultAvatar, ProfileImageContainer } from '@/components/ui/ProfileImageContainer';
import { useTranslations } from '@/hooks/useTranslations';

interface MobileNavigationMenuProps {
  className?: string;
}

const MobileNavigationMenu: React.FC<MobileNavigationMenuProps> = ({ className = '' }) => {
  const { isAuthenticated, userProfile, user, isLoading } = useAuth();
  const { currentLocale, getLocalizedPath } = useLocaleRouter();
  const { isLoading: globalLoading, setIsLoading, forceStopLoading } = useGlobalLoading();
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
    avatar_url: userProfile?.avatar_url || null,
    name: userProfile?.nickname || user?.user_metadata?.full_name || user?.email || null,
    is_admin: userProfile?.is_admin || false,
    star_candy: userProfile?.star_candy || 0,
    star_candy_bonus: userProfile?.star_candy_bonus || 0,
  };

  // 메뉴 아이콘 매핑
  const getMenuIcon = (type: string) => {
    switch (type) {
      case 'vote': return <Vote className="w-4 h-4" />;
      case 'community': return <Users className="w-4 h-4" />;
      case 'pic': return <Image className="w-4 h-4" />;
      case 'novel': return <BookOpen className="w-4 h-4" />;
      default: return <ChevronRight className="w-4 h-4" />;
    }
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

  const handleMenuItemClick = () => {
    // 메뉴 닫기
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
          onClick={() => {
            // 메뉴를 열 때 기존 로딩이 있다면 중지
            if (!isOpen && globalLoading) {
              console.log('🔍 [MobileNav] Menu opening, stopping existing loading');
              forceStopLoading();
            }
            setIsOpen(!isOpen);
          }}
          className='relative hover:bg-gray-100 rounded-lg transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center'
          aria-label={t('common.menu.openMenu')}
          aria-expanded={isOpen}
        >
          {stableAuthState.showLoading ? (
            // 로딩 중일 때 shimmer 효과
            <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
          ) : stableAuthState.showUserArea ? (
            // 인증된 사용자 - 프로필 이미지 (크기를 28x28로 더 줄임)
            profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
              <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
            ) : userInfo.avatar_url ? (
              <ProfileImageContainer
                avatarUrl={userInfo.avatar_url}
                width={28}
                height={28}
                borderRadius={6}
                className="w-7 h-7 object-cover"
              />
            ) : (
              <DefaultAvatar width={28} height={28} className="w-7 h-7" />
            )
          ) : (
            // 미인증 사용자 - 햄버거 메뉴 아이콘
            <div className="w-full h-full flex items-center justify-center">
              {isOpen ? (
                <X className="w-5 h-5 text-gray-600" />
              ) : (
                <MenuIcon className="w-5 h-5 text-gray-600" />
              )}
            </div>
          )}
        </button>
      </div>

      {/* 드롭다운 메뉴 - 개선된 디자인 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-dropdown">
          {stableAuthState.showUserArea ? (
            // 인증된 사용자 메뉴
            <>
              {/* 사용자 정보 헤더 섹션 - 더 작은 프로필 이미지 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  {profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
                    <div className="w-12 h-12 rounded-xl shimmer-effect bg-gray-200" />
                  ) : userInfo.avatar_url ? (
                    <ProfileImageContainer
                      avatarUrl={userInfo.avatar_url}
                      width={48}
                      height={48}
                      borderRadius={12}
                      className="ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl ring-2 ring-white shadow-md">
                      <DefaultAvatar width={48} height={48} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {userInfo.name || t('common.user.unknown')}
                    </p>
                    {userInfo.is_admin && (
                      <div className="flex items-center mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {t('common.user.admin')}
                        </span>
                      </div>
                    )}
                    {/* 별사탕 정보 */}
                    <div className="flex items-center mt-1.5 space-x-2">
                      <div className="flex items-center space-x-1">
                        <Star className="w-3 h-3 text-yellow-500 fill-current" />
                        <span className="text-xs font-medium text-gray-700">
                          {(userInfo.star_candy + userInfo.star_candy_bonus).toLocaleString()}
                        </span>
                      </div>
                      {userInfo.star_candy_bonus > 0 && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          +{userInfo.star_candy_bonus.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 메뉴 섹션 */}
              <div className="p-2">
                {/* 네비게이션 메뉴 */}
                {filteredMenuItems.length > 0 && (
                  <div className="mb-2">
                    <div className="space-y-1">
                      {filteredMenuItems.map((item) => {
                        const isActive = isVoteRelatedPath(pathname) && item.type === PortalType.VOTE;
                        return (
                          <NavigationLink
                            key={item.type}
                            href={getLocalizedPath(item.path)}
                            onClick={handleMenuItemClick}
                            className={`flex items-center space-x-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-700 hover:bg-gray-50 hover:translate-x-1'
                            }`}
                          >
                            <span className={isActive ? 'text-white' : 'text-gray-500'}>
                              {getMenuIcon(item.type)}
                            </span>
                            <span className={isActive ? 'text-white' : 'text-gray-700'}>
                              {t(`nav.menu.${item.type}`)}
                            </span>
                            {!isActive && <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />}
                          </NavigationLink>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 마이페이지 링크 - 구분선과 함께 */}
                <div className="pt-2 border-t border-gray-100">
                  {pathname.includes('/mypage') ? (
                    // 현재 마이페이지에 있을 때 - 활성 상태로 표시
                    <div className="flex items-center space-x-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white shadow-md">
                      <Settings className="w-4 h-4 text-white" />
                      <span className="text-white">{t('nav.menu.mypage')}</span>
                    </div>
                  ) : (
                    // 다른 페이지에 있을 때 - 클릭 가능한 링크
                    <NavigationLink
                      href={getLocalizedPath('/mypage')}
                      onClick={handleMenuItemClick}
                      className="flex items-center space-x-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:translate-x-1 transition-all duration-200"
                    >
                      <Settings className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">{t('nav.menu.mypage')}</span>
                      <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />
                    </NavigationLink>
                  )}
                </div>
              </div>
            </>
          ) : (
            // 미인증 사용자 메뉴
            <div className="p-5">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">피크닉에 오신 것을 환영합니다!</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {t('common.auth.loginPrompt')}
                  </p>
                </div>
                
                <NavigationLink
                  href={getLocalizedPath('/login')}
                  onClick={handleMenuItemClick}
                  className="flex items-center justify-center space-x-2 w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  <LogIn className="w-5 h-5" />
                  <span className="font-medium">{t('common.auth.login')}</span>
                </NavigationLink>
              </div>
            </div>
          )}
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
        .animate-dropdown {
          animation: dropdown 0.2s ease-out;
        }
        @keyframes dropdown {
          0% {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default MobileNavigationMenu; 