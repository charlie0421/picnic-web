'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Popup } from '@/types/interfaces';
import Header from '@/components/layouts/Header';
import Footer from '@/components/layouts/Footer';
import { PicnicMenu } from '@/components/client/common/PicnicMenu';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface MainLayoutClientProps {
  children: React.ReactNode;
}

const MainLayoutClient = ({ children }: MainLayoutClientProps) => {
  const pathname = usePathname();
  const { data: popups, error: popupsError } = useSWR<Popup[]>('/api/popups', fetcher);
  const [activePopup, setActivePopup] = useState<Popup | null>(null);

  useEffect(() => {
    if (popups && popups.length > 0) {
      setActivePopup(popups[0]);
    }
  }, [popups]);

  const handleClosePopup = () => {
    setActivePopup(null);
  };
  
  if (popupsError) console.error('Failed to load popups', popupsError);

  // Firebase Analytics: mypage 섹션 포함 전역 page_view 로깅
  useEffect(() => {
    (async () => {
      try {
        const { isSupported, getAnalytics, logEvent } = await import('firebase/analytics');
        if (!(await isSupported())) return;
        const { getApps, initializeApp } = await import('firebase/app');
        const app = getApps()[0] ?? initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        });
        const analytics = getAnalytics(app);
        logEvent(analytics, 'page_view', {
          page_path: pathname || '/',
          page_location: typeof window !== 'undefined' ? window.location.href : undefined,
          page_title: typeof document !== 'undefined' ? document.title : undefined,
          debug_mode: process.env.NODE_ENV !== 'production',
        });
      } catch {
        // analytics 사용 불가 시 무시
      }
    })();
  }, [pathname]);

  const childrenArray = React.Children.toArray(children);
  const picnicMenu = childrenArray.find(
    (child) => React.isValidElement(child) && child.type === PicnicMenu
  );
  const mainContent = childrenArray.filter(
    (child) => !(React.isValidElement(child) && child.type === PicnicMenu)
  );

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="container mx-auto px-4">
        <Header />
      </div>
      
      {picnicMenu}
      
      <main className="flex-grow container mx-auto px-4 py-4">
        {mainContent}
      </main>

      <div className="container mx-auto px-4">
        <Footer />
      </div>
    </div>
  );
};

export default MainLayoutClient;
