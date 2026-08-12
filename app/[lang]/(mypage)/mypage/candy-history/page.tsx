import { redirect } from 'next/navigation';
import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server';
import CandyHistoryClient from './CandyHistoryClient';

interface CandyHistoryPageProps {
  params: Promise<{ lang: string }>;
}

// 코튼캔디 내역은 앱과 동일하게 관리자 전용(§1-5). 일반 사용자 정책이 바뀌면 이 가드만 제거하면 된다.
export default async function CandyHistoryPage(props: CandyHistoryPageProps) {
  const { lang } = await props.params;

  const user = await getServerUser();
  if (!user) {
    redirect(`/${lang}/mypage`);
  }

  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_admin, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = !!(profile?.is_admin || profile?.is_super_admin);
  if (!isAdmin) {
    redirect(`/${lang}/mypage`);
  }

  return <CandyHistoryClient />;
}
