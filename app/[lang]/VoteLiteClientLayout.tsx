'use client';

import React, { memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';

type ProviderProps = {
  children: React.ReactNode;
};

const NavigationProviderDeferred = dynamic<ProviderProps>(
  () =>
    import('@/contexts/NavigationContext').then((mod) => ({
      default: mod.NavigationProvider,
    })),
  {
    ssr: false,
  },
);

const GlobalLoadingProviderDeferred = dynamic<ProviderProps>(
  () =>
    import('@/contexts/GlobalLoadingContext').then((mod) => ({
      default: mod.GlobalLoadingProvider,
    })),
  {
    ssr: false,
  },
);

interface VoteLiteClientLayoutProps {
  children: React.ReactNode;
  initialLanguage: string;
}

const VoteLiteClientLayoutComponent = memo(function VoteLiteClientLayout({
  children,
  initialLanguage,
}: VoteLiteClientLayoutProps) {
  return (
    <Suspense fallback={children}>
      <NavigationProviderDeferred>
        <GlobalLoadingProviderDeferred>
          <LanguageSyncProvider initialLanguage={initialLanguage}>
            <AuthProvider>{children}</AuthProvider>
          </LanguageSyncProvider>
        </GlobalLoadingProviderDeferred>
      </NavigationProviderDeferred>
    </Suspense>
  );
});

VoteLiteClientLayoutComponent.displayName = 'VoteLiteClientLayout';

export default VoteLiteClientLayoutComponent;

