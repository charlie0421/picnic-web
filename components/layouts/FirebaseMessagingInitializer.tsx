'use client';

import { useEffect } from 'react';

function runWhenIdle(callback: () => void) {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout: 5000 });
  } else {
    setTimeout(callback, 2000);
  }
}

export default function FirebaseMessagingInitializer() {
  const shouldInitializeMessaging =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_FIREBASE_MESSAGING !== 'false';

  useEffect(() => {
    if (!shouldInitializeMessaging) {
      return;
    }

    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const start = async () => {
      try {
        const [{ initializeApp, getApps }, messagingModule] = await Promise.all([
          import('firebase/app'),
          import('firebase/messaging'),
        ]);

        if (!(await messagingModule.isSupported())) {
          return;
        }

        const config = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        };

        if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
          return;
        }

        const app = getApps()[0] ?? initializeApp(config);
        const { getMessaging, getToken, onMessage } = messagingModule;

        const swVersion = process.env.NEXT_PUBLIC_SW_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '1';
        const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?v=${swVersion}`);

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const token = await getToken(getMessaging(app), {
          serviceWorkerRegistration: registration,
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        if (!token) return;

        const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserSupabaseClient();

        try {
          const session = await supabase.auth.getSession();
          if (session.data.session) {
            await supabase.functions.invoke('register-push-token', { body: { platform: 'web', token } });
          } else {
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
              if (event === 'SIGNED_IN') {
                await supabase.functions.invoke('register-push-token', { body: { platform: 'web', token } });
                subscription.unsubscribe();
              }
            });
          }
        } catch (error) {
          console.warn('[FCM] token register failed', error);
        }

        onMessage(getMessaging(app), (payload) => {
          console.log('[FCM] foreground message', payload);
        });
      } catch (error) {
        console.warn('[FCM] init failed', error);
      }
    };

    runWhenIdle(start);
  }, [shouldInitializeMessaging]);

  return null;
}

