import menuConfig from './menu.json';

export interface PortalMenuItem {
    id: string;
    name: string;
    path: string;
    type: string;
    should_admin?: boolean;
    should_login?: boolean;
    isActive?: boolean;
    subMenus?: MenuItem[];
}

export interface MenuItem {
    key: string;
    name: string;
    path: string;
    i18nKey?: string;
    should_admin?: boolean;
    should_login?: boolean;
    isActive?: boolean;
}

export const PORTAL_MENU: PortalMenuItem[] = menuConfig.portals;
