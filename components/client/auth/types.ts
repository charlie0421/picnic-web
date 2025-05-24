// 인증 관련 타입 정의

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'user' | 'admin' | 'moderator';

export interface AuthSession {
  user: User | null;
  isAuthenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData extends LoginCredentials {
  name: string;
  confirmPassword: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export type AuthProvider = 'google' | 'kakao' | 'apple' | 'wechat';

export interface SocialAuthData {
  provider: AuthProvider;
  accessToken: string;
  user?: {
    email?: string;
    name?: string;
    avatar?: string;
  };
} 