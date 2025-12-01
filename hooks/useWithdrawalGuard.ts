'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useDialog } from '@/components/ui/Dialog';
import { useLanguageStore } from '@/stores/languageStore';

/**
 * 공통 탈퇴 사용자 차단 훅
 *
 * @returns `true`를 반환하면 이미 탈퇴 처리된 사용자이므로 이후 로직을 중단해야 합니다.
 */
export function useWithdrawalGuard() {
  const { user, userProfile, loadUserProfile } = useAuth();
  const { t } = useLanguageStore();
  const { showDialog } = useDialog();

  return useCallback(async () => {
    if (!user?.id) {
      return false;
    }

    try {
      const refreshedProfile = await loadUserProfile(user.id);
      const profile = refreshedProfile ?? userProfile;

      if (profile?.deleted_at) {
        if (showDialog) {
          showDialog({
            type: 'error',
            size: 'sm',
            title: t('error_message_withdrawal'),
            description: t('error_message_withdrawal'),
          });
        } else {
          alert(t('error_message_withdrawal'));
        }
        return true;
      }
    } catch (error) {
      console.error('[WithdrawalGuard] Failed to refresh user profile:', error);
    }

    return false;
  }, [user?.id, userProfile, loadUserProfile, showDialog, t]);
}

