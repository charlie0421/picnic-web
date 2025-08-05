'use client';
import React from 'react';
import Header from '@/components/layouts/Header';
import { useMenu } from '@/hooks/useMenu';
import NavigationLink from '@/components/client/NavigationLink';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslations } from '@/hooks/useTranslations';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';

const SubMenu: React.FC = () => {
  const { subMenuItems } = useMenu();
  const { getLocalizedPath } = useLocaleRouter();
  const { tDynamic: t } = useTranslations();

  if (!subMenuItems || subMenuItems.length === 0) {
    return null;
  }

  return (
    <div className='border-b border-gray-100'>
      <div className='container mx-auto px-4'>
        <div className='flex items-center space-x-2 py-2 overflow-x-auto scrollbar-hide'>
           {subMenuItems.map((menuItem) => {
             const translatedText = menuItem.i18nKey ? t(menuItem.i18nKey) : menuItem.name;
             
             return (
               <NavigationLink
                 key={menuItem.key}
                 href={getLocalizedPath(menuItem.path)}
                 should_login={menuItem.should_login}
                 className={`flex-shrink-0 px-3 py-1.5 text-sm rounded-full transition-colors duration-200 ${
                   menuItem.isActive
                     ? 'font-semibold text-white bg-primary'
                     : 'text-gray-600 hover:text-sub hover:bg-gray-100'
                 }`}
               >
                 {translatedText}
               </NavigationLink>
             );
           })}
        </div>
      </div>
    </div>
  );
};

import Footer from '@/components/layouts/Footer';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className='flex justify-center py-1 sm:py-2 bg-yellow-100'>
        <ExclusiveOpenBadge />
      </div>
      <SubMenu />
      <main className="flex-1 container mx-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
