'use client';

import Link from 'next/link';
import { ComponentProps } from 'react';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

interface LocalizedLinkProps extends Omit<ComponentProps<typeof Link>, 'href'> {
  href: string;
}

export const LocalizedLink: React.FC<LocalizedLinkProps> = ({ 
  href, 
  children, 
  ...props 
}) => {
  const { currentLocale } = useLocaleRouter();
  
  // 이미 언어 프리픽스가 있는지 확인
  const hasLocalePrefix = href.startsWith(`/${currentLocale}/`);
  const localizedHref = hasLocalePrefix ? href : `/${currentLocale}${href}`;
  
  return (
    <Link href={localizedHref} {...props}>
      {children}
    </Link>
  );
}; 