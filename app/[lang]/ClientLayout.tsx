'use client';

import React from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

export default function ClientLayout({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  return (
    <LanguageSyncProvider initialLanguage={initialLanguage}>
      <SupabaseProvider>
        {/* @ts-ignore */}
        <AuthProvider>
          {/* @ts-ignore */}
          <DialogProvider>
            {/* @ts-ignore */}
            <AuthRedirectHandler>
              <NavigationProvider>
                {children}
                <Analytics />
              </NavigationProvider>
            </AuthRedirectHandler>
          </DialogProvider>
        </AuthProvider>
      </SupabaseProvider>
    </LanguageSyncProvider>
  );
}
