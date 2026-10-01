import { redirect } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@/config/settings';

export default async function VoteIdRootRedirect({ params }: { params: Promise<{ id: string }> }) {
  // 정상 흐름에서는 닿지 않는다 — middleware 가 접두어 없는 /vote/:id 을 선호 언어 주소로 먼저 보낸다
  // (lib/i18n/locale-routing.ts). middleware 를 거치지 않은 요청을 위한 안전망으로 남겨 둔다.
  // Next 15: params 는 Promise
  const { id } = await params;
  redirect(`/${DEFAULT_LANGUAGE}/vote/${id}`);
}



