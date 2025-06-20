'use client';

import dynamic from 'next/dynamic';

const AuthProviderTest = dynamic(() => import('@/tests/auth-provider-test'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading test...</p>
      </div>
    </div>
  ),
});

export default function TestAuth() {
  return <AuthProviderTest />;
}
