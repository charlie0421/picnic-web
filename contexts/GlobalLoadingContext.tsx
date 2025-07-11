'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface GlobalLoadingContextType {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  forceStopLoading: () => void;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextType | undefined>(undefined);

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quickReleaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // 안전장치: 로딩이 5초 이상 지속되면 자동으로 해제
  useEffect(() => {
    if (isLoading) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('⚠️ 로딩이 5초 이상 지속되어 강제로 해제합니다.');
        setIsLoading(false);
      }, 5000);
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [isLoading]);

  // 페이지 이동 시 로딩 상태 관리 (페이지 로드 완료 후 해제)
  useEffect(() => {
    // 페이지 로드 완료 후 약간의 지연으로 스켈레톤이 보이도록 함
    const pageLoadTimeout = setTimeout(() => {
      console.log('🔍 [GlobalLoading] Page loaded - hiding loading bar for skeleton display');
      setIsLoading(false);
    }, 150); // 페이지 컴포넌트 렌더링 대기
    
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    if (quickReleaseTimeoutRef.current) {
      clearTimeout(quickReleaseTimeoutRef.current);
      quickReleaseTimeoutRef.current = null;
    }

    return () => {
      clearTimeout(pageLoadTimeout);
    };
  }, [pathname]);

  // 강제로 로딩 중지하는 함수
  const forceStopLoading = () => {
    setIsLoading(false);
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
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