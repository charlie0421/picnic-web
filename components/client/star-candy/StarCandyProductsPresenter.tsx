'use client';

import React, { useState } from 'react';
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
  const { user } = useAuth();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('paypal');
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);

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
      alert(t('star_candy_login_required'));
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
      // Generate unique payment ID
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare payment request
      const paymentRequest = {
        paymentId,
        orderName: `${product.product_name} - ${product.star_candy} 별사탕`,
        totalAmount: product.web_price_krw || 0,
        currency: 'KRW' as const,
        customer: {
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
      const response = await portOneService.requestPaymentAuto(paymentRequest);

      if (response.success && response.paymentId) {
        // Verify payment on server
        const verified = await portOneService.verifyPayment(response.paymentId);
        
        if (verified) {
          alert(t('payment_success'));
          window.location.reload();
        } else {
          alert(t('payment_verification_failed'));
        }
      } else {
        alert(response.error?.message || t('payment_failed'));
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
                  disabled={!user || isProcessing}
                  className={`
                    w-full py-3 font-medium rounded-lg transition-colors
                    ${!user
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isProcessing
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
                  ) : !user ? (
                    t('star_candy_login_required')
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
               currentLanguage === 'zh' ? '退款请参考' :
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
             currentLanguage === 'zh' ? '。' :
             currentLanguage === 'id' ? '.' :
             ' for refund policy.'}
          </li>
          <li>• {t('star_candy_notice_3')}</li>
        </ul>
      </div>
    </div>
  );
} 