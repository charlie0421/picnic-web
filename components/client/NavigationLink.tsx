'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useAuth } from '@/lib/supabase/auth-provider';

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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (should_login && !isAuthenticated) {
      const loginPath = getLocalizedPath('/login');
      router.push(loginPath);
      if (onClick) {
        onClick();
      }
      return;
    }

    const { path: currentCleanPath } = extractLocaleFromPath(pathname);
    const { path: targetCleanPath } = extractLocaleFromPath(href);

    const normalizedTargetHref = href.startsWith(`/${currentLocale}/`)
      ? href
      : getLocalizedPath(href, currentLocale);

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
