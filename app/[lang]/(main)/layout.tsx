'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useNavigation } from '@/contexts/NavigationContext';
import { useLanguageStore } from '@/stores/languageStore';
import Footer from '../Footer';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';
import { getPortalTypeFromPath } from '@/config/navigation';
import Header from '@/components/layouts/Header';
import { getPopups } from '@/utils/api/queries';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import PopupBanner from '@/components/client/vote/dialogs/PopupBanner';
import { Menu } from '@/components/client/vote';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
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
        // 서버에서 이미 start_at/stop_at 조건으로 필터링된 활성 팝업만 가져옴
        const popups = await getPopups();
        if (!popups || popups.length === 0) return;
        
        const now = new Date();
        // 클라이언트에서는 localStorage 숨김 상태와 플랫폼만 체크
        const filteredPopups = popups.filter((popup: any) => {
          const popupKey = popup.id;
          const hideUntil = typeof window !== 'undefined' ? localStorage.getItem(`hide_popup_${popupKey}`) : null;
          
          // 사용자가 7일간 숨김 설정한 팝업 제외
          if (hideUntil && new Date(hideUntil) > now) return false;
          
          // 플랫폼 체크 (web 또는 all만 표시)
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
    // 서버에서 필터링된 팝업이 있고, 클라이언트 필터링도 통과한 팝업이 있으면 팝업 열기
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
              {/* 배타 오픈 뱃지 */}
              <div className='flex justify-center py-1 sm:py-2'>
                <ExclusiveOpenBadge />
              </div>
              {/* 서브 메뉴 - 이용약관, 개인정보처리방침 페이지에서는 숨김 */}
              {!pathname.includes('/terms') && !pathname.includes('/privacy') && (
                <div className='bg-gray-50 border-b'>
                  <div className='container mx-auto px-0'>
                    <Menu />
                  </div>
                </div>
              )}
              {/* 메인 콘텐츠 */}
              {children}
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default MainLayout;