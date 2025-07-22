import React, { ReactNode } from 'react';
import ClientLayout from '../ClientLayout';
import MainLayoutClient from './MainLayoutClient';

interface MainLayoutProps {
  children: ReactNode;
  params: {
    lang: string;
  };
}

export default async function MainLayout({ children, params }: MainLayoutProps) {
  const { lang } = params;

  return (
    <ClientLayout initialLanguage={lang}>
      <MainLayoutClient>{children}</MainLayoutClient>
    </ClientLayout>
  );
}