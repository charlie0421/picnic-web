'use client';

import React, { memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { LcpReporter } from '@/components/client/metrics/LcpReporter';

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

const PopupBannerLoader = dynamic(
  () => import('@/components/client/common/PopupBannerLoader'),
  { ssr: false, loading: () => null },
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
            <LcpReporter />
            <AuthProviderDeferred>
              {children}
              <PopupBannerLoader />
            </AuthProviderDeferred>
          </LanguageSyncProvider>
        </GlobalLoadingProviderDeferred>
      </NavigationProviderDeferred>
    </Suspense>
  );
});

VoteLiteClientLayoutComponent.displayName = 'VoteLiteClientLayout';

export default VoteLiteClientLayoutComponent;

