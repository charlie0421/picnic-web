import { useState, useCallback, useRef } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import { useAuth } from '@/lib/supabase/auth-provider';
import useSWR from 'swr';
import type { VoteUsage } from '@/types/wallet';
import { MAX_VOTE_AMOUNT } from '@/lib/wallet/limits';

export interface UserBalance {
  starCandy: string;
  starCandyBonus: string;
  cottonCandy: string;
  totalAvailable: string;
  cottonNextExpiresAt: string | null;
}

interface PendingRequest {
  id: string;
  voteId: number;
  voteItemId: number;
  amount: number;
}

export function nextRequestId(
  prev: PendingRequest | null,
  voteId: number,
  voteItemId: number,
  amount: number,
): PendingRequest {
  if (prev && prev.voteId === voteId && prev.voteItemId === voteItemId && prev.amount === amount) {
    return prev;
  }
  return { id: crypto.randomUUID(), voteId, voteItemId, amount };
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
  const requestIdRef = useRef<PendingRequest | null>(null);
  const [lastUsage, setLastUsage] = useState<VoteUsage | null>(null);

  // SWR을 사용하여 지갑(잔액) 정보 가져오기 — wallet.v1 계약(decimal string)
  const {
    data: profileData,
    error: balanceError,
    isLoading: isLoadingBalance,
    mutate: mutateProfile
  } = useSWR(isOpen && user ? '/api/user/wallet' : null, fetcher, {
    revalidateOnFocus: false,
  });

  const userBalance: UserBalance | null = profileData?.success ? {
    starCandy: profileData.wallet.star,
    starCandyBonus: profileData.wallet.bonus,
    cottonCandy: profileData.wallet.cotton,
    totalAvailable: (
      BigInt(profileData.wallet.star) + BigInt(profileData.wallet.bonus) + BigInt(profileData.wallet.cotton)
    ).toString(),
    cottonNextExpiresAt: profileData.wallet.cotton_next_expires_at,
  } : null;

  // UI가 다룰 수 있는 상한 — 서버(voting-v2) int4 상한을 초과할 수 없다.
  // 이 상한보다 큰 값을 "전체"로 표시하면 실제 잔액보다 적은 수량이 전체로 오인된다.
  const isBalanceAboveMaxVoteAmount = userBalance
    ? BigInt(userBalance.totalAvailable) > BigInt(MAX_VOTE_AMOUNT)
    : false;
  const maxAmount = userBalance
    ? Number(
        BigInt(userBalance.totalAvailable) > BigInt(MAX_VOTE_AMOUNT)
          ? MAX_VOTE_AMOUNT
          : userBalance.totalAvailable,
      )
    : 0;

  // 전체 사용 체크박스 핸들러
  const handleUseAllChange = useCallback((checked: boolean) => {
    setUseAllVotes(checked);
    if (checked && userBalance) {
      setVoteAmount(maxAmount);
    } else {
      setVoteAmount(1);
    }
  }, [userBalance, maxAmount]);

  // 투표 수량 변경 핸들러
  const handleAmountChange = useCallback((amount: number) => {
    if (!userBalance) return;

    const newAmount = Math.max(1, Math.min(amount, maxAmount));
    setVoteAmount(newAmount);

    setUseAllVotes(newAmount === maxAmount);
  }, [userBalance, maxAmount]);

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

    requestIdRef.current = nextRequestId(requestIdRef.current, voteId, voteItemId, voteAmount);

    try {
      const voteData = {
        vote_id: voteId,
        vote_item_id: voteItemId,
        amount: voteAmount,
        request_id: requestIdRef.current.id,
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

      // 성공 — 다음 제출을 위해 request_id 를 비우고 사후 usage 표기
      requestIdRef.current = null;
      setLastUsage(result.data?.usage ?? null);

      // 잔액 정보 갱신
      mutateProfile();

      setShowSuccess(true);
      onVoteSuccess?.(voteAmount);

      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);

    } catch (error) {
      // 실패 — request_id 를 유지해 동일 파라미터 재시도 시 멱등이 성립하도록 한다
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
    maxAmount,
    isBalanceAboveMaxVoteAmount,
    lastUsage,
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
