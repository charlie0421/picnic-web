'use client';

import React, { useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Products } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString } from '@/utils/api/strings';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { motion } from 'framer-motion';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
import { PortOnePaymentModal } from './PortOnePaymentModal';
import { PayPalPaymentButton } from './PayPalPaymentButton';
import Image from 'next/image';

interface StarCandyProductsPresenterProps {
  products: Products[];
  loading: boolean;
  error: string | null;
  className?: string;
}

export function StarCandyProductsPresenter({
  products,
  loading,
  error,
  className
}: StarCandyProductsPresenterProps) {
  const { t, currentLanguage } = useLanguageStore();
  const { user } = useAuth();
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('paypal');
  const [selectedProduct, setSelectedProduct] = useState<Products | null>(null);
  const [showPortOneModal, setShowPortOneModal] = useState(false);
  const [showPayPalButton, setShowPayPalButton] = useState(false);

  const formatPrice = (price: number | null, currency: 'KRW' | 'USD') => {
    if (!price) return '';

    if (currency === 'KRW') {
      return `₩${price.toLocaleString('ko-KR')}`;
    } else {
      return `$${price.toFixed(2)}`;
    }
  };

  const handlePurchase = (product: Products) => {
    if (!user) {
      // TODO: Show login modal or redirect to login
      alert(t('star_candy_login_required'));
      return;
    }

    setSelectedProduct(product);

    if (selectedPaymentMethod === 'portone') {
      setShowPortOneModal(true);
    } else {
      setShowPayPalButton(true);
    }
  };

  const handlePortOneSuccess = (paymentId: string) => {
    console.log('Port One payment successful:', paymentId);
    // TODO: Show success message
    alert(t('payment_success'));
    // Refresh products to update any UI changes
    window.location.reload();
  };

  const handlePayPalSuccess = (orderID: string) => {
    console.log('PayPal payment successful:', orderID);
    setShowPayPalButton(false);
    setSelectedProduct(null);
    // TODO: Show success message
    alert(t('payment_success'));
    // Refresh products to update any UI changes
    window.location.reload();
  };

  const handlePayPalError = (error: any) => {
    console.error('PayPal payment error:', error);
    alert(t('payment_failed'));
  };

  const handlePayPalCancel = () => {
    console.log('PayPal payment cancelled');
    setShowPayPalButton(false);
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

  if (loading) {
    return (
      <div className={`space-y-6 ${className || ''}`}>
        {/* Header Skeleton - 실제 UI와 일치 */}
        <div className='text-center mb-8'>
          <div className='h-8 bg-gray-200 rounded w-32 mx-auto mb-2 animate-pulse'></div>
          <div className='h-5 bg-gray-200 rounded w-80 mx-auto animate-pulse'></div>
        </div>

        {/* PaymentMethodSelector Skeleton - 실제 UI와 일치 */}
        <div className='space-y-4 mb-8'>
          <div className='text-center'>
            <div className='h-6 bg-gray-200 rounded w-24 mx-auto mb-2 animate-pulse'></div>
            <div className='h-4 bg-gray-200 rounded w-40 mx-auto animate-pulse'></div>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto'>
            {/* Port One Skeleton - 선택된 상태 */}
            <div className='relative p-4 rounded-lg border-2 border-purple-300 bg-purple-50'>
              <div className='absolute -top-2 -right-2 bg-green-200 w-12 h-6 rounded-full animate-pulse'></div>
              <div className='flex items-center space-x-3'>
                <div className='w-8 h-8 bg-gray-200 rounded animate-pulse'></div>
                <div className='text-left flex-1'>
                  <div className='h-4 bg-gray-200 rounded w-16 mb-1 animate-pulse'></div>
                  <div className='h-3 bg-gray-200 rounded w-32 animate-pulse'></div>
                </div>
              </div>
            </div>
            {/* PayPal Skeleton */}
            <div className='p-4 rounded-lg border-2 border-gray-200'>
              <div className='flex items-center space-x-3'>
                <div className='w-8 h-8 bg-gray-200 rounded-full animate-pulse'></div>
                <div className='text-left flex-1'>
                  <div className='h-4 bg-gray-200 rounded w-12 mb-1 animate-pulse'></div>
                  <div className='h-3 bg-gray-200 rounded w-28 animate-pulse'></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid Skeleton - 실제 UI와 정확히 일치 */}
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6'>
          {Array.from({ length: 10 }).map((_, index) => {
            const isFeatured = index === 2; // 600개 상품 위치
            return (
              <div
                key={index}
                className={`relative bg-white rounded-xl shadow-lg overflow-hidden ${
                  isFeatured ? 'ring-2 ring-purple-500' : ''
                }`}
              >
                {/* Featured Badge */}
                {isFeatured && (
                  <div className='absolute top-0 right-0 bg-purple-200 px-2 py-1 text-xs rounded-bl-lg animate-pulse'></div>
                )}

                <div className='p-6'>
                  {/* 별사탕 아이콘 영역 */}
                  <div className='text-center mb-4'>
                    <div className='inline-flex items-center justify-center w-20 h-20 mb-3'>
                      {/* 수량에 따른 아이콘 배치 */}
                      {index === 0 && (
                        <div className='w-12 h-12 bg-blue-200 rounded-full animate-pulse'></div>
                      )}
                      {index === 1 && (
                        <div className='flex space-x-1'>
                          <div className='w-8 h-8 bg-blue-200 rounded-full animate-pulse'></div>
                          <div className='w-8 h-8 bg-blue-200 rounded-full animate-pulse'></div>
                        </div>
                      )}
                      {(index === 2 || index === 3) && (
                        <div className='grid grid-cols-2 gap-1'>
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className='w-6 h-6 bg-blue-200 rounded-full animate-pulse'></div>
                          ))}
                        </div>
                      )}
                      {index >= 4 && index <= 6 && (
                        <div className='grid grid-cols-3 gap-1'>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className='w-4 h-4 bg-blue-200 rounded-full animate-pulse'></div>
                          ))}
                        </div>
                      )}
                      {index >= 7 && (
                        <div className='relative'>
                          <div className='w-16 h-16 bg-purple-200 rounded-full animate-pulse'></div>
                          <div className='absolute inset-0 flex items-center justify-center'>
                            <div className='w-6 h-6 bg-blue-200 rounded-full animate-pulse'></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 수량 텍스트 - text-xl font-bold */}
                    <div className='h-7 bg-gray-200 rounded w-20 mx-auto mb-1 animate-pulse'></div>
                    
                    {/* 보너스 텍스트 - text-sm */}
                    <div className='h-5 bg-green-200 rounded w-24 mx-auto animate-pulse'></div>
                  </div>

                  {/* 패키지 설명 - 조건부 표시 */}
                  {index % 2 === 0 && (
                    <div className='text-center mb-4'>
                      <div className='h-4 bg-gray-200 rounded w-full mb-1 animate-pulse'></div>
                      <div className='h-4 bg-gray-200 rounded w-3/4 mx-auto animate-pulse'></div>
                    </div>
                  )}

                  {/* 가격 - text-2xl font-bold */}
                  <div className='text-center mb-4'>
                    <div className='h-8 bg-purple-200 rounded w-24 mx-auto animate-pulse'></div>
                  </div>

                  {/* 버튼 - py-3 */}
                  <div className='h-12 bg-purple-200 rounded-lg w-full animate-pulse'></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notice Section Skeleton */}
        <div className='mt-8 bg-gray-50 rounded-lg p-6'>
          <div className='h-5 bg-gray-200 rounded w-32 mb-2 animate-pulse'></div>
          <div className='space-y-1'>
            <div className='h-4 bg-gray-200 rounded w-full animate-pulse'></div>
            <div className='h-4 bg-gray-200 rounded w-5/6 animate-pulse'></div>
            <div className='h-4 bg-gray-200 rounded w-4/5 animate-pulse'></div>
          </div>
        </div>
      </div>
    );
  }

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
        <h1 className='text-3xl font-bold mb-2'>
          {t('star_candy_recharge_title')}
        </h1>
        <p className='text-gray-600'>{t('star_candy_recharge_description')}</p>
      </div>

      <PaymentMethodSelector 
        onMethodChange={handlePaymentMethodChange}
        className="mb-8"
      />

      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6'>
        {getSortedProducts().map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`
              relative bg-white rounded-xl shadow-lg overflow-hidden
              ${product.web_is_featured ? 'ring-2 ring-primary' : ''}
            `}
          >
            {product.web_is_featured && (
              <div className='absolute top-0 right-0 bg-primary text-white px-3 py-1 text-sm font-medium rounded-bl-lg'>
                {t('star_candy_featured')}
              </div>
            )}

            <div className='p-6'>
              <div className='text-center mb-4'>
                <div className='inline-flex items-center justify-center w-20 h-20 mb-3'>
                  <Image
                    src={getProductImage(product.star_candy)}
                    alt={`${product.star_candy} ${t('star_candy_unit')}`}
                    width={80}
                    height={80}
                    className='object-contain'
                    onError={(e) => {
                      // Fallback to emoji if image not found
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.fallback-emoji')) {
                        const emoji = document.createElement('span');
                        emoji.className = 'fallback-emoji text-4xl';
                        emoji.textContent = '⭐';
                        parent.appendChild(emoji);
                      }
                    }}
                  />
                </div>

                <h3 className='text-xl font-bold mb-1'>
                  {product.star_candy?.toLocaleString()} {t('star_candy_unit')}
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
                  <p className='text-sm text-gray-600 mb-4 text-center'>
                    {getSafeLocalizedString(product.web_description, currentLanguage)}
                  </p>
                )}

              <div className='text-center mb-4'>
                <p className='text-2xl font-bold text-primary'>
                  {formatPrice(getCurrentPrice(product), getCurrentCurrency())}
                </p>
              </div>

              {showPayPalButton &&
              selectedProduct?.id === product.id &&
              selectedPaymentMethod === 'paypal' ? (
                <PayPalPaymentButton
                  product={product}
                  onSuccess={handlePayPalSuccess}
                  onError={handlePayPalError}
                  onCancel={handlePayPalCancel}
                />
              ) : (
                <button
                  onClick={() => handlePurchase(product)}
                  className='w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors'
                  disabled={!user}
                >
                  {user
                    ? t('star_candy_purchase')
                    : t('star_candy_login_required')}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className='mt-8 bg-gray-50 rounded-lg p-6'>
        <h3 className='font-medium mb-2'>{t('star_candy_notice_title')}</h3>
        <ul className='text-sm text-gray-600 space-y-1'>
          <li>• {t('star_candy_notice_1')}</li>
          <li>• {t('star_candy_notice_2')}</li>
          <li>• {t('star_candy_notice_3')}</li>
        </ul>
      </div>

      {/* Port One Payment Modal */}
      {selectedProduct && (
        <PortOnePaymentModal
          isOpen={showPortOneModal}
          onClose={() => {
            setShowPortOneModal(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onSuccess={handlePortOneSuccess}
        />
      )}
    </div>
  );
} 