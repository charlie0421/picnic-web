import { useState, useCallback } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import { useAuth } from '@/lib/supabase/auth-provider';
import useSWR from 'swr';

export interface UserBalance {
  starCandy: number;
  starCandyBonus: number;
  totalAvailable: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface UseVoteDialogParams {
  isOpen: boolean;
  voteId: number;
  voteItemId: number;
  onVoteSuccess?: (amount: number) => void;
  onClose: () => void;
}

export function useVoteDialog({
  isOpen,
  voteId,
  voteItemId,
  onVoteSuccess,
  onClose,
}: UseVoteDialogParams) {
  const [voteAmount, setVoteAmount] = useState(1);
  const [useAllVotes, setUseAllVotes] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { t, currentLanguage } = useLanguageStore();
  const ensureActiveMembership = useWithdrawalGuard();
  const { user, isAuthenticated } = useAuth();

  // SWR을 사용하여 사용자 프로필(잔액) 정보 가져오기
  const {
    data: profileData,
    error: balanceError,
    isLoading: isLoadingBalance,
    mutate: mutateProfile
  } = useSWR(isOpen && user ? `/api/user/profile?userId=${user.id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const userBalance: UserBalance | null = profileData?.success ? {
    starCandy: profileData.user.star_candy || 0,
    starCandyBonus: profileData.user.star_candy_bonus || 0,
    totalAvailable: profileData.user.total_candy || 0,
  } : null;

  // 전체 사용 체크박스 핸들러
  const handleUseAllChange = useCallback((checked: boolean) => {
    setUseAllVotes(checked);
    if (checked && userBalance) {
      setVoteAmount(userBalance.totalAvailable);
    } else {
      setVoteAmount(1);
    }
  }, [userBalance]);

  // 투표 수량 변경 핸들러
  const handleAmountChange = useCallback((amount: number) => {
    if (!userBalance) return;

    const maxAmount = userBalance.totalAvailable;
    const newAmount = Math.max(1, Math.min(amount, maxAmount));
    setVoteAmount(newAmount);

    setUseAllVotes(newAmount === maxAmount);
  }, [userBalance]);

  // 입력 필드 변경 핸들러
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '' || value === '0') {
      setVoteAmount(1);
      setUseAllVotes(false);
      return;
    }

    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      handleAmountChange(numValue);
    }
  }, [handleAmountChange]);

  // 투표 실행
  const handleVoteSubmit = useCallback(async () => {
    if (!user || !userBalance) return;
    if (await ensureActiveMembership()) {
      return;
    }

    setIsVoting(true);
    setVoteError(null);

    try {
      const voteData = {
        vote_id: voteId,
        vote_item_id: voteItemId,
        amount: voteAmount,
      };

      const response = await fetch('/api/vote/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
      });

      const result = await response.json();

        if (!response.ok) {
        throw new Error(result.error || t('vote_popup_vote_failed'));
      }

      console.log('✅ [VotePopup] 투표 제출 성공:', result);

      // 잔액 정보 갱신
      mutateProfile();

      setShowSuccess(true);
      onVoteSuccess?.(voteAmount);

      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Vote submission error:', error);
      setVoteError(error instanceof Error ? error.message : t('vote_popup_vote_failed'));
    } finally {
      setIsVoting(false);
    }
  }, [user, userBalance, voteAmount, voteId, voteItemId, onVoteSuccess, onClose, t, mutateProfile, ensureActiveMembership]);

  // 로케일 매핑
  const getLocale = useCallback(() => {
    const localeMap: Record<string, string> = {
      ko: 'ko-KR',
      en: 'en-US',
      ja: 'ja-JP',
      zh: 'zh-CN',
      id: 'id-ID',
    };
    return localeMap[currentLanguage] || 'en-US';
  }, [currentLanguage]);

  return {
    voteAmount,
    setVoteAmount,
    useAllVotes,
    isVoting,
    voteError,
    showSuccess,
    userBalance,
    isLoadingBalance,
    balanceError,
    handleUseAllChange,
    handleAmountChange,
    handleInputChange,
    handleVoteSubmit,
    getLocale,
    mutateProfile,
    t,
  };
}
