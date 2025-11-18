import { ReactNode } from 'react';
import MainLayoutClient from '@/components/layouts/MainLayoutClient';

interface MainLayoutProps {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function MainLayout({ children, params }: MainLayoutProps) {
  const { lang } = await params;

  return (
    <MainLayoutClient initialLanguage={lang}>
      {children}
    </MainLayoutClient>
  );
}
