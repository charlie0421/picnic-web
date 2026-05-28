'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Popup } from '@/types/interfaces';
import Header from '@/components/layouts/Header';
import Footer from '@/components/layouts/Footer';
import { PicnicMenu } from '@/components/client/common/PicnicMenu';
import PopupBanner from '@/components/client/vote/dialogs/PopupBanner';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface MainLayoutClientProps {
  children: React.ReactNode;
}

interface PopupSlide {
  imageUrl: string;
  title: string;
  content: string;
  popupKey: number;
}

const MainLayoutClient = ({ children }: MainLayoutClientProps) => {
  const pathname = usePathname();
  const { data: popups, error: popupsError } = useSWR<Popup[]>('/api/popups', fetcher);
  const [popupSlides, setPopupSlides] = useState<PopupSlide[]>([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [currentSlide] = useState(0);

  useEffect(() => {
    if (!popups || popups.length === 0) return;

    const now = new Date();
    const filtered = popups.filter((popup) => {
      const hideUntil =
        typeof window !== 'undefined'
          ? localStorage.getItem(`hide_popup_${popup.id}`)
          : null;
      if (hideUntil && new Date(hideUntil) > now) return false;

      const platform = popup.platform || 'all';
      if (!(platform === 'all' || platform === 'web')) return false;

      return true;
    });

    setPopupSlides(
      filtered.map((popup) => ({
        imageUrl: getCdnImageUrl(getLocalizedString(popup.image)),
        title: getLocalizedString(popup.title),
        content: getLocalizedString(popup.content),
        popupKey: popup.id,
      })),
    );
  }, [popups]);

  useEffect(() => {
    if (popupSlides.length > 0) setIsPopupOpen(true);
  }, [popupSlides]);

  const handleClosePopup = () => setIsPopupOpen(false);

  const handleCloseFor7Days = () => {
    const slide = popupSlides[currentSlide];
    if (!slide) return;
    const hideUntil = new Date();
    hideUntil.setDate(hideUntil.getDate() + 7);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`hide_popup_${slide.popupKey}`, hideUntil.toISOString());
    }
    setIsPopupOpen(false);
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

      <PopupBanner
        isOpen={isPopupOpen}
        onClose={handleClosePopup}
        onCloseFor7Days={handleCloseFor7Days}
        slides={popupSlides}
      />
    </div>
  );
};

export default MainLayoutClient;
