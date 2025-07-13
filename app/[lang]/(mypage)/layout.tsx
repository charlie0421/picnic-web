'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/contexts/NavigationContext';
import Footer from '../Footer';
import ExclusiveOpenBadge from '@/components/layouts/ExclusiveOpenBadge';
import { getPortalTypeFromPath } from '@/config/navigation';
import Header from '@/components/layouts/Header';

const MainContent = ({ children }: { children: React.ReactNode }) => {
  const { setCurrentPortalType, navigationState } = useNavigation();
  const pathname = usePathname();
  const hasSetPortalType = useRef(false);

  useEffect(() => {
    // 이미 설정되었거나 pathname이 없으면 실행하지 않음
    if (!pathname || hasSetPortalType.current) {
      return;
    }

    const portalType = getPortalTypeFromPath(pathname);

    // 현재 설정된 포털 타입과 다를 때만 업데이트
    if (navigationState.currentPortalType !== portalType) {
      setCurrentPortalType(portalType);
    }

    // 포털 타입을 설정했음을 표시
    hasSetPortalType.current = true;
  }, [pathname, navigationState.currentPortalType, setCurrentPortalType]);

  return (
    <div className='bg-gradient-to-b from-blue-50 to-white relative'>
      <div className='max-w-6xl mx-auto bg-white shadow-md'>
        <Header />
        <main className='container mx-auto py-0 min-h-screen'>
          <div className='flex flex-col'>
            <div className='w-full'>
              {/* 배타 오픈 뱃지 */}
              <div className='flex justify-center py-1 sm:py-2'>
                <ExclusiveOpenBadge />
              </div>
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

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainContent>{children}</MainContent>;
}
