'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useAuth } from '@/lib/supabase/auth-provider';
import { PortalType } from '@/utils/enums';
import { isVoteRelatedPath, PORTAL_MENU } from '@/config/navigation';
import menuConfig from '@/config/menu.json';

interface MobilePortalMenuProps {
  className?: string;
}

const MobilePortalMenu: React.FC<MobilePortalMenuProps> = ({ className = '' }) => {
  const { isAuthenticated, userProfile, user, isLoading } = useAuth();
  const { currentLocale, getLocalizedPath, extractLocaleFromPath } = useLocaleRouter();
  const { setIsLoading } = useGlobalLoading();
  const pathname = usePathname();

  // 현재 경로에서 로케일 정보 추출
  const { path: currentPath } = extractLocaleFromPath(pathname);

  // 관리자 권한에 따른 메뉴 필터링
  const getFilteredMenuItems = () => {
    return PORTAL_MENU.filter(item => {
      // VOTE는 항상 표시
      if (item.type === PortalType.VOTE) return true;
      
      // 나머지는 관리자만 표시
      if (!isAuthenticated || isLoading) return false;
      
      const isAdmin = userProfile?.is_admin || 
                     userProfile?.is_super_admin || 
                     user?.user_metadata?.is_admin || 
                     user?.user_metadata?.is_super_admin;

      // 개발 환경에서 임시 관리자 권한
      const isDevTempAdmin = process.env.NODE_ENV === 'development' && 
                            isAuthenticated && 
                            !isLoading && 
                            user;

      return isAdmin || isDevTempAdmin;
    });
  };

  const filteredMenuItems = getFilteredMenuItems();

  const handleLinkClick = (href: string) => {
    if (pathname !== href) {
      setIsLoading(true);
    }
  };

  if (filteredMenuItems.length === 0) return null;

  return (
    <div className={`flex items-center space-x-4 overflow-x-auto scrollbar-hide ${className}`}>
      {filteredMenuItems.map((menuItem) => {
        const portalConfig = menuConfig.portals.find(portal => portal.type === menuItem.type);
        if (!portalConfig) return null;

        const localizedMenuPath = getLocalizedPath(menuItem.path, currentLocale);
        
        const isActive =
          currentPath.startsWith(menuItem.path) ||
          (menuItem.type === PortalType.VOTE && isVoteRelatedPath(currentPath));

        return (
          <Link 
            key={menuItem.type}
            href={localizedMenuPath}
            prefetch={true}
            onClick={() => handleLinkClick(localizedMenuPath)}
            className={`relative whitespace-nowrap text-sm font-medium transition-colors ${
              isActive 
                ? 'text-blue-600' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {menuItem.name}
            {/* 활성 상태일 때 하단 언더라인 */}
            {isActive && (
              <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </Link>
        );
      })}
    </div>
  );
};

export default MobilePortalMenu; 