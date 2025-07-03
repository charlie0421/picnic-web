'use client';

import React, { memo } from 'react';
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

// 단일 AuthProvider만 사용하여 중복 방지
const ClientLayoutComponent = memo(function ClientLayoutInternal({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  return (
    <NavigationProvider>
      <LanguageSyncProvider initialLanguage={initialLanguage}>
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
      </LanguageSyncProvider>
    </NavigationProvider>
  );
});

ClientLayoutComponent.displayName = 'ClientLayout';

export default ClientLayoutComponent;
