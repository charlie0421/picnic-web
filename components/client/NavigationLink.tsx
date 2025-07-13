'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

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
  const pathname = usePathname();
  const { extractLocaleFromPath, getLocalizedPath, currentLocale } = useLocaleRouter();
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // 기본 링크 동작 방지
    
    // 현재 경로와 타겟 경로를 언어 경로를 고려하여 비교
    const { path: currentCleanPath } = extractLocaleFromPath(pathname);
    const { path: targetCleanPath } = extractLocaleFromPath(href);
    
    // href가 로케일화되지 않은 경우 현재 로케일로 로케일화
    const normalizedTargetHref = href.startsWith(`/${currentLocale}/`) 
      ? href 
      : getLocalizedPath(href, currentLocale);
    
    console.log('🔍 [NavigationLink] Link click:', {
      href,
      normalizedTargetHref,
      currentPath: pathname,
      currentCleanPath,
      targetCleanPath,
      isSamePage: currentCleanPath === targetCleanPath,
      currentLocale
    });
    
    // 같은 페이지인지 확인 (언어 경로 제외하고 비교)
    if (currentCleanPath === targetCleanPath) {
      console.log('🔍 [NavigationLink] Same page detected, cancelling navigation');
      
      // 사용자 정의 onClick 콜백은 실행 (메뉴 닫기 등의 동작을 위해)
      if (onClick) {
        onClick();
      }
      
      // 네비게이션은 취소
      return;
    }
    
    // 다른 페이지인 경우 로딩 시작 및 네비게이션 진행
    console.log('🔍 [NavigationLink] Starting loading for navigation to:', normalizedTargetHref);
    setIsLoading(true);
    setIsNavigating(true);
    
    // 프로그래매틱 네비게이션 (정규화된 href 사용)
    router.push(normalizedTargetHref);

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