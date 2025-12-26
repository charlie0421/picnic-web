import { createServerSupabaseClient } from '@/lib/supabase/server';
import GoongHapDetailClient from './GoongHapDetailClient';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

export default async function GoongHapDetailPage({ params }: PageProps) {
  const { id, lang } = await params;

  // 서버에서 데이터 미리 로드
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_goonghap_result', { p_id: id });

  return (
    <GoongHapDetailClient
      initialData={error ? null : data}
      id={id}
      lang={lang}
    />
  );
}
