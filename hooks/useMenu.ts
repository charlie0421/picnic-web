'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import menuConfig from '@/config/menu.json';
import { PortalMenuItem, MenuItem } from '@/config/navigation';

export const useMenu = () => {
  const pathname = usePathname();
  const { isAuthenticated, userProfile, isLoading: isAuthLoading } = useAuth();

  const isProfileLoading = isAuthLoading;
  const isAdmin = userProfile?.is_admin === true;

  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';

  const portalMenuItems: PortalMenuItem[] = menuConfig.portals;

  const activePortal = portalMenuItems.find(portal => {
    if (pathWithoutLocale.startsWith(portal.path)) {
      return true;
    }
    if (portal.subMenus) {
      return portal.subMenus.some(subMenu => pathWithoutLocale.startsWith(subMenu.path));
    }
    return false;
  });

  const filteredPortalMenuItems = portalMenuItems
    .filter(item => !(item.adminOnly && !isAdmin))
    .map(item => ({
      ...item,
      isActive: item.id === activePortal?.id,
    }));
  
  const subMenuItems = (activePortal?.subMenus || [])
    .filter(item => !(item.adminOnly && !isAdmin))
    .map(item => ({
      ...item,
      isActive: pathWithoutLocale.startsWith(item.path),
    }));

  return {
    isAuthenticated,
    userProfile,
    isAdmin,
    portalMenuItems: filteredPortalMenuItems,
    subMenuItems,
    activePortal,
    isAuthLoading,
    isProfileLoading,
  };
};
