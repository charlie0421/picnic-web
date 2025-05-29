'use client';

import { LocalizedLink } from '@/components/ui/LocalizedLink';
import { ReactNode } from 'react';

interface LocalizedNotFoundLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * 서버 컴포넌트에서 사용할 수 있는 LocalizedLink 래퍼
 * 
 * 서버 컴포넌트는 클라이언트 컴포넌트를 직접 사용할 수 없으므로
 * 이 래퍼를 통해 LocalizedLink 기능을 사용할 수 있습니다.
 */
export function LocalizedNotFoundLink({ href, className, children }: LocalizedNotFoundLinkProps) {
  return (
    <LocalizedLink href={href} className={className}>
      {children}
    </LocalizedLink>
  );
} 