import { useAuth } from './useAuth';
import { UserProfiles } from '@/types/interfaces';
import useSWR from 'swr';

interface UserProfileDetailsHook {
  userProfileDetails: UserProfiles | null;
  loading: boolean;
  error: any;
  refetch: () => void;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

/**
 * 사용자 프로필 상세 정보를 조회하는 SWR 기반 훅
 */
export function useProfileDetails(): UserProfileDetailsHook {
  const { user, isAuthenticated } = useAuth();

  // 사용자가 인증된 경우에만 프로필 정보를 요청합니다.
  const { 
    data: profileData, 
    error, 
    isLoading, 
    mutate 
  } = useSWR(
    isAuthenticated && user ? `/api/user/profile?userId=${user.id}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    }
  );

  const userProfileDetails = profileData?.success ? profileData.user : null;

  return {
    userProfileDetails,
    loading: isLoading,
    error: error || (profileData && !profileData.success ? new Error(profileData.message) : null),
    refetch: mutate,
  };
} 