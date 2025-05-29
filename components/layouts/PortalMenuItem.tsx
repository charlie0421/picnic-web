'use client';

import {usePathname} from 'next/navigation';
import {PortalType} from '@/utils/enums';
import {isVoteRelatedPath, PORTAL_MENU} from '@/config/navigation';
import menuConfig from '@/config/menu.json';
import { LocalizedLink } from '@/components/ui/LocalizedLink';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

interface PortalMenuItemProps {
  portalType: PortalType;
}

const PortalMenuItem: React.FC<PortalMenuItemProps> = ({ portalType }) => {
  const pathName = usePathname();
  const { currentLocale } = useLocaleRouter();

  // 설정에서 메뉴 정보 가져오기
  const menuItem = PORTAL_MENU.find((item) => item.type === portalType);
  const portalConfig = menuConfig.portals.find(portal => portal.type === portalType);

  if (!menuItem || !portalConfig) return null;

  // 현재 언어를 고려한 경로 비교
  const localizedMenuPath = `/${currentLocale}${menuItem.path}`;
  
  // 특수 케이스: 리워드 페이지 방문 시 VOTE 메뉴 활성화
  const isActive =
    pathName.startsWith(localizedMenuPath) ||
    pathName.startsWith(menuItem.path) ||
    (portalType === PortalType.VOTE && isVoteRelatedPath(pathName));

  return (
    <LocalizedLink href={menuItem.path}>
      <div
        className={`px-2 py-1 mx-1 cursor-pointer rounded-lg transition-colors ${
          isActive ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {menuItem.name}
      </div>
    </LocalizedLink>
  );
};

export default PortalMenuItem;
