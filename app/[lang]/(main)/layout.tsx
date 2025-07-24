import React, { ReactNode } from 'react';
import ClientLayout from '../ClientLayout';
import MainLayoutClient from './MainLayoutClient';

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
      <MainLayoutClient>{children}</MainLayoutClient>
    </ClientLayout>
  );
}