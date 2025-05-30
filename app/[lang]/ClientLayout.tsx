'use client';

import React from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { useLanguageStore } from '@/stores/languageStore';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { Language, SUPPORTED_LANGUAGES } from '@/config/settings';

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

export default function ClientLayout({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  const { loadTranslations } = useLanguageStore();

  // 초기 언어 설정
  (React as any).useEffect(() => {
    if (
      initialLanguage &&
      SUPPORTED_LANGUAGES.includes(initialLanguage as Language)
    ) {
      loadTranslations(initialLanguage as Language);
    }
  }, [initialLanguage, loadTranslations]);

  return (
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
  );
}
