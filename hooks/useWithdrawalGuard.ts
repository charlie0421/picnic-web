'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useWithdrawnUserDialog } from '@/components/ui/Dialog/DialogProvider';
import { useLanguageStore } from '@/stores/languageStore';

/**
 * 공통 탈퇴 사용자 차단 훅
 *
 * 로그인 차단(OAuth 콜백/세션 복원 경로)에서 사용하는 것과 동일한
 * `WithdrawnUserDialog` 를 사용해 UX 일관성을 보장한다.
 *
 * @returns `true`를 반환하면 이미 탈퇴 처리된 사용자이므로 이후 로직을 중단해야 합니다.
 *   `loadUserProfileImpl`에서도 `deleted_at` 감지 시 강제 로그아웃 + `/login` 리다이렉트가
 *   실행되므로, 이 훅은 사용자 액션(투표/포스팅 등) 시점의 즉시 피드백 용도로 사용한다.
 */
export function useWithdrawalGuard() {
  const { user, userProfile, loadUserProfile } = useAuth();
  const { t } = useLanguageStore();
  const showWithdrawnUserDialog = useWithdrawnUserDialog();

  return useCallback(async () => {
    if (!user?.id) {
      return false;
    }

    try {
      const refreshedProfile = await loadUserProfile(user.id);
      const profile = refreshedProfile ?? userProfile;

      if (profile?.deleted_at) {
        showWithdrawnUserDialog({
          title: t('error_message_withdrawal'),
          description: t('error_message_withdrawal'),
        }).catch(() => {});
        return true;
      }
    } catch (error) {
      console.error('[WithdrawalGuard] Failed to refresh user profile:', error);
    }

    return false;
  }, [user?.id, userProfile, loadUserProfile, showWithdrawnUserDialog, t]);
}
