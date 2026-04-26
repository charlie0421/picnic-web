// app/auth/callback/[provider]/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * 각 OAuth 제공자별 콜백을 처리하는 라우트 핸들러.
 * 빌드 오류를 해결하기 위해 props 타입을 any로 지정합니다.
 */
export default async function ProviderCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const codeParam = params?.code;
  const returnToParam = params?.returnTo;
  const returnUrlParam = params?.return_url; // Supabase OAuth query param
  const cookieHeader = await cookies();

  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  const returnTo = Array.isArray(returnToParam) ? returnToParam[0] : returnToParam;
  const returnUrl = Array.isArray(returnUrlParam) ? returnUrlParam[0] : returnUrlParam;
  const cookieReturn = cookieHeader.get('auth_return_url')?.value;

  if (code) {
    const finalReturn = returnTo || returnUrl || cookieReturn || '/';
    // 서버 라우트에서 코드 교환 및 쿠키 세팅을 보장하기 위해 API 콜백으로 위임
    const nextParam = encodeURIComponent(finalReturn);
    redirect(`/api/auth/callback?code=${code}&next=${nextParam}`);
  } else {
    redirect('/login?error=auth_code_missing');
  }

  return null;
}
