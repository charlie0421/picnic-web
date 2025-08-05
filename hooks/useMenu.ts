'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import { PORTAL_MENU, MenuItem } from '@/config/navigation';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const useMenu = () => {
  const pathname = usePathname();
  const { isAuthenticated, user, isLoading: isAuthLoading } = useAuth();

  const { data: profileData, isLoading: isSWRProfileLoading } = useSWR(
    isAuthenticated && user ? `/api/user/profile?userId=${user.id}` : null,
    fetcher
  );

  const isProfileLoading = isAuthLoading || isSWRProfileLoading;
  const userProfile = profileData?.success ? profileData.user : null;

  const isAdmin = !isProfileLoading && (
    userProfile?.is_admin ||
    userProfile?.is_super_admin ||
    user?.user_metadata?.is_admin ||
    user?.user_metadata?.is_super_admin ||
    (process.env.NODE_ENV === 'development' && isAuthenticated)
  );

  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';

  const activePortal = PORTAL_MENU.find(portal => {
    if (pathWithoutLocale.startsWith(portal.path)) {
      return true;
    }
    if (portal.subMenus) {
      return portal.subMenus.some(subMenu => pathWithoutLocale.startsWith(subMenu.path));
    }
    return false;
  });

  const portalMenuItems = PORTAL_MENU
    .filter(item => !(item.should_admin && !isAdmin))
    .map(item => ({
      ...item,
      isActive: item.id === activePortal?.id,
    }));
  
  const subMenuItems = (activePortal?.subMenus || [])
    .filter(item => !(item.should_admin && !isAdmin))
    .map(item => ({
      ...item,
      isActive: pathWithoutLocale.startsWith(item.path),
    }));

  return {
    isAuthenticated,
    userProfile,
    isAdmin,
    portalMenuItems,
    subMenuItems,
    activePortal,
    isAuthLoading,
    isProfileLoading,
  };
};
