'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

interface NavigationLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  // div 요소에 안전하게 전달할 수 있는 속성들
  title?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  id?: string;
  role?: string;
  tabIndex?: number;
}

// 페이지 전환을 빠르게 하기 위한 최적화된 네비게이션 링크 컴포넌트
export default function NavigationLink({
  href,
  children,
  className = '',
  onClick,
  // div에 안전한 속성들만 분리
  title,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  id,
  role,
  tabIndex,
  ...unknownProps // 이제 안전하지 않은 속성들은 버림
}: NavigationLinkProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const { setIsLoading } = useGlobalLoading();
  const router = useRouter();
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // 기본 링크 동작 방지
    
    // 현재 페이지와 다른 경우에만 로딩 시작
    const currentPath = window.location.pathname;
    
    console.log('🔍 [NavigationLink] Link click:', {
      href,
      currentPath,
      isSamePage: currentPath === href
    });
    
    if (currentPath !== href) {
      // 모든 페이지 이동에서 로딩바 표시
      console.log('🔍 [NavigationLink] Starting loading for navigation to:', href);
      setIsLoading(true);
      setIsNavigating(true);
      
      // 프로그래매틱 네비게이션
      router.push(href);
    } else {
      console.log('🔍 [NavigationLink] Same page detected, not starting loading');
    }

    // 사용자 정의 onClick 콜백 실행
    if (onClick) {
      onClick();
    }
  };
  
  // div에 안전한 속성들만 전달
  const safeDivProps = {
    title,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    id,
    role: role || 'button', // 접근성을 위해 role="button" 기본값
    tabIndex: tabIndex || 0, // 키보드 접근성을 위해 tabIndex 기본값
  };
  
  // 키보드 이벤트 핸들러 (Enter, Space 키 지원)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as any);
    }
  };
  
  return (
    <div 
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`${className} ${isNavigating ? 'opacity-90' : 'opacity-100'} transition-opacity duration-200 cursor-pointer`}
      style={{ userSelect: 'none' }}
      {...safeDivProps}
    >
      {children}
    </div>
  );
} 