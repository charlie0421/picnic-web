'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import {PortalType} from '@/utils/enums';
import {isVoteRelatedPath, PORTAL_MENU} from '@/config/navigation';
import menuConfig from '@/config/menu.json';

interface PortalMenuItemProps {
  portalType: PortalType;
}

const PortalMenuItem = ({ portalType }: PortalMenuItemProps) => {
  const { currentLocale, getLocalizedPath, extractLocaleFromPath } = useLocaleRouter();
  const { setIsLoading } = useGlobalLoading();
  const pathname = usePathname();

  // 설정에서 메뉴 정보 가져오기
  const menuItem = PORTAL_MENU.find((item) => item.type === portalType);
  const portalConfig = menuConfig.portals.find(portal => portal.type === portalType);

  if (!menuItem || !portalConfig) return null;

  // 현재 경로에서 로케일 정보 추출
  const { path: currentPath } = extractLocaleFromPath(pathname);
  
  // 로케일화된 메뉴 경로 생성
  const localizedMenuPath = getLocalizedPath(menuItem.path, currentLocale);

  // 특수 케이스: 리워드 페이지 방문 시 VOTE 메뉴 활성화
  const isActive =
    currentPath.startsWith(menuItem.path) ||
    (portalType === PortalType.VOTE && isVoteRelatedPath(currentPath));

  const handleClick = () => {
    console.log('🔍 [PortalMenuItem] Link click:', {
      portalType,
      localizedMenuPath,
      currentPathname: pathname,
      isSamePage: pathname === localizedMenuPath
    });
    
    if (pathname !== localizedMenuPath) {
      console.log('🔍 [PortalMenuItem] Starting loading for navigation to:', localizedMenuPath);
      setIsLoading(true);
    } else {
      console.log('🔍 [PortalMenuItem] Same page detected, not starting loading');
    }
  };

  return (
    <Link 
      href={localizedMenuPath}
      prefetch={true}
      onClick={handleClick}
      className={`group relative px-3 py-2 text-base font-medium transition-all duration-200 hover:scale-105 ${
        isActive 
          ? 'text-blue-600' 
          : 'text-gray-700 hover:text-blue-600'
      }`}
    >
      {menuItem.name}
      
      {/* 활성 상태일 때 하단 언더라인 */}
      <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600 rounded-full transition-all duration-300 ${
        isActive ? 'w-full' : 'w-0 group-hover:w-full'
      }`} />
      
      {/* 호버 시 배경 효과 */}
      <div className={`absolute inset-0 bg-blue-50 rounded-lg transition-all duration-200 -z-10 ${
        isActive ? 'opacity-20' : 'opacity-0 group-hover:opacity-10'
      }`} />
    </Link>
  );
};

export default PortalMenuItem;
