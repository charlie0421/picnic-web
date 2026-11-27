import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { inter } from '@/app/shell';
import { getLanguageTag, isSupportedLanguage } from '@/app/[lang]/utils/metadata-utils';
import '@/app/[lang]/globals.css';

// A separate document shell keeps intake fields away from analytics, ads, and auth providers.
// Dashboard links use a full document navigation so previously loaded trackers cannot persist.
export default async function BusinessLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isSupportedLanguage(lang)) notFound();
  return <html lang={getLanguageTag(lang) ?? lang}><body className={inter.className}><main>{children}</main></body></html>;
}
