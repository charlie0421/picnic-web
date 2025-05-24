'use client';

import {ReactNode, useEffect} from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { useLanguageStore } from '@/stores/languageStore';
import { Analytics } from '@vercel/analytics/react';

interface PrimaryLayoutProps {
  children: ReactNode;
  initialLanguage: string;
}

export default function PrimaryLayout({
  children,
  initialLanguage,
}: PrimaryLayoutProps) {
  const { loadTranslations } = useLanguageStore();

  // 초기 언어 설정
  useEffect(() => {
    if (initialLanguage) {
      loadTranslations(initialLanguage);
    }
  }, [initialLanguage, loadTranslations]);

  // 환경 정보 로깅 (개발 환경용)
  useEffect(() => {
    const isNgrok = window.location.hostname.includes('ngrok');
    // 환경 정보 로그 제거됨
  }, []);

  return (
    <SupabaseProvider>
      <AuthProvider>
        <NavigationProvider>
          <div className="layout-container">
            <div className="main-content">
              {children}
            </div>
            {process.env.NODE_ENV === 'production' && <Analytics />}
          </div>
        </NavigationProvider>
      </AuthProvider>
    </SupabaseProvider>
  );
} 