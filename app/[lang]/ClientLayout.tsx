'use client';

import React, { memo } from 'react';
import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { NotificationProvider } from '@/contexts/NotificationContext';

const GlobalNotifications = dynamic(
  () =>
    import('@/components/common/GlobalNotifications').then((mod) => ({
      default: mod.GlobalNotifications,
    })),
  { ssr: false, loading: () => null },
);

const GlobalLoadingOverlay = dynamic(
  () => import('@/components/ui/GlobalLoadingOverlay'),
  { ssr: false, loading: () => null },
);

const LcpReporter = dynamic(
  () =>
    import('@/components/client/metrics/LcpReporter').then((mod) => ({
      default: mod.LcpReporter,
    })),
  { ssr: false, loading: () => null },
);

// Avatar localStorage 동기화는 제거하여 단순화

interface ClientLayoutProps {
  children: React.ReactNode;
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
              <DialogProvider>
                <AuthRedirectHandler>
                  <AvatarSyncEffect />
                  {children}
                  <LcpReporter />
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
