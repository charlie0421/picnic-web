'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Products } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { useAuth } from '@/lib/supabase/auth-provider';
import { motion } from 'framer-motion';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
import { portOneService } from '@/lib/payment/portone';
import { payPalService } from '@/lib/payment/paypal';
import Image from 'next/image';
import Link from 'next/link';
import { useLoginRequired, useDialog } from '@/components/ui/Dialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { saveRedirectUrl } from '@/utils/auth-redirect';
import StarCandyBalanceBox from '@/components/common/StarCandyBalanceBox';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';

interface StarCandyProductsPresenterProps {
  products: Products[];
  error: string | null;
  className?: string;
}

export function StarCandyProductsPresenter({
  products,
  error,
  className
}: StarCandyProductsPresenterProps) {
  const { t, currentLanguage } = useLanguageStore();
  const { user, userProfile, loadUserProfile } = useAuth();
  const isAdmin = userProfile?.is_admin || false;
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('paypal');
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false); // 중복 호출 방지 플래그
  const isClearedRef = useRef(false);
  const currentPaymentIdRef = useRef<string | null>(null);
  const [balanceBoxKey, setBalanceBoxKey] = useState(0); // StarCandyBalanceBox 강제 리렌더링용
  const dialogContext = useDialog();
  const showLoginRequired = dialogContext.showLoginRequired;
  const showDialog = dialogContext.showDialog;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const ensureActiveMembership = useWithdrawalGuard();

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
        <div className="space-y-4 py-2">
          {/* 충전 내용 */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm text-gray-700">{t('recharge_details')}</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('product_name_label')}:</span>
                <span className="font-medium text-gray-900">{productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t('recharge_star_candy_label')}:</span>
                <span className="font-medium text-gray-900">
                  {verifyResult.payment?.starCandy?.toLocaleString() || 0}{t('unit_count')}
                </span>
              </div>
              {verifyResult.payment?.bonusAmount && verifyResult.payment.bonusAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('bonus_star_candy_label')}:</span>
                  <span className="font-medium text-green-600">
                    +{verifyResult.payment.bonusAmount.toLocaleString()}{t('unit_count')}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-gray-600">{t('payment_amount_label')}:</span>
                <span className="font-semibold text-gray-900">
                  {verifyResult.payment?.amount?.toLocaleString() || 0}{t('currency_krw')}
                </span>
              </div>
            </div>
          </div>
          
          {/* 결과 내용 */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm text-blue-700">{t('recharge_result')}</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-600">{t('total_recharge_star_candy_label')}:</span>
                <span className="font-semibold text-blue-700">
                  {((verifyResult.payment?.starCandy || 0) + (verifyResult.payment?.bonusAmount || 0)).toLocaleString()}{t('unit_count')}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200">
                <span className="text-blue-600">{t('current_balance_label')}:</span>
                <span className="font-bold text-lg text-blue-700">
                  {verifyResult.balance?.total?.toLocaleString() || 0}{t('unit_count')}
                </span>
              </div>
            </div>
          </div>
        </div>
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
          const returnTo = pathname || '/';
          const langFromPath = pathname?.split('/')[1] || '';
          const lang = langFromPath || currentLanguage || 'en';
          try {
            await showLoginRequired({
              redirectUrl: returnTo,
              onLogin: () => {
                try { saveRedirectUrl(returnTo); } catch {}
                const loginUrl = `/${lang}/login?returnTo=${encodeURIComponent(returnTo)}`;
                if (typeof window !== 'undefined') {
                  window.location.href = loginUrl;
                } else {
                  router.push(loginUrl);
                }
              },
            });
          } catch {
            // 폴백: 직접 로그인 페이지로 이동
            try { saveRedirectUrl(returnTo); } catch {}
            const loginUrl = `/${lang}/login?returnTo=${encodeURIComponent(returnTo)}`;
            if (typeof window !== 'undefined') {
              window.location.href = loginUrl;
            } else {
              router.push(loginUrl);
            }
          }
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
    const initialDelay = 2000; // 2초 지연
    
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

  const formatPrice = (price: number | null, currency: 'KRW' | 'USD') => {
    if (!price) return '';

    if (currency === 'KRW') {
      return `₩${price.toLocaleString('ko-KR')}`;
    } else {
      return `$${price.toFixed(2)}`;
    }
  };

  const handlePurchase = async (product: Products) => {
    if (!user) {
      // 비로그인 시: 로그인 다이얼로그 → 언어별 로그인 경로로 이동 (강건한 폴백 포함)
      const returnTo = pathname || '/';
      const langFromPath = pathname?.split('/')[1] || '';
      const lang = langFromPath || currentLanguage || 'en';
      try {
        await showLoginRequired({
          redirectUrl: returnTo,
          onLogin: () => {
            try { saveRedirectUrl(returnTo); } catch {}
            const loginUrl = `/${lang}/login?returnTo=${encodeURIComponent(returnTo)}`;
            if (typeof window !== 'undefined') {
              window.location.href = loginUrl;
            } else {
              router.push(loginUrl);
            }
          },
        });
      } catch {
        try { saveRedirectUrl(returnTo); } catch {}
        const loginUrl = `/${lang}/login?returnTo=${encodeURIComponent(returnTo)}`;
        if (typeof window !== 'undefined') {
          window.location.href = loginUrl;
        } else {
          router.push(loginUrl);
        }
      }
      return;
    }

    if (processingProductId) {
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
  };

  const handlePortOnePayment = async (product: Products) => {
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
  };

  const handlePayPalPayment = async (product: Products) => {
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
            get: () => Promise.resolve({ id: orderID })
          }
        };

        // Redirect to PayPal approval URL
        const approvalUrl = `https://www.${process.env.NEXT_PUBLIC_PAYPAL_ENV === 'production' ? '' : 'sandbox.'}paypal.com/checkoutnow?token=${orderID}`;
        
        // Open PayPal in a centered popup window
        const width = 500;
        const height = 600;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);
        
        const paypalWindow = window.open(
          approvalUrl,
          'paypal_checkout',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
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
                } catch (error) {
                  // Payment likely was not completed
                  console.log('Payment was cancelled or not completed');
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
          }, 1000);

          // Clear interval after 10 minutes
          setTimeout(() => {
            clearInterval(interval);
            if (paypalWindow && !paypalWindow.closed) {
              paypalWindow.close();
            }
          }, 600000);
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
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
  };

  const getCurrentPrice = (product: Products) => {
    const currency = getCurrencyByPaymentMethod(selectedPaymentMethod);
    return currency === 'KRW' ? product.web_price_krw : product.web_price_usd;
  };

  const getCurrentCurrency = () => {
    return getCurrencyByPaymentMethod(selectedPaymentMethod);
  };

  // 안전한 다국어 문자열 처리 함수
  const getSafeLocalizedString = (value: any, language: string) => {
    if (!value) return '';
    
    // 이미 문자열인 경우
    if (typeof value === 'string') {
      // JSON 문자열인지 확인
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed[language]) {
          return parsed[language];
        }
        if (typeof parsed === 'object' && parsed['en']) {
          return parsed['en'];
        }
        // JSON이지만 해당 언어가 없으면 원본 문자열 반환
        return value;
      } catch {
        // JSON이 아닌 일반 문자열
        return value;
      }
    }
    
    // 객체인 경우
    if (typeof value === 'object' && value !== null) {
      return value[language] || value['en'] || '';
    }
    
    return String(value);
  };

  // 상품 수량에 따라 적절한 이미지를 선택하는 함수
  const getProductImage = (starCandyAmount: number | null | undefined) => {
    if (!starCandyAmount) return '/images/star-candy/star_100.png';
    
    const imageMap = [
      { threshold: 100, image: 'star_100.png' },
      { threshold: 200, image: 'star_200.png' },
      { threshold: 600, image: 'star_600.png' },
      { threshold: 1000, image: 'star_1000.png' },
      { threshold: 2000, image: 'star_2000.png' },
      { threshold: 3000, image: 'star_3000.png' },
      { threshold: 4000, image: 'star_4000.png' },
      { threshold: 5000, image: 'star_5000.png' },
      { threshold: 7000, image: 'star_7000.png' },
      { threshold: 10000, image: 'star_10000.png' }
    ];

    // 수량에 가장 가까운 이미지를 찾기
    let selectedImage = imageMap[0].image;
    for (const item of imageMap) {
      if (starCandyAmount <= item.threshold) {
        selectedImage = item.image;
        break;
      }
      selectedImage = item.image; // 가장 큰 수량보다 많은 경우 최대 이미지 사용
    }

    return `/images/star-candy/${selectedImage}`;
  };

  // 상품을 소팅하는 함수
  const getSortedProducts = () => {
    return [...products].sort((a, b) => {
      // 2. web_display_order가 있으면 그것으로 정렬
      if (a.web_display_order && b.web_display_order) {
        return a.web_display_order - b.web_display_order;
      }
      if (a.web_display_order && !b.web_display_order) return -1;
      if (!a.web_display_order && b.web_display_order) return 1;
      
      // 3. 별사탕 수량으로 정렬 (오름차순)
      return (a.star_candy || 0) - (b.star_candy || 0);
    });
  };

  // 서버 컴포넌트에서 완성된 데이터만 전달받음
  // 로딩 상태는 페이지 레벨의 loading.tsx에서 처리됨

  if (error) {
    return (
      <div className={`text-center py-12 ${className || ''}`}>
        <p className='text-red-500 mb-4'>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className='px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90'
        >
          {t('button_retry')}
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className={`text-center py-12 ${className || ''}`}>
        <p className='text-gray-500'>{t('star_candy_no_products')}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* 별사탕 잔액 박스 */}
      <div className="mb-4">
        <StarCandyBalanceBox key={balanceBoxKey} autoFetch={true} compact={true} />
      </div>

      <div className='text-center mb-8'>
        <h1 className='text-3xl font-bold mb-2 text-gray-900'>
          {t('star_candy_recharge_title')}
        </h1>
        <p className='text-gray-600'>{t('star_candy_recharge_description')}</p>
      </div>

      <PaymentMethodSelector 
        onMethodChange={handlePaymentMethodChange}
        className="mb-8"
      />

      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6'>
        {getSortedProducts().map((product, index) => {
          // 추천 상품을 600개, 10,000개 상품만으로 제한 (최대 2개)
          const isFeatured = product.star_candy === 600 || product.star_candy === 10000;
          const isProcessing = processingProductId === product.id;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow ${
                isFeatured ? 'ring-2 ring-primary' : ''
              }`}
            >
              {isFeatured && (
                <div className="absolute top-0 right-0 bg-primary text-white px-2 py-1 text-xs font-medium rounded-bl-lg">
                  {t('star_candy_featured')}
                </div>
              )}

              <div className='p-6'>
                <div className='text-center mb-4'>
                  <div className='inline-flex items-center justify-center w-20 h-20 mb-3'>
                    <Image
                      src={getProductImage(product.star_candy)}
                      alt={`${product.star_candy || 0} ${t('star_candy_unit')}`}
                      width={80}
                      height={80}
                      className='object-contain'
                    />
                  </div>

                  <h3 className='text-xl font-bold mb-1 text-gray-900'>
                    {(product.star_candy || 0).toLocaleString()} {t('star_candy_unit')}
                  </h3>

                  {product.web_bonus_amount && product.web_bonus_amount > 0 ? (
                    <p className='text-sm text-green-600 font-medium'>
                      +{product.web_bonus_amount.toLocaleString()}{' '}
                      {t('star_candy_bonus')}
                    </p>
                  ) : (
                    <p className='text-sm text-gray-400 font-medium'>
                      {t('star_candy_no_bonus')}
                    </p>
                  )}
                </div>

                {product.web_description && (
                  <p className='text-sm text-gray-600 mb-4 text-center min-h-[2rem] flex items-center justify-center'>
                    {getSafeLocalizedString(product.web_description, currentLanguage)
                      .replace(/\s*\+\s*Bonus\s*/gi, '') // "+ Bonus" 제거
                      .replace(/\s*\+\s*보너스\s*/gi, '') // "+ 보너스" 제거  
                      .replace(/\s*\+\s*/g, '') // 남은 "+" 기호들 제거
                      .replace(/\s*Bonus\s*/gi, '') // "Bonus" 단어 제거
                      .replace(/\s*보너스\s*/gi, '') // "보너스" 단어 제거
                      .trim()}
                  </p>
                )}

                <div className='text-center mb-4'>
                  <p className='text-2xl font-bold text-primary'>
                    {formatPrice(getCurrentPrice(product), getCurrentCurrency())}
                  </p>
                </div>

                <button
                  onClick={() => handlePurchase(product)}
                  disabled={isProcessing || !isAdmin}
                  className={`
                    w-full py-3 font-medium rounded-lg transition-colors
                    ${isProcessing || !isAdmin
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary/90'
                    }
                  `}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle 
                          className="opacity-25" 
                          cx="12" 
                          cy="12" 
                          r="10" 
                          stroke="currentColor" 
                          strokeWidth="4"
                        />
                        <path 
                          className="opacity-75" 
                          fill="currentColor" 
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      {t('processing')}
                    </span>
                  ) : (
                    t('star_candy_purchase')
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className='mt-8 bg-gray-50 rounded-lg p-6'>
        <h3 className='font-medium mb-2 text-gray-900'>{t('star_candy_notice_title')}</h3>
        <ul className='text-sm text-gray-600 space-y-1'>
          <li>• {t('star_candy_notice_1')}</li>
          <li>
            • {currentLanguage === 'ko' ? '환불은 ' : 
               currentLanguage === 'ja' ? '返金については' :
               currentLanguage === 'zh-cn' ? '退款请参考' :
               currentLanguage === 'zh-tw' ? '退款請參考' :
               currentLanguage === 'id' ? 'Untuk pengembalian dana, silakan lihat ' :
               'Please refer to the '}
            <Link 
              href={`/${currentLanguage}/terms`} 
              className='text-primary hover:underline font-medium'
            >
              {t('terms_of_service')}
            </Link>
            {currentLanguage === 'ko' ? '을 참고바랍니다.' : 
             currentLanguage === 'ja' ? 'をご확認ください。' :
             currentLanguage === 'zh-cn' ? '。' :
             currentLanguage === 'zh-tw' ? '。' :
             currentLanguage === 'id' ? '.' :
             ' for refund policy.'}
          </li>
          <li>• {t('star_candy_notice_3')}</li>
        </ul>
      </div>

      {/* 결제 검증 중 펄스 애니메이션 오버레이 */}
      {isVerifying && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            {/* 로고 아이콘 with 펄스 애니메이션 */}
            <div className="relative inline-block">
              <Image
                
                src="/images/logo.webp"
                alt="Picnic Loading"
                width={80}
                height={80}
                priority
                className="w-20 h-20 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
              />
            </div>
            
            {/* 로딩 텍스트 */}
            <div className="mt-6 text-white text-sm font-medium animate-scale-pulse">
              결제를 확인하는 중입니다...
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 