'use client';

import { useEffect } from 'react';

interface FirebaseAnalyticsTrackerProps {
  pathname: string;
}

function runWhenIdle(callback: () => void) {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout: 5000 });
  } else {
    setTimeout(callback, 1500);
  }
}

export default function FirebaseAnalyticsTracker({ pathname }: FirebaseAnalyticsTrackerProps) {
  const shouldTrackAnalytics =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_FIREBASE_ANALYTICS !== 'false';

  useEffect(() => {
    if (!shouldTrackAnalytics) {
      return;
    }

    if (typeof window === 'undefined') return;

    runWhenIdle(async () => {
      try {
        const [{ initializeApp, getApps }, analyticsModule] = await Promise.all([
          import('firebase/app'),
          import('firebase/analytics'),
        ]);

        if (!(await analyticsModule.isSupported())) {
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

        if (!config.apiKey || !config.projectId || !config.appId || !config.measurementId) {
          return;
        }

        const app = getApps()[0] ?? initializeApp(config);
        const analytics = analyticsModule.getAnalytics(app);

        analyticsModule.logEvent(analytics, 'page_view', {
          page_path: pathname,
          page_location: window.location.href,
          page_title: document.title,
          debug_mode: process.env.NODE_ENV !== 'production',
        });
      } catch (error) {
        console.warn('[FirebaseAnalytics] failed to log page_view', error);
      }
    });
  }, [pathname, shouldTrackAnalytics]);

  return null;
}

