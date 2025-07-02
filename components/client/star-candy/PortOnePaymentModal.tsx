'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguageStore } from '@/stores/languageStore';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { Products } from '@/types/interfaces';
import { portOneService } from '@/lib/payment/portone';
import { X } from 'lucide-react';

interface PortOnePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Products;
  onSuccess: (paymentId: string) => void;
}

export function PortOnePaymentModal({ 
  isOpen, 
  onClose, 
  product, 
  onSuccess 
}: PortOnePaymentModalProps) {
  const { t } = useLanguageStore();
  const { user } = useAuth();
  const [selectedPayMethod, setSelectedPayMethod] = useState<'CARD' | 'TRANS' | 'VBANK' | 'PHONE'>('CARD');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentMethods = portOneService.getAvailablePaymentMethods();

  const handlePayment = async () => {
    if (!user) {
      setError(t('payment_login_required'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Generate unique payment ID
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare payment request
      const paymentRequest = {
        paymentId,
        orderName: `${product.product_name} - ${product.star_candy} 별사탕`,
        totalAmount: product.web_price_krw || 0,
        currency: 'KRW' as const,
        payMethod: selectedPayMethod,
        customer: {
          fullName: user.user_metadata?.name || '사용자',
          email: user.email || '',
          phoneNumber: user.user_metadata?.phone,
        },
        productInfo: {
          id: product.id,
          name: product.product_name,
          starCandy: product.star_candy || 0,
          bonusAmount: product.web_bonus_amount || 0,
        },
      };

      // Request payment
      const response = await portOneService.requestPayment(paymentRequest);

      if (response.success && response.paymentId) {
        // Verify payment on server
        const verified = await portOneService.verifyPayment(response.paymentId);
        
        if (verified) {
          onSuccess(response.paymentId);
          onClose();
        } else {
          setError(t('payment_verification_failed'));
        }
      } else {
        setError(response.error?.message || t('payment_failed'));
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : t('payment_error_occurred'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold">{t('payment_title')}</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  disabled={isProcessing}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Product Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium mb-2">{t('payment_product_info')}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('product_name')}:</span>
                      <span className="font-medium">{product.product_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('star_candy_amount')}:</span>
                      <span className="font-medium">
                        {product.star_candy?.toLocaleString()} {t('star_candy_unit')}
                      </span>
                    </div>
                    {product.web_bonus_amount && product.web_bonus_amount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>{t('bonus_amount')}:</span>
                        <span className="font-medium">
                          +{product.web_bonus_amount.toLocaleString()} {t('star_candy_unit')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t mt-2">
                      <span className="text-gray-600">{t('total_price')}:</span>
                      <span className="font-bold text-lg">
                        {portOneService.formatPrice(product.web_price_krw || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div>
                  <h3 className="font-medium mb-3">{t('select_payment_method')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setSelectedPayMethod(method.id as any)}
                        className={`
                          p-3 rounded-lg border-2 transition-all
                          ${selectedPayMethod === method.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                        disabled={isProcessing}
                      >
                        <div className="text-2xl mb-1">{method.icon}</div>
                        <div className="text-sm font-medium">{method.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Terms */}
                <div className="text-xs text-gray-500">
                  <p>{t('payment_terms_notice')}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t space-y-3">
                <button
                  onClick={handlePayment}
                  disabled={isProcessing}
                  className={`
                    w-full py-3 rounded-lg font-medium transition-colors
                    ${isProcessing 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
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
                    t('confirm_payment')
                  )}
                </button>
                
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="w-full py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}