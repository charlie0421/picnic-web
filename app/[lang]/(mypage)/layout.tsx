import React, { ReactNode } from 'react';
import MainLayoutClient from '../(main)/MainLayoutClient';

interface MyPageLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

/**
 * 마이페이지 섹션 셸. Provider 스택은 [lang] 레이아웃의 ClientLayout 이 이미 감싸므로
 * 여기서 다시 감싸지 않는다(PERF-13). 인증 가드는 각 페이지·middleware 가 맡는다.
 */
export default async function MyPageLayout({ children }: MyPageLayoutProps) {
  return <MainLayoutClient>{children}</MainLayoutClient>;
}
