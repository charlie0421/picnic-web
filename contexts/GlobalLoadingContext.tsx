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

  // 페이지 이동 인디케이터용 setIsLoading (800ms 후 자동 해제)
  const setLoadingWithQuickRelease = (loading: boolean) => {
    if (loading) {
      console.log('🔍 [GlobalLoading] Starting page transition indicator (800ms)');
      setIsLoading(true);
      
      // 기존 퀵 릴리즈 타이머 클리어
      if (quickReleaseTimeoutRef.current) {
        clearTimeout(quickReleaseTimeoutRef.current);
      }
      
      // 300ms 후 자동으로 로딩 해제 (스켈레톤이 보이도록)
      quickReleaseTimeoutRef.current = setTimeout(() => {
        console.log('🔍 [GlobalLoading] Quick release - hiding loading bar for skeleton display');
        setIsLoading(false);
      }, 300);
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

  // 페이지 이동 시 로딩 상태 관리
  useEffect(() => {
    setIsLoading(false);
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    if (quickReleaseTimeoutRef.current) {
      clearTimeout(quickReleaseTimeoutRef.current);
      quickReleaseTimeoutRef.current = null;
    }
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
    <GlobalLoadingContext.Provider value={{ isLoading, setIsLoading: setLoadingWithQuickRelease, forceStopLoading }}>
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