import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { UserProfiles } from '@/types/interfaces';

interface ProfileDetailsState {
  isLoading: boolean;
  error: string | null;
  detailedProfile: UserProfiles | null;
  lastFetched: number | null;
}

interface UserProfileDetailsHook {
  userProfileDetails: UserProfiles | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 필요한 시점에 프로필 상세 정보를 조회하는 훅
 * 로그인 시에는 세션 기반 기본 프로필만 사용하고,
 * 마이페이지, 투표 등에서 필요할 때만 DB 조회 수행
 */
export function useProfileDetails(): UserProfileDetailsHook {
  const { user, userProfile } = useAuth();
  const [userProfileDetails, setUserProfileDetails] = useState<UserProfiles | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfileDetails = async () => {
    if (!user?.id) {
      setUserProfileDetails(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        throw error;
      }

      setUserProfileDetails(data);
    } catch (err: any) {
      console.error('사용자 프로필 상세 정보 조회 오류:', err);
      setError(err.message || '프로필 정보를 불러오는 중 오류가 발생했습니다.');
      setUserProfileDetails(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfileDetails();
  }, [user?.id]);

  /**
   * 프로필 상세 정보 조회 (필요시에만 호출)
   * @param force - 캐시 무시하고 강제 조회 여부
   */
  const fetchProfileDetails = useCallback(async (force: boolean = false) => {
    if (!user?.id) {
      setError('로그인이 필요합니다');
      return null;
    }

    // 최근에 조회했다면 스킵 (5분 캐시)
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000; // 5분
    
    if (!force && userProfileDetails && userProfileDetails.created_at && (now - new Date(userProfileDetails.created_at).getTime()) < cacheExpiry) {
      console.log('📋 [useProfileDetails] 캐시된 상세 프로필 사용');
      return userProfileDetails;
    }

    setLoading(true);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      console.log('📋 [useProfileDetails] 프로필 상세 정보 조회 시작');

      // 단순한 타임아웃 설정 (5초)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('프로필 상세 조회 타임아웃')), 5000);
      });

      const supabase = createBrowserSupabaseClient();
      const profilePromise = supabase
        .from('user_profiles')
        .select(`
          id, email, nickname, avatar_url, is_admin, is_super_admin,
          star_candy, star_candy_bonus, birth_date, birth_time,
          gender, open_ages, open_gender, created_at, updated_at
        `)
        .eq('id', user.id)
        .single();

      const { data, error } = await Promise.race([
        profilePromise,
        timeoutPromise,
      ]) as any;

      const duration = Date.now() - startTime;
      
      if (error) {
        console.warn('⚠️ [useProfileDetails] 프로필 상세 조회 실패:', error);
        
        // DB 조회 실패 시 세션 기반 프로필 유지
        setUserProfileDetails(userProfile);
        
        return userProfile;
      }

      const detailedProfile = data as UserProfiles;
      
      console.log(`✅ [useProfileDetails] 프로필 상세 조회 성공 (${duration}ms):`, {
        nickname: detailedProfile.nickname,
        starCandy: detailedProfile.star_candy,
        isAdmin: detailedProfile.is_admin,
      });

      // 상태 업데이트
      setUserProfileDetails(detailedProfile);

      // 상세 프로필 정보를 내부 상태에만 저장 (AuthProvider는 세션 기반 프로필 유지)
      return detailedProfile;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [useProfileDetails] 프로필 상세 조회 예외 (${duration}ms):`, error);
      
      setUserProfileDetails(userProfile);
      
      return userProfile;
    }
  }, [user?.id, userProfileDetails, userProfile]);

  /**
   * 특정 정보가 필요한지 확인하는 유틸리티 함수들
   */
  const needsDetailedProfile = useCallback((requiredFields: Array<keyof UserProfiles>) => {
    if (!userProfile) return true;
    
    // 세션 기반 프로필에서 제공되지 않는 정보들 체크
    const detailOnlyFields: Array<keyof UserProfiles> = [
      'star_candy', 'star_candy_bonus', 'is_admin', 'is_super_admin',
      'birth_date', 'birth_time', 'gender', 'open_ages', 'open_gender'
    ];
    
    return requiredFields.some(field => detailOnlyFields.includes(field));
  }, [userProfile]);

  /**
   * 마이페이지용 프로필 조회
   */
  const fetchForMyPage = useCallback(async () => {
    console.log('👤 [useProfileDetails] 마이페이지용 프로필 조회');
    return await fetchProfileDetails();
  }, [fetchProfileDetails]);

  /**
   * 투표용 프로필 조회 (별사탕, 권한 확인)
   */
  const fetchForVoting = useCallback(async () => {
    console.log('🗳️ [useProfileDetails] 투표용 프로필 조회');
    return await fetchProfileDetails();
  }, [fetchProfileDetails]);

  /**
   * 관리자 권한 확인
   */
  const checkAdminStatus = useCallback(async () => {
    if (userProfile?.is_admin !== undefined) {
      return userProfile.is_admin;
    }
    
    const detailed = await fetchProfileDetails();
    return detailed?.is_admin || false;
  }, [userProfile?.is_admin, fetchProfileDetails]);

  return {
    userProfileDetails,
    loading,
    error,
    refetch: fetchUserProfileDetails,
  };
} 