import React, { ReactNode } from 'react';
import ClientLayout from '../ClientLayout';
import MainLayoutClient from './MainLayoutClient';
import { PicnicMenu } from '@/components/client/common/PicnicMenu';

interface MainLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

export default async function MainLayout(props: MainLayoutProps) {
  const params = await props.params;

  const {
    children
  } = props;

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