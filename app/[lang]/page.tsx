import { redirect } from 'next/navigation';
import { Language } from '@/config/settings';

interface HomeProps {
  params: Promise<{ lang: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { lang } = await params;
  const currentLang = (lang || 'ko') as Language;
  
  // 현재 언어를 포함해서 vote 페이지로 리다이렉트
  redirect(`/${currentLang}/vote`);
  return null;
}
