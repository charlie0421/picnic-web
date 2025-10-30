'use client';
import React, { useEffect } from 'react';
import Header from '@/components/layouts/Header';
import { useMenu } from '@/hooks/useMenu';
import NavigationLink from '@/components/client/NavigationLink';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslations } from '@/hooks/useTranslations';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';
import { usePathname } from 'next/navigation';

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
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function useFirebaseMessaging() {
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        if (!('serviceWorker' in navigator)) return;
        const { initializeApp } = await import('firebase/app');
        const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
        if (!(await isSupported())) return;
        const app = initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
        });
        const messaging = getMessaging(app);
        const swVersion = process.env.NEXT_PUBLIC_SW_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '1';
        const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?v=${swVersion}`);

        // 명시적 권한 요청 (일부 브라우저는 getToken만으로 부족)
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.warn('[FCM] notification permission not granted');
            return;
          }
        }

        const token = await getToken(messaging, { serviceWorkerRegistration: reg, vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
        if (token) {
          const supabase = createBrowserSupabaseClient();
          try {
            const sess = await supabase.auth.getSession();
            if (sess.data.session) {
              await supabase.functions.invoke('register-push-token', { body: { platform: 'web', token } });
              console.log('[FCM] token register success (immediate)');
            } else {
              // 로그인 이후로 지연 등록 (Supabase v2: (event, session))
              const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
                try {
                  if (event === 'SIGNED_IN') {
                    await supabase.functions.invoke('register-push-token', { body: { platform: 'web', token } });
                    console.log('[FCM] token register success (deferred)');
                    subscription.unsubscribe();
                  }
                } catch (e) {
                  console.warn('[FCM] deferred token register failed', e);
                }
              });
            }
          } catch (e) {
            console.warn('[FCM] token register failed', e);
          }
        } else {
          console.warn('[FCM] getToken returned empty token');
        }
        unsub = onMessage(messaging, (payload) => {
          console.log('[FCM] foreground message', payload);
        });
      } catch (e) {
        console.warn('[FCM] init failed', e);
      }
    })();
    return () => { if (unsub) unsub(); };
  }, []);
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  useFirebaseMessaging();
  const pathname = usePathname();
  const hideBetaNotice = pathname?.includes('/concert2025');
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {!hideBetaNotice && (
        <div className='flex justify-center py-1 sm:py-2 bg-yellow-100'>
          <ExclusiveOpenBadge />
        </div>
      )}
      <SubMenu />
      <main className="flex-1 container mx-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
