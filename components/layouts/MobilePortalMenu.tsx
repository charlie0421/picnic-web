'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useAuth } from '@/hooks/useAuth';
import { PortalType } from '@/utils/enums';
import menuConfig from '@/config/menu.json';

interface MobilePortalMenuProps {
  className?: string;
}

const MobilePortalMenu: React.FC<MobilePortalMenuProps> = ({ className = '' }) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.is_admin === true;

  const { currentLocale, getLocalizedPath, extractLocaleFromPath } = useLocaleRouter();
  const { setIsLoading } = useGlobalLoading();
  const pathname = usePathname();

  // 현재 경로에서 로케일 정보 추출
  const { path: currentPath } = extractLocaleFromPath(pathname);

  // 관리자 권한에 따른 메뉴 필터링
  const filteredMenuItems = menuConfig.portals.filter(item => {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    return true;
  });

  // 현재 활성화된 포탈 메뉴 찾기
  const getCurrentActiveMenuItem = () => {
    for (const menuItem of filteredMenuItems) {
      const portalType = menuItem.type as PortalType;
      const isActive =
        currentPath.startsWith(menuItem.path) ||
        (portalType === PortalType.VOTE && currentPath.startsWith('/vote'));
      
      if (isActive) {
        return menuItem;
      }
    }
    return null; // 활성화된 포탈 메뉴가 없으면 null 반환
  };

  const activeMenuItem = getCurrentActiveMenuItem();
  
  const handleLinkClick = (href: string) => {
    if (pathname !== href) {
      setIsLoading(true);
    }
  };

  // 활성화된 포탈 메뉴가 없으면 아무것도 표시하지 않음
  if (!activeMenuItem) return null;

  const localizedMenuPath = getLocalizedPath(activeMenuItem.path, currentLocale);

  return (
    <div className={`flex items-center ${className}`}>
      <Link 
        href={localizedMenuPath}
        onClick={() => handleLinkClick(localizedMenuPath)}
        className={`group relative px-3 py-2 text-base font-medium transition-all duration-200 hover:scale-105 ${
          activeMenuItem ? 'text-blue-600' : 'text-gray-700 hover:text-blue-600'
        }`}
      >
        {activeMenuItem.name}
        
        {/* 호버 시에만 언더라인 표시 (데스크탑과 동일) */}
        <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600 rounded-full transition-all duration-300 w-0 group-hover:w-full`} />
        
        {/* 호버 시 배경 효과 */}
        <div className={`absolute inset-0 bg-blue-50 rounded-lg transition-all duration-200 -z-10 ${
          activeMenuItem ? 'opacity-20' : 'opacity-0 group-hover:opacity-10'
        }`} />
      </Link>
    </div>
  );
};

export default MobilePortalMenu; 