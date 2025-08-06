'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';
import { PortalType } from '@/utils/enums';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import menuConfig from '@/config/menu.json';

interface PortalMenuItemProps {
  portalType: PortalType;
}

const PortalMenuItem = ({ portalType }: PortalMenuItemProps) => {
  const { userProfile } = useAuth();
  const { currentLocale, getLocalizedPath, extractLocaleFromPath } = useLocaleRouter();
  const pathname = usePathname();
  const isAdmin = userProfile?.is_admin === true;

  const portalConfig = menuConfig.portals.find(portal => portal.type === portalType);

  if (!portalConfig || (portalConfig.adminOnly && !isAdmin)) {
    return null;
  }

  // 현재 경로에서 로케일 정보 추출
  const { path: currentPath } = extractLocaleFromPath(pathname);
  
  // 로케일화된 메뉴 경로 생성
  const localizedMenuPath = getLocalizedPath(portalConfig.path, currentLocale);

  // 특수 케이스: 리워드 페이지 방문 시 VOTE 메뉴 활성화
  const isActive =
    currentPath.startsWith(portalConfig.path) ||
    (portalType === PortalType.VOTE && currentPath.startsWith('/vote'));

  return (
    <NavigationLink 
      href={localizedMenuPath}
      className={`group relative px-3 py-2 text-base font-medium transition-all duration-200 hover:scale-105 ${
        isActive 
          ? 'text-blue-600' 
          : 'text-gray-700 hover:text-blue-600'
      }`}
    >
      {portalConfig.name}
      
      {/* 활성 상태일 때 하단 언더라인 */}
      <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600 rounded-full transition-all duration-300 ${
        isActive ? 'w-full' : 'w-0 group-hover:w-full'
      }`} />
      
      {/* 호버 시 배경 효과 */}
      <div className={`absolute inset-0 bg-blue-50 rounded-lg transition-all duration-200 -z-10 ${
        isActive ? 'opacity-20' : 'opacity-0 group-hover:opacity-10'
      }`} />
    </NavigationLink>
  );
};

export default PortalMenuItem;
