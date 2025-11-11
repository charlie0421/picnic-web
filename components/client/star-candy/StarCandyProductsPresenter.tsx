'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Products } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
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
  const { user, userProfile } = useAuth();
  const isAdmin = userProfile?.is_admin || false;
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('paypal');
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false); // 중복 호출 방지 플래그
  const isClearedRef = useRef(false);
  const currentPaymentIdRef = useRef<string | null>(null);
  const dialogContext = useDialog();
  const showLoginRequired = dialogContext.showLoginRequired;
  const showDialog = dialogContext.showDialog;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // 페이지 로드 시 URL 파라미터에서 결제 상태 확인
  useEffect(() => {
    const paymentStatus = searchParams.get('status');
    const paymentId = searchParams.get('paymentId');
    const tossToken = searchParams.get('toss_token') || searchParams.get('token');
    
    // URL 파라미터에 paymentId나 status가 없으면 sessionStorage 정리 후 종료
    // (이전 세션의 sessionStorage에 남아있는 paymentId로 인한 오작동 방지)
    // 단, 토스페이먼트 토큰이 있는 경우는 처리 진행
    if (!paymentId && !paymentStatus && !tossToken) {
      setPendingPaymentId(null);
      setIsVerifying(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingPaymentId');
      }
      return;
    }
    
    // sessionStorage에서도 pendingPaymentId 확인 (컴포넌트 재렌더링 시 유지)
    const storedPaymentId = typeof window !== 'undefined' ? sessionStorage.getItem('pendingPaymentId') : null;
    // URL 파라미터가 있으면 우선적으로 사용
    // 토스페이먼트 토큰이 있는 경우 sessionStorage의 paymentId를 사용
    const effectivePaymentId = paymentId || (tossToken ? storedPaymentId : null) || storedPaymentId;

    if (effectivePaymentId && user) {
      // paymentId가 있으면 pendingPaymentId를 설정하여 주기적 검증 시작
      // 첫 번째 useEffect는 한 번만 검증 시도하고, 이미 완료되었으면 즉시 처리
      const verifyPaymentOnce = async () => {
        // 중복 호출 방지
        if (isVerifyingRef.current) {
          return;
        }

        isVerifyingRef.current = true;

        try {
          const verifyResponse = await fetch('/api/payment/portone/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paymentId: effectivePaymentId }),
          });

          const verifyResult = await verifyResponse.json();
          
          // verified가 true인지 확인
          const isVerified = verifyResult.verified === true || verifyResult.verified === 'true' || verifyResult.verified === 1;
          
          if (isVerified) {
            // 결제 완료 및 검증 성공
            isVerifyingRef.current = false;
            setPendingPaymentId(null);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('pendingPaymentId');
            }
            showSuccessDialog(verifyResult);
          } else if (verifyResult.status === 'READY' || (verifyResult.status === 'PAID' && verifyResult.verified === false)) {
            // 결제가 아직 처리 중인 경우
            isVerifyingRef.current = false;
            setPendingPaymentId(effectivePaymentId);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('pendingPaymentId', effectivePaymentId);
            }
          } else {
            // 검증 실패
            isVerifyingRef.current = false;
            alert(t('payment_verification_failed'));
            router.replace(pathname || '/ko/star-candy');
          }
        } catch (error) {
          console.error('[Client] Payment verification error:', error);
          isVerifyingRef.current = false;
          // 에러가 발생했지만 웹훅이 처리할 수 있으므로 pendingPaymentId 설정
          setPendingPaymentId(effectivePaymentId);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('pendingPaymentId', effectivePaymentId);
          }
        }
      };

      verifyPaymentOnce();
    } else if (!effectivePaymentId) {
      // paymentId가 없으면 pendingPaymentId 초기화
      setPendingPaymentId(null);
      // sessionStorage에서도 제거
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingPaymentId');
      }
    }
  }, [searchParams, user, router, pathname, t, products, currentLanguage, showSuccessDialog]);

  // 결제 요청 후 주기적으로 검증 시도 (콜백이 호출되지 않은 경우 대비)
  useEffect(() => {
    // URL 파라미터에서 paymentId나 status 확인
    const urlPaymentId = searchParams.get('paymentId');
    const urlStatus = searchParams.get('status');
    const tossToken = searchParams.get('toss_token') || searchParams.get('token');
    
    // URL 파라미터에 paymentId나 status가 없으면 검증을 시작하지 않음
    // (이전 세션의 sessionStorage에 남아있는 paymentId로 인한 오작동 방지)
    // 단, 토스페이먼트 토큰이 있는 경우는 처리 진행
    if (!urlPaymentId && !urlStatus && !tossToken) {
      // URL 파라미터가 없으면 sessionStorage도 정리
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingPaymentId');
      }
      setPendingPaymentId(null);
      setIsVerifying(false);
      isClearedRef.current = true;
      currentPaymentIdRef.current = null;
      return;
    }
    
    // sessionStorage에서도 pendingPaymentId 확인 (컴포넌트 재렌더링 시 유지)
    const storedPaymentId = typeof window !== 'undefined' ? sessionStorage.getItem('pendingPaymentId') : null;
    // URL 파라미터가 있으면 우선적으로 사용, 없으면 sessionStorage 사용
    // 토스페이먼트 토큰이 있는 경우 sessionStorage의 paymentId를 사용
    const effectivePendingPaymentId = urlPaymentId || (tossToken ? storedPaymentId : null) || pendingPaymentId || storedPaymentId;
    
    if (!effectivePendingPaymentId || !user) {
      isClearedRef.current = true;
      currentPaymentIdRef.current = null;
      setIsVerifying(false);
      return;
    }
    
    // sessionStorage에 있으면 상태에도 설정
    if (storedPaymentId && !pendingPaymentId) {
      setPendingPaymentId(storedPaymentId);
    }

    const intervalMs = 2000; // 2초마다 시도

    // 새로운 결제 ID로 시작할 때 플래그 초기화
    isClearedRef.current = false;
    currentPaymentIdRef.current = effectivePendingPaymentId;

    let attemptCount = 0;

    // 검증 시작 시 펄스 애니메이션 표시 (URL 파라미터가 있을 때만)
    setIsVerifying(true);

    const verifyInterval = setInterval(async () => {
      // 이미 정리되었거나 paymentId가 변경된 경우 중단
      if (isClearedRef.current || currentPaymentIdRef.current !== effectivePendingPaymentId) {
        clearInterval(verifyInterval);
        return;
      }

      attemptCount++;

      // 중복 호출 방지: 이미 검증 중이면 스킵
      if (isVerifyingRef.current) {
        return;
      }

      isVerifyingRef.current = true;

      try {
        const verifyResponse = await fetch('/api/payment/portone/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paymentId: effectivePendingPaymentId }),
        });

        const verifyResult = await verifyResponse.json();
        
        // verified가 true인지 확인
        const isVerified = verifyResult.verified === true || verifyResult.verified === 'true' || verifyResult.verified === 1;
        
        // 검증 완료 후 플래그 해제
        isVerifyingRef.current = false;

        if (isVerified) {
          // 결제 완료 및 검증 성공
          isClearedRef.current = true;
          clearInterval(verifyInterval);
          setIsVerifying(false);
          isVerifyingRef.current = false;
          setPendingPaymentId(null);
          currentPaymentIdRef.current = null;
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('pendingPaymentId');
          }
          showSuccessDialog(verifyResult);
        } else if (verifyResult.status === 'READY' || (verifyResult.status === 'PAID' && verifyResult.verified === false)) {
          // READY 상태이거나 PAID 상태이지만 웹훅이 아직 처리하지 않은 경우 계속 시도
        }
      } catch (error) {
        console.error(`[Client] Verification error (attempt ${attemptCount}):`, error);
        isVerifyingRef.current = false;
      }
    }, intervalMs);

    // 컴포넌트 언마운트 시 인터벌 정리
    return () => {
      isClearedRef.current = true;
      setIsVerifying(false);
      isVerifyingRef.current = false;
      currentPaymentIdRef.current = null;
      clearInterval(verifyInterval);
    };
  }, [pendingPaymentId, user, showSuccessDialog, searchParams]);

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
      // 포트원 v2 브라우저 SDK는 결제 창을 열고, 사용자가 결제를 완료하면
      // redirectUrl로 리다이렉트하거나 Promise를 resolve할 수 있습니다.
      // 리다이렉트되지 않는 경우를 대비하여 주기적 검증을 시작합니다.
      // 주기적 검증을 위해 paymentId를 상태에 저장합니다.
      setPendingPaymentId(paymentId);
      // sessionStorage에도 저장 (컴포넌트 재렌더링 시 유지)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pendingPaymentId', paymentId);
      }
      
      try {
        const response = await portOneService.requestPaymentAuto(paymentRequest);

        if (response.success && response.paymentId) {
          // 결제가 성공적으로 완료되었습니다
          // 포트원 v2 브라우저 SDK가 Promise를 resolve한 경우 즉시 검증
          try {
            const verifyResponse = await fetch('/api/payment/portone/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ paymentId: response.paymentId }),
            });

            const verifyResult = await verifyResponse.json();
            
            if (verifyResult.verified === true) {
              // 결제 완료 및 검증 성공
              setPendingPaymentId(null);
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('pendingPaymentId');
              }
              showSuccessDialog(verifyResult);
            } else if (verifyResult.status === 'READY' || (verifyResult.status === 'PAID' && verifyResult.verified === false)) {
              // 결제가 아직 처리 중인 경우
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.set('paymentId', response.paymentId);
              currentUrl.searchParams.set('status', 'processing');
              window.location.href = currentUrl.toString();
            }
          } catch (error) {
            console.error('[Client] Payment verification error:', error);
          }
        } else {
          // 결제 실패 또는 취소 - paymentId가 있으면 주기적 검증 계속 진행
          if (paymentRequest.paymentId) {
            setPendingPaymentId(paymentRequest.paymentId);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('pendingPaymentId', paymentRequest.paymentId);
            }
          }
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
        <StarCandyBalanceBox autoFetch={true} compact={true} />
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
                src="/images/logo.png"
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