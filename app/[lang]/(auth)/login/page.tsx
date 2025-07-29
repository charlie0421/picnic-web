'use client';

import { Suspense } from 'react';
import { SocialLoginButtons } from '@/components/client/auth/SocialLoginButtons';
import { handleSocialLogin } from '@/app/actions/auth';

function LoginPageContents() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800">Picnic</h1>
          <p className="mt-2 text-sm text-gray-600">소셜 계정으로 간편하게 로그인하세요</p>
        </div>
        <SocialLoginButtons onSocialLogin={handleSocialLogin} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageContents />
    </Suspense>
  );
}
