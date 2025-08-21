'use client';

import React, { memo, useEffect } from 'react';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { GlobalNotifications } from '@/components/common/GlobalNotifications';
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay';
import { useAuth } from '@/hooks/useAuth';
// Avatar localStorage 동기화는 제거하여 단순화

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

// 단일 AuthProvider만 사용하여 중복 방지
// Provider 내부에서 동작하도록 분리된 동기화 컴포넌트
function AvatarSyncEffect() { return null; }

const ClientLayoutComponent = memo(function ClientLayoutInternal({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  return (
    <NavigationProvider>
      <GlobalLoadingProvider>
        <LanguageSyncProvider initialLanguage={initialLanguage}>
          <AuthProvider>
            <NotificationProvider>
              {/* @ts-ignore */}
              <DialogProvider>
                {/* @ts-ignore */}
                <AuthRedirectHandler>
                  <AvatarSyncEffect />
                  {children}
                  <GlobalNotifications />
                  <GlobalLoadingOverlay />
                  <Analytics />
                </AuthRedirectHandler>
              </DialogProvider>
            </NotificationProvider>
          </AuthProvider>
        </LanguageSyncProvider>
      </GlobalLoadingProvider>
    </NavigationProvider>
  );
});

ClientLayoutComponent.displayName = 'ClientLayout';

export default ClientLayoutComponent;
