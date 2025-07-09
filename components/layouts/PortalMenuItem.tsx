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
    if (pathname !== localizedMenuPath) {
      setIsLoading(true);
    }
  };

  return (
    <Link 
      href={localizedMenuPath}
      prefetch={true}
      onClick={handleClick}
    >
      <div
        className={`px-2 py-1 mx-1 cursor-pointer rounded-lg transition-colors ${
          isActive ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {menuItem.name}
      </div>
    </Link>
  );
};

export default PortalMenuItem;
