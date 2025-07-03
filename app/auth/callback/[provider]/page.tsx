'use client';

import { use } from 'react';
import { AuthCallbackClient } from '@/components/client/auth';

interface CallbackPageProps {
  params: Promise<{ provider: string }>;
}

export default function CallbackPage({ params }: CallbackPageProps) {
  // Next.js 15 요구사항: params를 React.use()로 unwrap
  const { provider } = use(params);
  
  return <AuthCallbackClient provider={provider} />;
}
