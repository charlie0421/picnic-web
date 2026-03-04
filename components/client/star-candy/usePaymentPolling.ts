import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getLocalizedString } from '@/utils/api/strings';
import { Products } from '@/types/interfaces';
import { User } from '@supabase/supabase-js';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { VERIFY_INITIAL_DELAY_MS, buildLoginRedirect, ShowLoginRequired } from './star-candy-utils';
import { DialogProps } from '@/components/ui/Dialog/types';
import React from 'react';

interface UsePaymentPollingParams {
  products: Products[];
  user: User | null;
  router: AppRouterInstance;
  pathname: string | null;
  currentLanguage: string;
  showDialog: ((props: Omit<DialogProps, 'isOpen' | 'onClose'>) => void) | null;
  showLoginRequired: ShowLoginRequired;
  t: (key: string) => string;
}

export function usePaymentPolling({
  products,
  user,
  router,
  pathname,
  currentLanguage,
  showDialog,
  showLoginRequired,
  t,
}: UsePaymentPollingParams) {
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false); // 중복 호출 방지 플래그
  const isClearedRef = useRef(false);
  const currentPaymentIdRef = useRef<string | null>(null);
  const [balanceBoxKey, setBalanceBoxKey] = useState(0); // StarCandyBalanceBox 강제 리렌더링용
  const searchParams = useSearchParams();

  // sessionStorage 헬퍼 함수
  const getStoredPaymentId = useCallback((): string | null => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('pendingPaymentId') : null;
  }, []);

  const setStoredPaymentId = useCallback((paymentId: string): void => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingPaymentId', paymentId);
    }
  }, []);

  const removeStoredPaymentId = useCallback((): void => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pendingPaymentId');
    }
  }, []);

  // 결제 검증 결과 확인 헬퍼 함수
  const isPaymentVerified = useCallback((result: { verified?: boolean | string | number }): boolean => {
    return result.verified === true || result.verified === 'true' || result.verified === 1;
  }, []);

  // 성공 Dialog 표시 헬퍼 함수
  const showSuccessDialog = useCallback((verifyResult: {
    payment?: { productId?: string; starCandy?: number; bonusAmount?: number; amount?: number };
    balance?: { total?: number };
  }) => {
    if (!showDialog) {
      alert(t('payment_success'));
      router.replace(pathname || '/ko/star-candy');
      window.location.reload();
      return;
    }

    const product = products.find(p => p.id === verifyResult.payment?.productId);
    const productName = product ? getLocalizedString(product.product_name, currentLanguage) : '';

    showDialog({
      type: 'success',
      size: 'md',
      title: t('payment_completed_title'),
      description: t('payment_completed_description'),
      children: (
        React.createElement('div', { className: 'space-y-4 py-2' },
          React.createElement('div', { className: 'bg-gray-50 rounded-lg p-4 space-y-2' },
            React.createElement('h4', { className: 'font-semibold text-sm text-gray-700' }, t('recharge_details')),
            React.createElement('div', { className: 'space-y-1.5 text-sm' },
              React.createElement('div', { className: 'flex justify-between' },
                React.createElement('span', { className: 'text-gray-600' }, t('product_name_label'), ':'),
                React.createElement('span', { className: 'font-medium text-gray-900' }, productName),
              ),
              React.createElement('div', { className: 'flex justify-between' },
                React.createElement('span', { className: 'text-gray-600' }, t('recharge_star_candy_label'), ':'),
                React.createElement('span', { className: 'font-medium text-gray-900' },
                  (verifyResult.payment?.starCandy?.toLocaleString() || 0), t('unit_count'),
                ),
              ),
              verifyResult.payment?.bonusAmount && verifyResult.payment.bonusAmount > 0 &&
                React.createElement('div', { className: 'flex justify-between' },
                  React.createElement('span', { className: 'text-gray-600' }, t('bonus_star_candy_label'), ':'),
                  React.createElement('span', { className: 'font-medium text-green-600' },
                    '+', verifyResult.payment.bonusAmount.toLocaleString(), t('unit_count'),
                  ),
                ),
              React.createElement('div', { className: 'flex justify-between pt-2 border-t border-gray-200' },
                React.createElement('span', { className: 'text-gray-600' }, t('payment_amount_label'), ':'),
                React.createElement('span', { className: 'font-semibold text-gray-900' },
                  (verifyResult.payment?.amount?.toLocaleString() || 0), t('currency_krw'),
                ),
              ),
            ),
          ),
          React.createElement('div', { className: 'bg-blue-50 rounded-lg p-4 space-y-2' },
            React.createElement('h4', { className: 'font-semibold text-sm text-blue-700' }, t('recharge_result')),
            React.createElement('div', { className: 'space-y-1.5 text-sm' },
              React.createElement('div', { className: 'flex justify-between' },
                React.createElement('span', { className: 'text-blue-600' }, t('total_recharge_star_candy_label'), ':'),
                React.createElement('span', { className: 'font-semibold text-blue-700' },
                  ((verifyResult.payment?.starCandy || 0) + (verifyResult.payment?.bonusAmount || 0)).toLocaleString(), t('unit_count'),
                ),
              ),
              React.createElement('div', { className: 'flex justify-between pt-2 border-t border-blue-200' },
                React.createElement('span', { className: 'text-blue-600' }, t('current_balance_label'), ':'),
                React.createElement('span', { className: 'font-bold text-lg text-blue-700' },
                  (verifyResult.balance?.total?.toLocaleString() || 0), t('unit_count'),
                ),
              ),
            ),
          ),
        )
      ),
      onClose: () => {
        router.replace(pathname || '/ko/star-candy');
        window.location.reload();
      },
    });
  }, [showDialog, products, currentLanguage, router, pathname, t]);

  // 페이지 로드 시 URL 파라미터 확인 (모바일 환경에서 리다이렉트된 경우만)
  // PC 환경에서는 PortOne v2 브라우저 SDK가 Promise로 결과를 반환하므로 리다이렉트가 발생하지 않음
  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const tossToken = searchParams.get('toss_token') || searchParams.get('token');

    if (paymentId) {
      // URL 파라미터의 paymentId가 있으면 저장 (모바일 리다이렉트)
      setPendingPaymentId(paymentId);
      setStoredPaymentId(paymentId);
    } else if (tossToken) {
      // 토스페이먼트 토큰이 있으면 저장된 paymentId 복원
      const storedId = getStoredPaymentId();
      if (storedId) {
        setPendingPaymentId(storedId);
      }
    }
  }, [searchParams, getStoredPaymentId, setStoredPaymentId]);

  // 결제 요청 후 주기적으로 검증 시도 (polling 방식)
  // PortOne v2 브라우저 SDK는 PC 환경에서 리다이렉트 없이 Promise로 결과를 반환하므로
  // polling 방식으로 결제 상태를 주기적으로 확인합니다
  useEffect(() => {
    if (!user) {
      isClearedRef.current = true;
      setIsVerifying(false);
      return;
    }

    const storedPaymentId = getStoredPaymentId();
    const effectivePendingPaymentId = pendingPaymentId || storedPaymentId;

    // paymentId가 없으면 polling 시작하지 않음
    if (!effectivePendingPaymentId) {
      // 상태도 없고 sessionStorage도 없으면 정리
      removeStoredPaymentId();
      isClearedRef.current = true;
      currentPaymentIdRef.current = null;
      setIsVerifying(false);
      return;
    }

    // sessionStorage에 있으면 상태에도 동기화
    if (storedPaymentId && storedPaymentId !== pendingPaymentId) {
      setPendingPaymentId(storedPaymentId);
    }

    const baseIntervalMs = 5000; // 기본 5초마다 시도 (토큰 갱신 부하 감소)
    let currentIntervalMs = baseIntervalMs; // 동적 간격 (429 에러 시 증가)
    let consecutive429Errors = 0; // 연속된 429 에러 카운트

    // 새로운 결제 ID로 시작할 때 플래그 초기화
    isClearedRef.current = false;
    currentPaymentIdRef.current = effectivePendingPaymentId;

    let attemptCount = 0;

    // PC 환경에서는 리다이렉트가 없으므로 항상 백그라운드에서 조용히 검증
    // (페이지 진입 시 로딩바가 나타나지 않도록)
    // 첫 번째 시도에서 완료되지 않았을 때만 로딩바 표시
    let isFirstAttemptRef = { current: true }; // 첫 번째 시도인지 추적

    const verifyPayment = async () => {
      // 이미 정리되었거나 paymentId가 변경된 경우 중단
      if (isClearedRef.current || currentPaymentIdRef.current !== effectivePendingPaymentId) {
        return false; // 더 이상 검증하지 않음
      }

      attemptCount++;

      // 중복 호출 방지: 이미 검증 중이면 스킵
      if (isVerifyingRef.current) {
        return true; // 계속 검증
      }

      isVerifyingRef.current = true;

      try {
        const verifyResponse = await fetch('/api/payment/portone/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // 쿠키 포함
          body: JSON.stringify({ paymentId: effectivePendingPaymentId }),
        });

        // 429 에러 처리 (Rate Limit) - exponential backoff 적용
        if (verifyResponse.status === 429) {
          consecutive429Errors++;
          // Exponential backoff: 5초 → 10초 → 20초 → 30초 (최대)
          currentIntervalMs = Math.min(baseIntervalMs * Math.pow(2, consecutive429Errors - 1), 30000);
          console.warn(`[Client] Rate limit (429) encountered. Increasing polling interval to ${currentIntervalMs}ms (consecutive errors: ${consecutive429Errors})`);
          isVerifyingRef.current = false;
          // 간격을 늘려서 재시도 (너무 빈번한 요청 방지)
          return true; // 계속 검증하되 간격 증가
        }

        // 429가 아니면 카운터 리셋
        if (consecutive429Errors > 0) {
          consecutive429Errors = 0;
          currentIntervalMs = baseIntervalMs;
        }

        // 401 에러 처리
        if (verifyResponse.status === 401) {
          const errorData = await verifyResponse.json().catch(() => ({}));
          console.error('[Client] Authentication failed during payment verification:', {
            status: verifyResponse.status,
            statusText: verifyResponse.statusText,
            error: errorData.error,
            message: errorData.message,
            paymentId: effectivePendingPaymentId,
            hasUser: !!user,
            userId: user?.id,
          });
          isVerifyingRef.current = false;
          // 세션 만료 시 재로그인 요청
          await buildLoginRedirect(pathname, currentLanguage, router, showLoginRequired);
          return false; // 검증 중단
        }

        if (!verifyResponse.ok) {
          console.error('[Client] Payment verification failed:', verifyResponse.status, verifyResponse.statusText);
          isVerifyingRef.current = false;
          return true; // 계속 검증 시도 (일시적 오류일 수 있음)
        }

        const verifyResult = await verifyResponse.json();
        const isVerified = isPaymentVerified(verifyResult);

        if (isVerified) {
          // 결제 완료 및 검증 성공 - 정리 및 성공 처리
          isClearedRef.current = true;
          setIsVerifying(false);
          setPendingPaymentId(null);
          currentPaymentIdRef.current = null;
          removeStoredPaymentId();
          // 별사탕 박스 강제 갱신
          setBalanceBoxKey(prev => prev + 1);
          showSuccessDialog(verifyResult);
          return false; // 더 이상 검증하지 않음
        }

        // 첫 번째 시도에서 완료되지 않았으면 로딩바 표시
        if (isFirstAttemptRef.current) {
          setIsVerifying(true);
          isFirstAttemptRef.current = false;
        }

        // READY 또는 PAID 상태면 계속 검증 (웹훅이 처리할 수 있음)
        return verifyResult.status === 'READY' || (verifyResult.status === 'PAID' && verifyResult.verified === false);
      } catch (error) {
        console.error(`[Client] Verification error (attempt ${attemptCount}):`, error);
        // 첫 번째 시도에서 완료되지 않았으면 로딩바 표시
        if (isFirstAttemptRef.current) {
          setIsVerifying(true);
          isFirstAttemptRef.current = false;
        }
        return true; // 계속 검증
      } finally {
        // 항상 플래그 해제
        isVerifyingRef.current = false;
      }
    };

    // 첫 검증 시도는 지연 후 시작 (페이지 진입 시 로딩바 방지)
    const initialDelay = VERIFY_INITIAL_DELAY_MS;

    let verifyInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isPollingActive = true;

    // 동적 간격으로 polling하는 함수
    const scheduleNextVerification = () => {
      if (!isPollingActive || isClearedRef.current) {
        return;
      }

      verifyInterval = setTimeout(async () => {
        if (!isPollingActive || isClearedRef.current) {
          return;
        }

        const shouldContinue = await verifyPayment();
        if (!shouldContinue) {
          // 검증 완료되었으면 중단
          if (verifyInterval) {
            clearTimeout(verifyInterval);
            verifyInterval = null;
          }
          return;
        }

        // 다음 검증 스케줄링 (동적 간격 사용)
        scheduleNextVerification();
      }, currentIntervalMs);
    };

    const startVerification = () => {
      verifyPayment().then((shouldContinue) => {
        if (!shouldContinue) return; // 검증 완료되었으면 중단

        // 주기적으로 검증 시작 (동적 간격 사용)
        scheduleNextVerification();
      });
    };

    // 지연 후 검증 시작 (페이지 진입 시 로딩바가 나타나지 않도록)
    timeoutId = setTimeout(startVerification, initialDelay);

    // 컴포넌트 언마운트 시 정리
    return () => {
      isClearedRef.current = true;
      isPollingActive = false;
      setIsVerifying(false);
      isVerifyingRef.current = false;
      currentPaymentIdRef.current = null;
      timeoutId && clearTimeout(timeoutId);
      verifyInterval && clearTimeout(verifyInterval);
    };
  }, [pendingPaymentId, user, showSuccessDialog, getStoredPaymentId, removeStoredPaymentId, isPaymentVerified]);

  return {
    pendingPaymentId,
    setPendingPaymentId,
    isVerifying,
    balanceBoxKey,
    setStoredPaymentId,
  };
}
