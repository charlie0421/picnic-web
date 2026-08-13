import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/supabase/server';
import ExpiryGuideClient from './ExpiryGuideClient';

interface ExpiryGuidePageProps {
  params: Promise<{ lang: string }>;
}

/**
 * 소멸 예정 캔디 안내 — 앱의 "소멸 예정 캔디 안내"(usage_policy_dialog) 대응 화면.
 * 본인 잔액을 보여주므로 로그인 필수. 관리자 전용이 아니다(앱도 일반 사용자에게 연다).
 */
export default async function ExpiryGuidePage(props: ExpiryGuidePageProps) {
  const { lang } = await props.params;

  const user = await getServerUser();
  if (!user) {
    redirect(`/${lang}/mypage`);
  }

  return <ExpiryGuideClient />;
}
