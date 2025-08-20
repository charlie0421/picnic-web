import { redirect } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@/config/settings';

export default async function VoteIdRootRedirect({ params }: { params: Promise<{ id: string }> }) {
  // '/vote/[id]' 접근 시 언어 접두어가 없는 경우 기본 언어로 보정 (Next 15: params는 Promise)
  const { id } = await params;
  redirect(`/${DEFAULT_LANGUAGE}/vote/${id}`);
}



