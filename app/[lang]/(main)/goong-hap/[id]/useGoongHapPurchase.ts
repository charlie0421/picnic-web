import { useCallback, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { STAR_CANDY_COST } from './goong-hap-detail-utils';

interface UseGoongHapPurchaseParams {
  id: string;
  t: (key: string, fallback?: string) => string;
  refreshDetail: () => Promise<void>;
}

export function useGoongHapPurchase({ id, t, refreshDetail }: UseGoongHapPurchaseParams) {
  // 별사탕 결제 상태
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [userStarCandy, setUserStarCandy] = useState<number | null>(null);
  const lastPurchaseTime = useRef<number>(0);

  // 별사탕 잔액 조회
  const fetchUserStarCandy = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();
      setUserStarCandy(profile?.star_candy ?? 0);
    } catch {
      setUserStarCandy(0);
    }
  }, []);

  // 구매 확인 다이얼로그 열기
  const handleOpenPurchaseDialog = useCallback(async () => {
    // 연타 방지 (1초)
    const now = Date.now();
    if (now - lastPurchaseTime.current < 1000) return;
    lastPurchaseTime.current = now;

    setPurchaseError(null);
    await fetchUserStarCandy();
    setShowPurchaseDialog(true);
  }, [fetchUserStarCandy]);

  // 구매 처리
  const handlePurchase = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPurchaseError(t('common.auth.login') || '로그인이 필요합니다');
        return;
      }

      // 별사탕 잔액 확인
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.star_candy ?? 0) < STAR_CANDY_COST) {
        setPurchaseError(t('fortune_lack_of_star_candy_message') || `별사탕이 부족합니다. (필요: ${STAR_CANDY_COST}개)`);
        return;
      }

      // Edge function 호출하여 결제 처리
      const { error: fnError } = await supabase.functions.invoke('open-goonghap', {
        body: { userId: user.id, goonghapId: id },
      });

      if (fnError) {
        setPurchaseError(fnError.message || '결제 처리 중 오류가 발생했습니다');
        return;
      }

      // 성공 - 다이얼로그 닫고 데이터 새로고침
      setShowPurchaseDialog(false);
      await refreshDetail();
      await fetchUserStarCandy();
    } catch (e: any) {
      setPurchaseError(e?.message || '결제 처리 중 오류가 발생했습니다');
    } finally {
      setPurchasing(false);
    }
  }, [id, purchasing, t, fetchUserStarCandy, refreshDetail]);

  return {
    showPurchaseDialog,
    setShowPurchaseDialog,
    purchasing,
    purchaseError,
    userStarCandy,
    handleOpenPurchaseDialog,
    handlePurchase,
  };
}
