import { useState, useCallback, useRef } from 'react';
import { intlLocale } from '@/lib/i18n/locale';
import { useLanguageStore } from '@/stores/languageStore';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import { useAuth } from '@/lib/supabase/auth-provider';
import useSWR from 'swr';
import type { VoteUsage } from '@/types/wallet';
import { acquireVoteRequestId, releaseVoteRequestId } from '@/lib/wallet/vote-request-id';
import { MAX_VOTE_AMOUNT } from '@/lib/wallet/limits';
import { parseExpiringBonus, type ExpiringBonusMonth } from '@/lib/wallet/expiring-bonus';
import { findImminentBonus } from '@/lib/wallet/imminent-bonus';

export interface UserBalance {
  starCandy: string;
  starCandyBonus: string;
  cottonCandy: string;
  totalAvailable: string;
  cottonNextExpiresAt: string | null;
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
  // 성공 오버레이(2초) 동안·제출 중에는 재진입을 막는다. state 는 비동기라 ref 로 동기 가드한다.
  const submitLockRef = useRef(false);

  const { t, currentLanguage } = useLanguageStore();
  const ensureActiveMembership = useWithdrawalGuard();
  const { user, isAuthenticated } = useAuth();
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

  // 곧 소멸할 보너스 스타캔디. 앱은 이 정보를 소멸 예정 안내 화면에서만 보여주지만,
  // 소멸이 코앞이면 투표 수량 결정이 실제로 달라지므로 임박한 경우에만 끌어올린다.
  //
  // 조회 실패는 투표를 막지 않는다. 이 안내는 부가 정보이므로 조용히 접는다.
  const { data: expiringBonusData } = useSWR(
    isOpen && user ? '/api/user/wallet/expiring-bonus' : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  let expiringMonths: ExpiringBonusMonth[] | null = null;
  try {
    expiringMonths = expiringBonusData?.success ? parseExpiringBonus(expiringBonusData.months) : null;
  } catch {
    // 계약을 벗어난 응답이면 안내를 띄우지 않는다. 잘못된 소멸 시점을 보여주는 것보다 낫다.
    expiringMonths = null;
  }
  const imminentBonus = findImminentBonus(expiringMonths, Date.now());

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
    // 성공 오버레이는 시각적 가림일 뿐이라 버튼이 여전히 활성이다(포커스·보조기기 활성화 가능).
    // 성공 시 멱등 키를 비웠으므로 재진입하면 새 UUID 로 두 번째 차감이 일어난다.
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (await ensureActiveMembership()) {
      submitLockRef.current = false;
      return;
    }

    setIsVoting(true);
    setVoteError(null);

    // 멱등 키는 다이얼로그 언마운트(닫았다 다시 열기)를 넘어 유지되어야 한다.
    const requestKey = { userId: user.id, voteId, voteItemId, amount: voteAmount };
    const requestId = acquireVoteRequestId(requestKey);

    try {
      const voteData = {
        vote_id: voteId,
        vote_item_id: voteItemId,
        amount: voteAmount,
        request_id: requestId,
      };

      const response = await fetch('/api/vote/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
      });

      const result = await response.json();

        if (!response.ok) {
        // 서버가 기계 코드를 code 로 준다(error 는 구 번들이 그대로 띄울 사람용 문장).
        // 재시도해도 계속 실패하므로 새로고침을 안내한다.
        if (result.code === 'VOTE_CLIENT_UPGRADE_REQUIRED') {
          throw new Error(t('vote_client_upgrade_required'));
        }
        throw new Error(result.error || t('vote_popup_vote_failed'));
      }

      console.log('✅ [VotePopup] 투표 제출 성공:', result);

      // 성공 확정 — 이때만 멱등 키를 비운다. 실패/타임아웃에서 비우면 이중 차감이 가능해진다.
      releaseVoteRequestId(requestKey);
      setLastUsage(result.data?.usage ?? null);

      // 잔액 정보 갱신
      mutateProfile();

      setShowSuccess(true);
      onVoteSuccess?.(voteAmount);

      setTimeout(() => {
        setShowSuccess(false);
        submitLockRef.current = false;
        onClose();
      }, 2000);

    } catch (error) {
      // 실패 — 멱등 키를 비우지 않는다. 동일 파라미터 재시도가 같은 request_id 를 재사용해야 한다
      console.error('Vote submission error:', error);
      setVoteError(error instanceof Error ? error.message : t('vote_popup_vote_failed'));
      // 실패는 재시도를 허용해야 하므로 잠금을 푼다. 멱등 키는 유지되므로 같은 id 로 재시도된다.
      submitLockRef.current = false;
    } finally {
      setIsVoting(false);
    }
  }, [user, userBalance, voteAmount, voteId, voteItemId, onVoteSuccess, onClose, t, mutateProfile, ensureActiveMembership]);

  // 로케일 매핑
  const getLocale = useCallback(() => {
    return intlLocale(currentLanguage);
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
    imminentBonus,
    currentLanguage,
    handleUseAllChange,
    handleAmountChange,
    handleInputChange,
    handleVoteSubmit,
    getLocale,
    mutateProfile,
    t,
  };
}
