import { redirect } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@/config/settings';

export default function RootRedirectPage() {
  redirect(`/${DEFAULT_LANGUAGE}`);
}


