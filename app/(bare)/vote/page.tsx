import { redirect } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@/config/settings';

export default function VoteRootRedirect() {
  // '/vote' 접근 시 언어 접두어가 없는 경우 기본 언어로 보정
  redirect(`/${DEFAULT_LANGUAGE}/vote`);
}


