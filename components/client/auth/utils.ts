import { AuthError, AuthProvider } from './types';

/**
 * 이메일 유효성 검사
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 비밀번호 강도 검사
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('비밀번호는 8자 이상이어야 합니다.');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('대문자를 포함해야 합니다.');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('소문자를 포함해야 합니다.');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('숫자를 포함해야 합니다.');
  }
  
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('특수문자를 포함해야 합니다.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 인증 에러 메시지 변환
 */
export function getAuthErrorMessage(error: AuthError): string {
  const errorMessages: Record<string, string> = {
    'auth/invalid-email': '유효하지 않은 이메일 주소입니다.',
    'auth/user-disabled': '비활성화된 계정입니다.',
    'auth/user-not-found': '사용자를 찾을 수 없습니다.',
    'auth/wrong-password': '잘못된 비밀번호입니다.',
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/weak-password': '비밀번호가 너무 약합니다.',
    'auth/network-request-failed': '네트워크 오류가 발생했습니다.',
    'auth/too-many-requests': '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
  };
  
  return errorMessages[error.code] || error.message || '인증 중 오류가 발생했습니다.';
}

/**
 * 소셜 로그인 제공자 정보
 */
export function getProviderInfo(provider: AuthProvider) {
  const providers = {
    google: {
      name: 'Google',
      icon: '🔍',
      color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
    },
    kakao: {
      name: '카카오',
      icon: '💬',
      color: 'bg-yellow-400 hover:bg-yellow-500 text-black'
    },
    apple: {
      name: 'Apple',
      icon: '🍎',
      color: 'bg-black hover:bg-gray-900 text-white'
    },
    wechat: {
      name: 'WeChat',
      icon: '💚',
      color: 'bg-green-500 hover:bg-green-600 text-white'
    }
  };
  
  return providers[provider];
}

/**
 * 토큰 만료 시간 계산
 */
export function isTokenExpired(expiresAt: string | number): boolean {
  const now = Date.now();
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return now >= expiry;
} 