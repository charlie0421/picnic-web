'use client';

import React, { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Products } from '@/types/interfaces';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString } from '@/utils/api/strings';
import { useAuth } from '@/lib/supabase/auth-provider';
import { motion } from 'framer-motion';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
import { PortOnePaymentModal } from './PortOnePaymentModal';
import { PayPalPaymentButton } from './PayPalPaymentButton';

export function StarCandyProducts() {
  const { t, currentLanguage } = useLanguageStore();
  const { user } = useAuth();
  const [products, setProducts] = useState<Products[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('paypal');
  const [selectedProduct, setSelectedProduct] = useState<Products | null>(null);
  const [showPortOneModal, setShowPortOneModal] = useState(false);
  const [showPayPalButton, setShowPayPalButton] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      
      // 먼저 모든 consumable 제품을 가져와서 디버깅
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('product_type', 'consumable')
        .order('star_candy', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Fetched products:', data);

      // web_price_krw 또는 web_price_usd가 있는 제품만 필터링
      let filteredProducts = (data || []).filter(product => 
        product.web_price_krw || product.web_price_usd
      );

      console.log('Filtered products:', filteredProducts);

      // 만약 웹 가격이 설정된 제품이 없다면, 임시 샘플 데이터를 생성
      if (filteredProducts.length === 0 && data && data.length > 0) {
        console.log('No web pricing found, creating sample data from existing products');
        
        // 기존 제품 데이터에 웹 가격 정보를 임시로 추가
        const samplePricing = {
          100: { krw: 1400, usd: 0.90, bonus: 0 },
          200: { krw: 2800, usd: 1.99, bonus: 25 },
          600: { krw: 8500, usd: 5.99, bonus: 85 },
          1000: { krw: 14000, usd: 9.99, bonus: 150 },
          2000: { krw: 28000, usd: 19.99, bonus: 320 },
          3000: { krw: 42000, usd: 29.99, bonus: 540 },
          4000: { krw: 55000, usd: 39.99, bonus: 760 },
          5000: { krw: 69000, usd: 49.99, bonus: 1000 },
          7000: { krw: 95000, usd: 69.99, bonus: 1500 },
          10000: { krw: 130000, usd: 99.99, bonus: 2100 },
        };

        filteredProducts = data
          .filter(product => product.star_candy && samplePricing[product.star_candy as keyof typeof samplePricing])
          .map(product => {
            const pricing = samplePricing[product.star_candy as keyof typeof samplePricing];
            return {
              ...product,
              web_price_krw: pricing.krw,
              web_price_usd: pricing.usd,
              web_bonus_amount: pricing.bonus,
              web_display_order: Object.keys(samplePricing).indexOf(String(product.star_candy)) + 1,
              web_is_featured: product.star_candy === 1000 || product.star_candy === 5000,
              web_description: JSON.stringify({
                ko: `${product.star_candy} 별사탕 패키지`,
                en: `${product.star_candy} Star Candy Package`
              })
            };
          });

        console.log('Generated sample products:', filteredProducts);
      }

      setProducts(filteredProducts);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

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
    fetchProducts();
  };

  const handlePayPalSuccess = (orderID: string) => {
    console.log('PayPal payment successful:', orderID);
    setShowPayPalButton(false);
    setSelectedProduct(null);
    // TODO: Show success message
    alert(t('payment_success'));
    // Refresh products to update any UI changes
    fetchProducts();
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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button 
          onClick={fetchProducts}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          {t('button_retry')}
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('star_candy_no_products')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {t('star_candy_recharge_title')}
        </h1>
        <p className="text-gray-600">
          {t('star_candy_recharge_description')}
        </p>
      </div>

      <PaymentMethodSelector 
        onMethodChange={handlePaymentMethodChange}
        className="mb-8"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product, index) => (
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
              <div className="absolute top-0 right-0 bg-primary text-white px-3 py-1 text-sm font-medium rounded-bl-lg">
                {t('star_candy_featured')}
              </div>
            )}

            <div className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-3">
                  <span className="text-3xl">⭐</span>
                </div>
                
                <h3 className="text-xl font-bold mb-1">
                  {product.star_candy?.toLocaleString()} {t('star_candy_unit')}
                </h3>
                
                {product.web_bonus_amount && product.web_bonus_amount > 0 && (
                  <p className="text-sm text-green-600 font-medium">
                    +{product.web_bonus_amount.toLocaleString()} {t('star_candy_bonus')}
                  </p>
                )}
              </div>

              {product.web_description && (
                <p className="text-sm text-gray-600 mb-4 text-center">
                  {getLocalizedString(product.web_description, currentLanguage)}
                </p>
              )}

              <div className="text-center mb-4">
                <p className="text-2xl font-bold text-primary">
                  {formatPrice(getCurrentPrice(product), getCurrentCurrency())}
                </p>
              </div>

              {showPayPalButton && selectedProduct?.id === product.id && selectedPaymentMethod === 'paypal' ? (
                <PayPalPaymentButton
                  product={product}
                  onSuccess={handlePayPalSuccess}
                  onError={handlePayPalError}
                  onCancel={handlePayPalCancel}
                />
              ) : (
                <button
                  onClick={() => handlePurchase(product)}
                  className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  disabled={!user}
                >
                  {user ? t('star_candy_purchase') : t('star_candy_login_required')}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium mb-2">{t('star_candy_notice_title')}</h3>
        <ul className="text-sm text-gray-600 space-y-1">
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