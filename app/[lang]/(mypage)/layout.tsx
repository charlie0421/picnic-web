import React, { ReactNode, Suspense } from 'react';
import ClientLayout from '../ClientLayout';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { getServerUser } from '@/lib/supabase/server';
import MainLayoutClient from '../(main)/MainLayoutClient';

interface MyPageLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

export default async function MyPageLayout(props : MyPageLayoutProps) {
  const params = await props.params;

  const { children } = props;

  const { lang } = params;

  const user = await getServerUser();

  return (
    <ClientLayout initialLanguage={lang}>
      <MainLayoutClient>{children}</MainLayoutClient>
    </ClientLayout>
  );
}
