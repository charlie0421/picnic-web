'use client';

import { ReactNode, useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
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
  messages: any;
}

export default function ClientLayout({
  children,
  initialLanguage,
  messages,
}: ClientLayoutProps) {
  const { setCurrentLang } = useLanguageStore();

  // 초기 언어 설정 (한 번만)
  useEffect(() => {
    if (initialLanguage) {
      setCurrentLang(initialLanguage as any);
    }
  }, [initialLanguage, setCurrentLang]);

  return (
    <NextIntlClientProvider locale={initialLanguage} messages={messages}>
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
    </NextIntlClientProvider>
  );
}
