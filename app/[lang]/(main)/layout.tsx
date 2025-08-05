import React, { ReactNode } from 'react';
import { headers } from 'next/headers';
import ClientLayout from '../ClientLayout';
import MainLayoutClient from './MainLayoutClient';
import { PicnicMenu } from '@/components/client/common/PicnicMenu';

interface MainLayoutProps {
  children: ReactNode;
  params: {
    lang: string;
  };
}

export default function MainLayout(props: MainLayoutProps) {
  const { children, params } = props;
  const { lang } = params;

  const headersList = headers();
  const nextUrl = headersList.get('next-url') || '';
  
  const showPicnicMenu = nextUrl.includes('/vote') || nextUrl.includes('/rewards');

  return (
    <ClientLayout initialLanguage={lang}>
      <MainLayoutClient>
        {showPicnicMenu && <PicnicMenu />}
        {children}
      </MainLayoutClient>
    </ClientLayout>
  );
}