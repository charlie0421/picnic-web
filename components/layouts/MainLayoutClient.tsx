'use client';

import React, { ComponentType, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layouts/Header';
import Footer from '@/components/layouts/Footer';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay';
import { GlobalNotifications } from '@/components/common/GlobalNotifications';
import { Analytics } from '@vercel/analytics/react';
import { useMenu } from '@/hooks/useMenu';
import NavigationLink from '@/components/client/NavigationLink';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslations } from '@/hooks/useTranslations';
import { usePathname } from 'next/navigation';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_FIREBASE_MESSAGING =
  IS_PRODUCTION && process.env.NEXT_PUBLIC_ENABLE_FIREBASE_MESSAGING !== 'false';
const ENABLE_FIREBASE_ANALYTICS =
  IS_PRODUCTION && process.env.NEXT_PUBLIC_ENABLE_FIREBASE_ANALYTICS !== 'false';
const ENABLE_VERCEL_ANALYTICS = IS_PRODUCTION;

const FirebaseMessagingInitializerComponent: ComponentType | null =
  ENABLE_FIREBASE_MESSAGING
    ? dynamic(
        () => import('@/components/layouts/FirebaseMessagingInitializer'),
        { ssr: false, loading: () => null },
      )
    : null;

const FirebaseAnalyticsTrackerComponent: ComponentType<{ pathname: string }> | null =
  ENABLE_FIREBASE_ANALYTICS
    ? dynamic(
        () => import('@/components/layouts/FirebaseAnalyticsTracker'),
        { ssr: false, loading: () => null },
      )
    : null;

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

interface MainLayoutClientProps {
  children: React.ReactNode;
  initialLanguage: string;
}

export default function MainLayoutClient({ children, initialLanguage }: MainLayoutClientProps) {
  const pathname = usePathname();
  const hideBetaNotice = pathname?.includes('/concert2025');

  return (
    <NavigationProvider>
      <GlobalLoadingProvider>
        <LanguageSyncProvider initialLanguage={initialLanguage}>
          <AuthProvider>
            <NotificationProvider>
              <DialogProvider>
                <AuthRedirectHandler>
                  <Header />
                  {!hideBetaNotice && <ExclusiveOpenBadge />}
                  <SubMenu />
                  <main className='flex-1 container mx-auto'>
                    {children}
                  </main>
                  <Footer />
                  <GlobalNotifications />
                  <GlobalLoadingOverlay />
                  {ENABLE_FIREBASE_MESSAGING && FirebaseMessagingInitializerComponent && (
                    <Suspense fallback={null}>
                      <FirebaseMessagingInitializerComponent />
                    </Suspense>
                  )}
                  {ENABLE_FIREBASE_ANALYTICS && FirebaseAnalyticsTrackerComponent && (
                    <Suspense fallback={null}>
                      <FirebaseAnalyticsTrackerComponent pathname={pathname || '/'} />
                    </Suspense>
                  )}
                  {ENABLE_VERCEL_ANALYTICS && <Analytics />}
                </AuthRedirectHandler>
              </DialogProvider>
            </NotificationProvider>
          </AuthProvider>
        </LanguageSyncProvider>
      </GlobalLoadingProvider>
    </NavigationProvider>
  );
}

