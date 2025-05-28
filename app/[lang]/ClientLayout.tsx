'use client';

import { ReactNode, useEffect } from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { useLanguageStore } from '@/stores/languageStore';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';

interface ClientLayoutProps {
  children: ReactNode;
  initialLanguage: string;
}

export default function ClientLayout({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  const { loadTranslations } = useLanguageStore();

  // 초기 언어 설정
  useEffect(() => {
    if (initialLanguage) {
      loadTranslations(initialLanguage);
    }
  }, [initialLanguage, loadTranslations]);

  return (
    <SupabaseProvider>
      <AuthProvider>
        <DialogProvider>
          <AuthRedirectHandler>
            <NavigationProvider>
              <div className='layout-container'>
                <div className='main-content'>{children}</div>
                {process.env.NODE_ENV === 'production' && <Analytics />}
              </div>
            </NavigationProvider>
          </AuthRedirectHandler>
        </DialogProvider>
      </AuthProvider>
    </SupabaseProvider>
  );
}
