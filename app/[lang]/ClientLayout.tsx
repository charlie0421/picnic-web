'use client';

import React, { memo } from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { EnhancedAuthProvider } from '@/lib/supabase/auth-provider-enhanced';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { GlobalNotifications } from '@/components/common/GlobalNotifications';

// 🚨 즉석 테스트 로그
console.log('🚨 [CRITICAL] ClientLayout 파일 로드됨!', new Date().toISOString());

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

// 최소한의 Provider 구조로 단순화
const ClientLayoutComponent = memo(function ClientLayoutInternal({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  console.log('🚨 [CRITICAL] ClientLayout 렌더링 시작!', { 
    initialLanguage,
    timestamp: new Date().toISOString() 
  });
  
  return (
    <NavigationProvider>
      <LanguageSyncProvider initialLanguage={initialLanguage}>
        <SupabaseProvider>
          <EnhancedAuthProvider>
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
          </EnhancedAuthProvider>
        </SupabaseProvider>
      </LanguageSyncProvider>
    </NavigationProvider>
  );
});

// initialLanguage prop이 변경되지 않는 한 재렌더링 방지
ClientLayoutComponent.displayName = 'ClientLayout';

export default ClientLayoutComponent;
