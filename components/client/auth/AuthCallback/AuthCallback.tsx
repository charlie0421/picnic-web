// components/client/auth/AuthCallback/AuthCallback.tsx
import AuthCallbackClient from './AuthCallbackClient';

/**
 * 범용 OAuth 콜백을 위한 래퍼 컴포넌트.
 * provider 정보를 처리하지 않으므로, AuthCallbackClient에 prop을 전달하지 않습니다.
 */
export default function AuthCallback() {
  return <AuthCallbackClient />;
}
