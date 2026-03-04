'use client';

/**
 * auth-store-types.ts — AuthStore 공유 타입 및 디버그 유틸리티
 *
 * AuthContextType 인터페이스, 디버그 상수/함수, 그리고
 * 추출된 모듈(auth-store-auth, auth-store-profile)이 AuthStore 내부에
 * 접근하기 위한 AuthStoreAccessor 인터페이스를 정의합니다.
 */

import { Session, User } from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';

// ─── 디버그 유틸리티 ────────────────────────────────────

export const authDebug =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

export const debugLog = (...args: unknown[]) => {
  if (authDebug) {
    console.log(...args);
  }
};

export const debugWarn = (...args: unknown[]) => {
  if (authDebug) {
    console.warn(...args);
  }
};

// ─── AuthContextType ────────────────────────────────────

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfiles | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  signOut: () => Promise<void>;
  loadUserProfile: (userId: string) => Promise<UserProfiles | null>;
}

// ─── AuthStoreAccessor ("friend module" 패턴) ──────────

export interface AuthStoreAccessor {
  getSupabaseClient(): any;
  getState(): AuthContextType;
  updateState(newState: AuthContextType): void;
  getSignOutFn(): AuthContextType['signOut'];
  getLoadUserProfileFn(): AuthContextType['loadUserProfile'];
  getIsAuthEvaluating(): boolean;
  setIsAuthEvaluating(v: boolean): void;
  getLastExpiryWarningKey(): string | null;
  setLastExpiryWarningKey(v: string | null): void;
  loadUserProfile(userId: string): Promise<UserProfiles | null>;
  getProfileLoadPromises(): Map<string, Promise<UserProfiles | null>>;
}
