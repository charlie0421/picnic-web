'use client';

import React from 'react';

interface AuthRedirectHandlerProps {
  children: React.ReactNode;
}

/**
 * AuthRedirectHandler - 단순화된 버전
 * 무한로딩 문제 해결을 위해 모든 복잡한 로직을 제거
 */
export function AuthRedirectHandler({ children }: AuthRedirectHandlerProps) {
  // 단순히 children만 렌더링
  return <>{children}</>;
}

