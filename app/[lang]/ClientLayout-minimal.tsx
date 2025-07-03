'use client';

import React from 'react';
import { AuthProvider } from '@/lib/supabase/auth-provider';
import { Analytics } from '@vercel/analytics/react';

interface ClientLayoutMinimalProps {
  children: React.ReactNode;
  initialLanguage: string;
}

// 최소한의 Provider 구조 - 테스트/디버깅용
export default function ClientLayoutMinimal({
  children,
  initialLanguage,
}: ClientLayoutMinimalProps) {
  return (
    <AuthProvider>
      {children}
      <Analytics />
    </AuthProvider>
  );
} 