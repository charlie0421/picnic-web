'use client';

import React, { memo } from 'react';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';

interface VoteLiteClientLayoutProps {
  children: React.ReactNode;
  initialLanguage: string;
}

const VoteLiteClientLayoutComponent = memo(function VoteLiteClientLayout({
  children,
  initialLanguage,
}: VoteLiteClientLayoutProps) {
  return (
    <NavigationProvider>
      <GlobalLoadingProvider>
        <LanguageSyncProvider initialLanguage={initialLanguage}>
          <AuthProvider>{children}</AuthProvider>
        </LanguageSyncProvider>
      </GlobalLoadingProvider>
    </NavigationProvider>
  );
});

VoteLiteClientLayoutComponent.displayName = 'VoteLiteClientLayout';

export default VoteLiteClientLayoutComponent;

