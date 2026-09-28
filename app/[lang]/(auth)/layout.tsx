import React, { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

/**
 * 인증(로그인 등) 섹션. Provider 스택은 [lang] 레이아웃의 ClientLayout 이 이미 감싸므로
 * 여기서 다시 감싸지 않는다(PERF-13 — 이중 마운트 시 Auth 구독·Analytics 가 중복된다).
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return <>{children}</>;
}
