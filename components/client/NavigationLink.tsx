'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useAuthGuard } from '@/hooks/useAuthGuard';

interface NavigationLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  should_login?: boolean;
  title?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  id?: string;
  role?: string;
  tabIndex?: number;
}

export default function NavigationLink({
  href,
  children,
  className = '',
  onClick,
  should_login = false,
  title,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  id,
  role,
  tabIndex,
}: NavigationLinkProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const { setIsLoading } = useGlobalLoading();
  const router = useRouter();
  const pathname = usePathname();
  const { extractLocaleFromPath, getLocalizedPath, currentLocale } = useLocaleRouter();
  const { isAuthenticated } = useAuth();
  const { navigateWithAuth } = useAuthGuard();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    const { path: currentCleanPath } = extractLocaleFromPath(pathname);
    const { path: targetCleanPath } = extractLocaleFromPath(href);

    const normalizedTargetHref = href.startsWith(`/${currentLocale}/`)
      ? href
      : getLocalizedPath(href, currentLocale);

    // 마이페이지 하위 경로는 기본적으로 로그인 필요로 간주(서비스 공지/FAQ 등은 /mypage 하위가 아님)
    const requiresAuthByPath = /(^\/mypage\b)|(^\/[a-z]{2}\/[a-z-]{0,5}\/?mypage\b)/i.test(normalizedTargetHref);
    const needAuth = should_login || requiresAuthByPath;

    // 인증이 필요한 링크인 경우, 가드 기반 네비게이션 사용 (로그인 유도 다이얼로그 포함)
    if (needAuth && !isAuthenticated) {
      navigateWithAuth(normalizedTargetHref);
      if (onClick) {
        onClick();
      }
      return;
    }

    if (currentCleanPath === targetCleanPath) {
      if (onClick) {
        onClick();
      }
      return;
    }

    setIsLoading(true);
    setIsNavigating(true);
    router.push(normalizedTargetHref);

    if (onClick) {
      onClick();
    }
  };

  const safeDivProps = {
    title,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    id,
    role: role || 'button',
    tabIndex: tabIndex || 0,
  };

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
