'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface GlobalLoadingContextType {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  forceStopLoading: () => void;
}

export const GlobalLoadingContext = createContext<GlobalLoadingContextType | undefined>(undefined);

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const quickReleaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCallbackPage = pathname?.includes('/auth/callback');

  // 커스텀 이벤트 리스너 등록 (콜백 페이지에서 즉시 로딩 시작용)
  useEffect(() => {
    const handleStartGlobalLoading = (event: CustomEvent) => {
      console.log('🔍 [GlobalLoading] 커스텀 이벤트 수신 (시작):', event.detail);
      setIsLoading(true);
      
      // 기존 자동 해제 타이머 클리어
      if (quickReleaseTimeoutRef.current) {
        clearTimeout(quickReleaseTimeoutRef.current);
        quickReleaseTimeoutRef.current = null;
      }
    };

    const handleStopGlobalLoading = (event: CustomEvent) => {
      console.log('🔍 [GlobalLoading] 커스텀 이벤트 수신 (중지):', event.detail);
      setIsLoading(false);
      if (quickReleaseTimeoutRef.current) {
        clearTimeout(quickReleaseTimeoutRef.current);
        quickReleaseTimeoutRef.current = null;
      }
    };

    window.addEventListener('startGlobalLoading', handleStartGlobalLoading as EventListener);
    window.addEventListener('stopGlobalLoading', handleStopGlobalLoading as EventListener);
    
    return () => {
      window.removeEventListener('startGlobalLoading', handleStartGlobalLoading as EventListener);
      window.removeEventListener('stopGlobalLoading', handleStopGlobalLoading as EventListener);
    };
  }, []);

  // 페이지 이동 인디케이터용 setIsLoading (페이지 로드 완료 시 해제)
  const setLoadingWithPageBasedRelease = (loading: boolean) => {
    if (loading) {
      console.log('🔍 [GlobalLoading] Starting page transition indicator');
      setIsLoading(true);
      
      // 기존 릴리즈 타이머 클리어
      if (quickReleaseTimeoutRef.current) {
        clearTimeout(quickReleaseTimeoutRef.current);
      }
    } else {
      console.log('🔍 [GlobalLoading] Manual loading stop');
      setIsLoading(false);
      if (quickReleaseTimeoutRef.current) {
        clearTimeout(quickReleaseTimeoutRef.current);
        quickReleaseTimeoutRef.current = null;
      }
    }
  };

  // 페이지 이동 시 로딩 상태 관리 (콜백 페이지는 제외)
  useEffect(() => {
    // 콜백 페이지에서는 자동 로딩 해제하지 않음
    if (isCallbackPage) {
      console.log('🔍 [GlobalLoading] 콜백 페이지 - 자동 로딩 해제 건너뜀');
      return;
    }

    // 페이지 로드 완료 후 스켈레톤이 렌더링될 시간을 충분히 줌
    const pageLoadTimeout = setTimeout(() => {
      console.log('🔍 [GlobalLoading] Page loaded - hiding loading bar for skeleton display');
      setIsLoading(false);
    }, 300); // 스켈레톤 렌더링 대기 시간
    
    if (quickReleaseTimeoutRef.current) {
      clearTimeout(quickReleaseTimeoutRef.current);
      quickReleaseTimeoutRef.current = null;
    }

    return () => {
      clearTimeout(pageLoadTimeout);
    };
  }, [pathname, isCallbackPage]);

  // 강제로 로딩 중지하는 함수
  const forceStopLoading = () => {
    setIsLoading(false);
    if (quickReleaseTimeoutRef.current) {
      clearTimeout(quickReleaseTimeoutRef.current);
      quickReleaseTimeoutRef.current = null;
    }
  };

  return (
    <GlobalLoadingContext.Provider value={{ isLoading, setIsLoading: setLoadingWithPageBasedRelease, forceStopLoading }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (context === undefined) {
    throw new Error('useGlobalLoading must be used within a GlobalLoadingProvider');
  }
  return context;
} 