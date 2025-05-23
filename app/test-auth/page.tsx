'use client';

import AuthProviderTest from '@/tests/auth-provider-test';
import { AuthProvider } from '@/lib/supabase/auth-provider';

export default function TestAuth() {
  return (
    <AuthProvider>
      <AuthProviderTest />
    </AuthProvider>
  );
}
