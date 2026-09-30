'use client';

import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlobalLoadingProvider>
      <div className="min-h-screen bg-gray-50">
        <main className="flex items-center justify-center min-h-screen">
          {children}
        </main>
        <GlobalLoadingOverlay />
      </div>
    </GlobalLoadingProvider>
  );
} 