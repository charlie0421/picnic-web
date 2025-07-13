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
  Image as PictureIcon,
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
  const { tDynamic: t, currentLanguage, translations } = useTranslations();

  // 안전한 중첩 번역 함수
  const getMenuTranslation = (type: string): string => {
    // 먼저 중첩 구조에서 시도
    if (translations?.nav?.menu?.[type]) {
      return translations.nav.menu[type];
    }
    
    // 평면화된 키로 시도
    const flatKey = `nav_${type}`;
    if (translations?.[flatKey]) {
      return translations[flatKey];
    }
    
    // 폴백 매핑
    const fallbackMap: Record<string, string> = {
      vote: '투표',
      community: '커뮤니티', 
      pic: 'PIC',
      novel: '소설',
      mypage: '마이페이지'
    };
    
    return fallbackMap[type] || type;
  };

  // 안정적인 인증 상태 관리
  const stableAuthState = {
    showLoading: isLoading && !isAuthenticated, // 인증되지 않은 상태에서만 로딩 표시
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
      case 'pic': return <PictureIcon className="w-4 h-4" />;
      case 'novel': return <BookOpen className="w-4 h-4" />;
      default: return <ChevronRight className="w-4 h-4" />;
    }
  };

  // 프로필 이미지 로딩 상태
  const profileImageLoading = stableAuthState.showUserArea && !userInfo.name && isLoading;

  // 관리자 권한에 따른 메뉴 필터링
  const getFilteredMenuItems = () => {
    const adminOnlyPortals = [PortalType.COMMUNITY, PortalType.PIC, PortalType.NOVEL];
    
    return PORTAL_MENU.filter(item => {
      if (adminOnlyPortals.includes(item.type as PortalType)) {
        return userInfo.is_admin;
      }
      return true;
    });
  };

  const filteredMenuItems = getFilteredMenuItems();

  // 메뉴 항목 클릭 핸들러
  const handleMenuItemClick = () => {
    setIsOpen(false);
  };

  // 비로그인 상태에서 프로필 이미지 클릭 핸들러 (마이페이지로 이동)
  const handleGuestProfileClick = () => {
    window.location.href = getLocalizedPath('/mypage');
  };

  // 로그인 상태에서 프로필 이미지 클릭 핸들러 (다이얼로그 토글)
  const handleAuthenticatedProfileClick = () => {
    // 메뉴를 열 때 기존 로딩이 있다면 중지
    if (!isOpen && globalLoading) {
      console.log('🔍 [MobileNav] Menu opening, stopping existing loading');
      forceStopLoading();
    }
    setIsOpen(!isOpen);
  };

  // 키보드 이벤트 핸들러
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

  // 외부 클릭 감지
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
          onClick={stableAuthState.showUserArea ? handleAuthenticatedProfileClick : handleGuestProfileClick}
          className='relative hover:bg-gray-100 rounded-lg transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center'
          aria-label={stableAuthState.showUserArea ? t('common.menu.openMenu') : t('common.auth.login')}
          aria-expanded={stableAuthState.showUserArea ? isOpen : false}
        >
          {stableAuthState.showLoading ? (
            // 로딩 중일 때 shimmer 효과
            <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
          ) : stableAuthState.showUserArea ? (
            // 인증된 사용자 - 프로필 이미지 (크기를 24x24로 더 줄임)
            profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
              <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
            ) : userInfo.avatar_url ? (
              <ProfileImageContainer
                avatarUrl={userInfo.avatar_url}
                width={24}
                height={24}
                borderRadius={6}
                className="w-6 h-6 object-cover"
              />
            ) : (
              <DefaultAvatar width={24} height={24} className="w-6 h-6" />
            )
          ) : (
            // 미인증 사용자 - 햄버거 메뉴 아이콘
            <div className="w-full h-full flex items-center justify-center">
              <MenuIcon className="w-5 h-5 text-gray-600" />
            </div>
          )}
        </button>
      </div>

      {/* 드롭다운 메뉴 - 로그인 상태에서만 표시 */}
      {isOpen && stableAuthState.showUserArea && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden animate-dropdown">
          {/* 심플한 사용자 정보 헤더 */}
          <div className="bg-gray-50 p-2.5 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              {profileImageLoading || (isAuthenticated && !userInfo.avatar_url && userProfile === null) ? (
                <div className="w-6 h-6 rounded-md shimmer-effect bg-gray-200" />
              ) : userInfo.avatar_url ? (
                <ProfileImageContainer
                  avatarUrl={userInfo.avatar_url}
                  width={48}
                  height={48}
                  borderRadius={4}
                />
              ) : (
                <div className="rounded-md ring-1 ring-gray-200">
                  <DefaultAvatar width={48} height={48} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userInfo.name || t('common.user.unknown')}
                </p>
                <div className="flex items-center space-x-2 mt-0.5">
                  <div className="flex items-center space-x-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-current" />
                    <span className="text-xs text-gray-600">
                      {userInfo.star_candy.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      +{userInfo.star_candy_bonus.toLocaleString()}
                    </span>
                  </div>
                  {userInfo.is_admin && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      관리자
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 메뉴 섹션 */}
          <div className="py-1.5">
            {/* 네비게이션 메뉴 */}
            {filteredMenuItems.length > 0 && (
              <div className="px-2 space-y-1">
                {filteredMenuItems.map((item) => {
                  const isActive = isVoteRelatedPath(pathname) && item.type === PortalType.VOTE;
                  const translatedText = getMenuTranslation(item.type);
                  
                  return (
                    <NavigationLink
                      key={item.type}
                      href={getLocalizedPath(item.path)}
                      onClick={handleMenuItemClick}
                      className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className={isActive ? 'text-blue-600' : 'text-gray-500'}>
                        {getMenuIcon(item.type)}
                      </span>
                      <span>{translatedText}</span>
                    </NavigationLink>
                  );
                })}
              </div>
            )}

            {/* 마이페이지 링크 */}
            <div className="px-2 mt-1.5 pt-1.5 border-t border-gray-100">
              {pathname.includes('/mypage') ? (
                <div className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm bg-blue-100 text-blue-700">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <span>{getMenuTranslation('mypage')}</span>
                </div>
              ) : (
                <NavigationLink
                  href={getLocalizedPath('/mypage')}
                  onClick={handleMenuItemClick}
                  className="flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span>{getMenuTranslation('mypage')}</span>
                </NavigationLink>
              )}
            </div>
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
        .animate-dropdown {
          animation: dropdown 0.15s ease-out;
        }
        @keyframes dropdown {
          0% {
            opacity: 0;
            transform: translateY(-5px) scale(0.98);
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