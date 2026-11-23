import { useState, useCallback } from 'react';
import { Products } from '@/types/interfaces';
import { User } from '@supabase/supabase-js';
import { PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
import { portOneService } from '@/lib/payment/portone';
import { resolvePaymentMethod } from '@/lib/payment/availability';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  buildLoginRedirect,
  ShowLoginRequired,
} from './star-candy-utils';

interface UsePaymentHandlersParams {
  user: User | null;
  selectedPaymentMethod: PaymentMethod;
  processingProductId: string | null;
  setPendingPaymentId: (id: string | null) => void;
  setStoredPaymentId: (id: string) => void;
  router: AppRouterInstance;
  pathname: string | null;
  currentLanguage: string;
  showLoginRequired: ShowLoginRequired;
  t: (key: string) => string;
  ensureActiveMembership: () => Promise<boolean>;
}

export function usePaymentHandlers({
  user,
  processingProductId,
  setPendingPaymentId,
  setStoredPaymentId,
  router,
  pathname,
  currentLanguage,
  showLoginRequired,
  t,
  ensureActiveMembership,
  selectedPaymentMethod: requestedPaymentMethod,
}: UsePaymentHandlersParams) {
  const selectedPaymentMethod = resolvePaymentMethod(requestedPaymentMethod);
  const [internalProcessingProductId, setProcessingProductId] = useState<string | null>(null);

  const [payPalSelection, setPayPalSelection] = useState<{ userId: string; productId: string } | null>(null);
  const payPalProductId = payPalSelection && payPalSelection.userId === user?.id ? payPalSelection.productId : null;

  const effectiveProcessingProductId = processingProductId ?? internalProcessingProductId ?? payPalProductId;
  const closePayPalCheckout = useCallback(() => setPayPalSelection(null), []);

  const handlePortOnePayment = useCallback(async (product: Products) => {
    try {
      // 사용자 인증 확인
      if (!user?.id) {
        alert('로그인이 필요합니다. 다시 로그인해주세요.');
        return;
      }

      // Generate unique payment ID (merchant_uid)
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare payment request
      const paymentRequest = {
        paymentId,
        orderName: `${product.product_name} - ${product.star_candy} 별사탕`,
        totalAmount: product.web_price_krw || 0,
        currency: 'KRW' as const,
        customer: {
          userId: user.id, // 웹훅에서 사용자 식별용 (필수)
          fullName: user?.user_metadata?.name || '사용자',
          email: user?.email || '',
          phoneNumber: user?.user_metadata?.phone,
        },
        productInfo: {
          id: product.id,
          name: product.product_name,
          starCandy: product.star_candy || 0,
          bonusAmount: product.web_bonus_amount || 0,
        },
      };

      // Request payment using Port One v2 (automatic payment method selection)
      // 포트원 v2 브라우저 SDK는 PC 환경에서 Promise로 결과를 반환하므로
      // polling 방식으로 결제 상태를 주기적으로 확인합니다
      setPendingPaymentId(paymentId);
      setStoredPaymentId(paymentId);

      try {
        const response = await portOneService.requestPaymentAuto(paymentRequest);

        if (response.success && response.paymentId) {
          // 결제가 성공적으로 완료되었습니다
          // polling이 이미 시작되어 있으므로 별도 검증 불필요
          // polling에서 자동으로 검증 및 성공 처리됨
        } else if (paymentRequest.paymentId) {
          // 결제 실패 또는 취소 - paymentId가 있으면 주기적 검증 계속 진행
          setPendingPaymentId(paymentRequest.paymentId);
          setStoredPaymentId(paymentRequest.paymentId);
        }
      } catch (error) {
        // requestPayment가 reject된 경우 (리다이렉트되거나 결제 창이 닫힌 경우)
        // redirectUrl로 리다이렉트되었을 수 있으므로, 에러를 표시하지 않고
        // callback에서 처리하도록 합니다.
        console.error('[Client] Payment request error:', error);
        // 에러를 표시하지 않고, redirectUrl로 리다이렉트되거나 웹훅이 처리할 때까지 기다립니다.
        // 사용자가 결제 창을 닫은 경우는 useEffect에서 처리합니다.
      }
    } catch (error) {
      console.error('Port One payment error:', error);
      alert(t('payment_error_occurred'));
    }
  }, [user, setPendingPaymentId, setStoredPaymentId, t]);

  const handlePurchase = useCallback(async (product: Products) => {
    if (!user) {
      await buildLoginRedirect(pathname, currentLanguage, router, showLoginRequired);
      return;
    }

    if (effectiveProcessingProductId) {
      return; // 이미 처리 중인 결제가 있음
    }

    if (await ensureActiveMembership()) {
      return;
    }

    setProcessingProductId(product.id);

    try {
      if (selectedPaymentMethod === 'portone') {
        await handlePortOnePayment(product);
      } else {
        setPayPalSelection({ userId: user.id, productId: product.id });
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(t('payment_failed'));
    } finally {
      setProcessingProductId(null);
    }
  }, [user, effectiveProcessingProductId, selectedPaymentMethod, handlePortOnePayment, pathname, currentLanguage, router, showLoginRequired, t, ensureActiveMembership]);

  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    // This is intentionally not exposed via state setter — the parent manages selectedPaymentMethod
    // The caller should update their own state
  }, []);

  const getCurrentPrice = useCallback((product: Products) => {
    const currency = getCurrencyByPaymentMethod(selectedPaymentMethod);
    return currency === 'KRW' ? product.web_price_krw : product.web_price_usd;
  }, [selectedPaymentMethod]);

  const getCurrentCurrency = useCallback(() => {
    return getCurrencyByPaymentMethod(selectedPaymentMethod);
  }, [selectedPaymentMethod]);

  return {
    handlePurchase,
    handlePaymentMethodChange,
    getCurrentPrice,
    getCurrentCurrency,
    processingProductId: internalProcessingProductId,
    payPalProductId,
    closePayPalCheckout,
  };
}
