'use client';

import React, { useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useNavigation } from '@/contexts/NavigationContext';
import Footer from '../Footer';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';
import { getPortalTypeFromPath } from '@/config/navigation';
import Header from '@/components/layouts/Header';
import { getPopups } from '@/utils/api/queries';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import PopupBanner from '@/components/client/vote/dialogs/PopupBanner';
import { Menu } from '@/components/client/vote';

interface MainLayoutClientProps {
  children: ReactNode;
}

const MainLayoutClient: React.FC<MainLayoutClientProps> = ({ children }) => {
  const { setCurrentPortalType } = useNavigation();
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupSlides, setPopupSlides] = useState<any[]>([]);

  useEffect(() => {
    const portalType = getPortalTypeFromPath(pathname);
    setCurrentPortalType(portalType);
  }, [pathname, setCurrentPortalType]);

  useEffect(() => {
    async function fetchPopupResource() {
      try {
        const popups = await getPopups();
        if (!popups || popups.length === 0) return;
        
        const now = new Date();
        const filteredPopups = popups.filter((popup: any) => {
          const popupKey = popup.id;
          const hideUntil = typeof window !== 'undefined' ? localStorage.getItem(`hide_popup_${popupKey}`) : null;
          
          if (hideUntil && new Date(hideUntil) > now) return false;
          
          const platform = popup.platform || 'all';
          if (!(platform === 'all' || platform === 'web')) return false;
          
          return true;
        });

        setPopupSlides(
          filteredPopups.map((popup: any) => ({
            imageUrl: getCdnImageUrl(getLocalizedString(popup.image)),
            title: getLocalizedString(popup.title),
            content: getLocalizedString(popup.content),
            popupKey: popup.id,
            startAt: popup.startAt,
            stopAt: popup.stopAt,
            platform: popup.platform || 'all',
          }))
        );
      } catch (e) {
        console.error('[fetchPopupResource] 팝업 데이터 로드 실패:', e);
      }
    }
    fetchPopupResource();
  }, []);

  useEffect(() => {
    if (popupSlides.length > 0) {
      setIsPopupOpen(true);
    }
  }, [popupSlides]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const handleCloseFor7Days = () => {
    if (!popupSlides[currentSlide]) return;
    const popupKey = popupSlides[currentSlide].popupKey;
    const hideUntil = new Date();
    hideUntil.setDate(hideUntil.getDate() + 7);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`hide_popup_${popupKey}`, hideUntil.toISOString());
    }
    setIsPopupOpen(false);
  };

  useEffect(() => {
    // 추가 인증 관련 로직이 있을 수 있음
  }, [isAuthenticated, isLoading]);

  return (
    <div className='bg-gradient-to-b from-blue-50 to-white relative'>
      {popupSlides.length > 0 && (
        <PopupBanner
          isOpen={isPopupOpen}
          onClose={() => setIsPopupOpen(false)}
          onCloseFor7Days={handleCloseFor7Days}
          slides={popupSlides}
        />
      )}
      <div className='max-w-6xl mx-auto bg-white shadow-md'>
        <Header />
        <main className='container mx-auto py-0 min-h-screen'>
          <div className='flex flex-col'>
            <div className='w-full'>
              <div className='flex justify-center py-1 sm:py-2'>
                <ExclusiveOpenBadge />
              </div>
              {!pathname.includes('/terms') && !pathname.includes('/privacy') && (
                <div className='bg-gray-50 border-b'>
                  <div className='container mx-auto px-0'>
                    <Menu />
                  </div>
                </div>
              )}
              {children}
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default MainLayoutClient; 