import { useState, useCallback } from 'react';
import { Products } from '@/types/interfaces';
import { User } from '@supabase/supabase-js';
import { PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
import { portOneService } from '@/lib/payment/portone';
import { payPalService } from '@/lib/payment/paypal';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PAYPAL_POPUP_WIDTH,
  PAYPAL_POPUP_HEIGHT,
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_TIMEOUT_MS,
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
  selectedPaymentMethod,
  processingProductId,
  setPendingPaymentId,
  setStoredPaymentId,
  router,
  pathname,
  currentLanguage,
  showLoginRequired,
  t,
  ensureActiveMembership,
}: UsePaymentHandlersParams) {
  const [internalProcessingProductId, setProcessingProductId] = useState<string | null>(null);

  const effectiveProcessingProductId = processingProductId ?? internalProcessingProductId;

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

  const handlePayPalPayment = useCallback(async (product: Products) => {
    try {
      // Initialize PayPal service
      const initialized = await payPalService.initialize();
      if (!initialized) {
        throw new Error('PayPal SDK initialization failed');
      }

      // Create PayPal order
      const orderID = await payPalService.createOrder({
        productId: product.id,
        productName: product.product_name,
        amount: product.web_price_usd || 0,
        starCandy: product.star_candy || 0,
        bonusAmount: product.web_bonus_amount || 0,
        userId: user?.id || '',
        userEmail: user?.email || '',
      });

      // Get PayPal SDK instance and approve order
      const paypal = payPalService.getPayPal();
      if (paypal && paypal.Buttons) {
        // Open PayPal checkout in a popup
        const actions = {
          order: {
            get: () => Promise.resolve({ id: orderID }),
          },
        };

        // Redirect to PayPal approval URL
        const approvalUrl = `https://www.${process.env.NEXT_PUBLIC_PAYPAL_ENV === 'production' ? '' : 'sandbox.'}paypal.com/checkoutnow?token=${orderID}`;

        // Open PayPal in a centered popup window
        const width = PAYPAL_POPUP_WIDTH;
        const height = PAYPAL_POPUP_HEIGHT;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);

        const paypalWindow = window.open(
          approvalUrl,
          'paypal_checkout',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
        );

        // Poll for payment completion
        const pollForCompletion = () => {
          const interval = setInterval(async () => {
            try {
              // Check if popup was closed
              if (paypalWindow?.closed) {
                clearInterval(interval);

                // Try to capture the order to check if payment was completed
                try {
                  const result = await payPalService.captureOrder(orderID);
                  if (result.success) {
                    alert(t('payment_success'));
                    window.location.reload();
                  }
                } catch {
                  // Payment likely was not completed
                }
                return;
              }

              // Check popup URL for success/cancel indicators
              try {
                const currentUrl = paypalWindow?.location?.href;
                if (currentUrl && currentUrl.includes('success')) {
                  clearInterval(interval);
                  paypalWindow?.close();

                  // Capture the order
                  const result = await payPalService.captureOrder(orderID);
                  if (result.success) {
                    alert(t('payment_success'));
                    window.location.reload();
                  } else {
                    alert(t('payment_failed'));
                  }
                }
              } catch (error) {
                // Cross-origin restriction, continue polling
              }
            } catch (error) {
              console.error('Error polling payment status:', error);
            }
          }, PAYMENT_POLL_INTERVAL_MS);

          // Clear interval after timeout
          setTimeout(() => {
            clearInterval(interval);
            if (paypalWindow && !paypalWindow.closed) {
              paypalWindow.close();
            }
          }, PAYMENT_POLL_TIMEOUT_MS);
        };

        pollForCompletion();
      } else {
        // Fallback: redirect to PayPal
        const paypalPayUrl = `https://www.${process.env.NEXT_PUBLIC_PAYPAL_ENV === 'production' ? '' : 'sandbox.'}paypal.com/checkoutnow?token=${orderID}`;
        window.location.href = paypalPayUrl;
      }
    } catch (error) {
      console.error('PayPal payment error:', error);
      alert(t('payment_failed'));
    }
  }, [user, t]);

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
        await handlePayPalPayment(product);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(t('payment_failed'));
    } finally {
      setProcessingProductId(null);
    }
  }, [user, effectiveProcessingProductId, selectedPaymentMethod, handlePortOnePayment, handlePayPalPayment, pathname, currentLanguage, router, showLoginRequired, t, ensureActiveMembership]);

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
  };
}
