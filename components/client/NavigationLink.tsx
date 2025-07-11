'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { LinkProps } from 'next/link';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { shouldShowLoadingFor } from '@/utils/navigation-loading';

interface NavigationLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  children: React.ReactNode;
  className?: string;
  prefetch?: boolean;
}

// 페이지 전환을 빠르게 하기 위한 최적화된 네비게이션 링크 컴포넌트
export default function NavigationLink({
  href,
  children,
  className = '',
  prefetch = true, // 기본값을 true로 설정하여 페이지 미리 로드
  ...props
}: NavigationLinkProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const { setIsLoading } = useGlobalLoading();
  
  const handleClick = () => {
    // 현재 페이지와 다른 경우에만 로딩 시작
    const currentPath = window.location.pathname;
    
    console.log('🔍 [NavigationLink] Link click:', {
      href,
      currentPath,
      isSamePage: currentPath === href,
      shouldShowLoading: shouldShowLoadingFor(href)
    });
    
    if (currentPath !== href) {
      // mypage와 vote 페이지로의 이동 시에만 로딩바 표시
      if (shouldShowLoadingFor(href)) {
        console.log('🔍 [NavigationLink] Starting loading for navigation to:', href);
        setIsLoading(true);
        setIsNavigating(true);
      } else {
        console.log('🔍 [NavigationLink] No loading needed for navigation to:', href);
        setIsNavigating(false);
      }
    } else {
      console.log('🔍 [NavigationLink] Same page detected, not starting loading');
    }
  };
  
  return (
    <Link 
      href={href}
      className={`relative ${className} ${isNavigating ? 'opacity-90' : 'opacity-100'} transition-opacity duration-200`}
      prefetch={prefetch} // prefetch 활성화로 페이지 미리 로드
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
} 