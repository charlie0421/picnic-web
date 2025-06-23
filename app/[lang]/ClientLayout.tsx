'use client';

import React, { memo } from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { GlobalNotifications } from '@/components/common/GlobalNotifications';

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

// 최소한의 Provider 구조로 단순화
const ClientLayoutComponent = memo(function ClientLayoutInternal({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  console.log('🔄 [ClientLayout] 렌더링 시작', { initialLanguage });
  
  return (
    <NavigationProvider>
      <LanguageSyncProvider initialLanguage={initialLanguage}>
        <SupabaseProvider>
          <AuthProvider>
            <NotificationProvider>
              {/* @ts-ignore */}
              <DialogProvider>
                {/* @ts-ignore */}
                <AuthRedirectHandler>
                  {children}
                  <GlobalNotifications />
                  <Analytics />
                </AuthRedirectHandler>
              </DialogProvider>
            </NotificationProvider>
          </AuthProvider>
        </SupabaseProvider>
      </LanguageSyncProvider>
    </NavigationProvider>
  );
});

// initialLanguage prop이 변경되지 않는 한 재렌더링 방지
ClientLayoutComponent.displayName = 'ClientLayout';

export default ClientLayoutComponent;
