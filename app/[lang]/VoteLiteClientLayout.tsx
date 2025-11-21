'use client';

import React, { memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
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

const AuthProviderDeferred = dynamic<ProviderProps>(
  () =>
    import('@/lib/supabase/auth-provider').then((mod) => ({
      default: mod.AuthProvider,
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
            <AuthProviderDeferred>{children}</AuthProviderDeferred>
          </LanguageSyncProvider>
        </GlobalLoadingProviderDeferred>
      </NavigationProviderDeferred>
    </Suspense>
  );
});

VoteLiteClientLayoutComponent.displayName = 'VoteLiteClientLayout';

export default VoteLiteClientLayoutComponent;

