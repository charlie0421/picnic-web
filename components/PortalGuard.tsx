'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PortalType } from '@/utils/enums';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface PortalProps {
  type?: PortalType;
  children: React.ReactNode;
}

export default function PortalGuard({ type = PortalType.PUBLIC, children }: PortalProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user }, error } = await createBrowserSupabaseClient().auth.getUser();

      // 인증 상태에 따른 리다이렉션 (getUser는 getSession보다 빠르고 안정적)
      if (type === PortalType.AUTH && user && !error) {
        router.push('/');
      } else if (type === PortalType.AUTH && (!user || error)) {
        router.push('/login');
      }
    };

    checkAuth();
  }, [type, router, pathname]);

  return <>{children}</>;
}
