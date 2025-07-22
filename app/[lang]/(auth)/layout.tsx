import React, { ReactNode } from 'react';
import ClientLayout from '../ClientLayout';

interface AuthLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

export default async function AuthLayout({ children, params }: AuthLayoutProps) {
  const { lang } = await params;

  return (
    <ClientLayout initialLanguage={lang}>
      {children}
    </ClientLayout>
  );
} 