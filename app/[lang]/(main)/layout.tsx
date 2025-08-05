import React, { ReactNode } from 'react';
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

  return (
    <ClientLayout initialLanguage={lang}>
      <MainLayoutClient>
        <PicnicMenu />
        {children}
      </MainLayoutClient>
    </ClientLayout>
  );
}