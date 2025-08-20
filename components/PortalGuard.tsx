'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { PortalType } from '@/utils/enums';
import { useAuth } from '@/lib/supabase/auth-provider';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface PortalProps {
  type?: PortalType;
  children: React.ReactNode;
}

export default function PortalGuard({ type = PortalType.PUBLIC, children }: PortalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  React.useEffect(() => {
    // 인증 상태 로딩 중에는 아무 작업도 하지 않음
    if (isLoading) {
      return;
    }

    // 인증된 사용자만 접근 가능한 페이지인데, 인증되지 않은 경우
    if (type === PortalType.PRIVATE && !isAuthenticated) {
      const language = (pathname?.split('/')[1]) || 'en';
      const returnTo = pathname || '/';
      router.push(`/${language}/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    
    // 인증되지 않은 사용자만 접근 가능한 페이지(예: 로그인)인데, 인증된 경우
    else if (type === PortalType.AUTH && isAuthenticated) {
      router.push('/');
    }

  }, [type, router, pathname, isAuthenticated, isLoading]);
  
  // 인증 상태 로딩 중이거나, private 페이지에 인증 없이 접근 시 로딩 표시
  if ((isLoading && type !== PortalType.PUBLIC) || (type === PortalType.PRIVATE && !isAuthenticated)) {
    return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
  }

  return <>{children}</>;
}
