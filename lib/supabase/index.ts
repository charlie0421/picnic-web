/**
 * Supabase 클라이언트 및 유틸리티를 위한 중앙 집중식 내보내기 지점
 * 
 * @module lib/supabase/index
 */

// 서버 측 Supabase 구현을 내보냅니다.
export {
  createServerSupabaseClient,
  getServerUser,
  withAuth
} from './server';

// 클라이언트 사이드 인증 훅
export { AuthProvider, useAuth } from './auth-provider';

// 타입과 인터페이스
export type { UserProfiles as UserProfile } from '../../types/interfaces'; 