'use client';

import React from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider as SimpleAuthProvider } from '@/lib/supabase/auth-provider-simple';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

export default function MinimalClientLayout({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  // 최소한의 Provider만 사용하여 React Hook #310 에러 원인 찾기
  return (
    <NavigationProvider>
      <LanguageSyncProvider initialLanguage={initialLanguage}>
        <SupabaseProvider>
          <SimpleAuthProvider>
            {children}
            <Analytics />
          </SimpleAuthProvider>
        </SupabaseProvider>
      </LanguageSyncProvider>
    </NavigationProvider>
  );
} 