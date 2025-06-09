import { redirect } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '../../config/settings';

export default function DownloadRedirect() {
  // 기본 언어로 리다이렉트
  redirect(`/${DEFAULT_LANGUAGE}/download`);
} 