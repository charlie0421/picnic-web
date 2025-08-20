/**
 * 인증/리다이렉트 단계별 로그 유틸
 * - 활성화: NEXT_PUBLIC_LOG_AUTH_FLOW=1 또는 localStorage.LOG_AUTH_FLOW=1
 */

function isEnabled(): boolean {
  try {
    // 서버/클라이언트 모두 동작하도록 분기
    const envEnabled = process.env.NEXT_PUBLIC_LOG_AUTH_FLOW === '1';
    if (typeof window === 'undefined') return envEnabled;
    const lsEnabled = localStorage.getItem('LOG_AUTH_FLOW') === '1';
    return envEnabled || lsEnabled;
  } catch {
    return false;
  }
}

export function logAuth(step: string, data?: unknown): void {
  if (!isEnabled()) return;
  try {
    if (data !== undefined) {
      console.log(`[AuthFlow] ${step}`, data);
    } else {
      console.log(`[AuthFlow] ${step}`);
    }
  } catch {}
}

export const AuthLog = {
  // 주요 단계 키워드 표준화
  LoginStart: 'LoginStart',
  SaveReturnUrl: 'SaveReturnUrl',
  ProviderInit: 'ProviderInit',
  OAuthStart: 'OAuthStart',
  OAuthParams: 'OAuthParams',
  OAuthRedirect: 'OAuthRedirect',
  OAuthCallback: 'OAuthCallback',
  AuthLoadingEnter: 'AuthLoadingEnter',
  CodeExchangeDone: 'CodeExchangeDone',
  ResolveRedirect: 'ResolveRedirect',
  HandlePostLogin: 'HandlePostLogin',
  RedirectTo: 'RedirectTo',
};


