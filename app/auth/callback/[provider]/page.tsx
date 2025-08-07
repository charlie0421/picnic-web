// app/auth/callback/[provider]/page.tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 각 OAuth 제공자별 콜백을 처리하는 라우트 핸들러.
 * 빌드 오류를 해결하기 위해 props 타입을 any로 지정합니다.
 */
export default async function ProviderCallbackPage(props: any) {
  const { searchParams } = props;
  const code = searchParams?.code;

  if (code) {
    redirect(`/auth/loading?code=${code}`);
  } else {
    redirect('/login?error=auth_code_missing');
  }

  return null;
}
