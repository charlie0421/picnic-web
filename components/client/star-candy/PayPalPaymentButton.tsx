'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { useLanguageStore } from '@/stores/languageStore';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { Products } from '@/types/interfaces';
import { payPalService } from '@/lib/payment/paypal';

interface PayPalPaymentButtonProps {
  product: Products;
  onSuccess: (orderID: string) => void;
  onError: (error: any) => void;
  onCancel: () => void;
}

export function PayPalPaymentButton({ 
  product, 
  onSuccess, 
  onError,
  onCancel 
}: PayPalPaymentButtonProps) {
  const { t } = useLanguageStore();
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);

  const initialOptions = {
    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '',
    currency: 'USD',
    intent: 'capture' as const,
    enableFunding: 'paypal',
    disableFunding: 'card,credit,paylater',
  };

  useEffect(() => {
    // Initialize PayPal service
    payPalService.initialize().then((success) => {
      setIsReady(success);
    });
  }, []);

  const createOrder = async (data: any, actions: any) => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create order on server
      const orderID = await payPalService.createOrder({
        productId: product.id,
        productName: product.product_name,
        amount: product.web_price_usd || 0,
        starCandy: product.star_candy || 0,
        bonusAmount: product.web_bonus_amount || 0,
        userId: user.id,
        userEmail: user.email || '',
      });

      return orderID;
    } catch (error) {
      console.error('Error creating PayPal order:', error);
      onError(error);
      throw error;
    }
  };

  const onApprove = async (data: any, actions: any) => {
    try {
      // Capture order on server
      const result = await payPalService.captureOrder(data.orderID);
      
      if (result.success) {
        onSuccess(data.orderID);
      } else {
        throw new Error(result.error || 'Failed to capture payment');
      }
    } catch (error) {
      console.error('Error capturing PayPal order:', error);
      onError(error);
    }
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-gray-600">{t('loading_payment_options')}</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PayPalScriptProvider options={initialOptions}>
        <PayPalButtons
          style={payPalService.getButtonStyle()}
          createOrder={createOrder}
          onApprove={onApprove}
          onCancel={onCancel}
          onError={onError}
          disabled={!user}
        />
      </PayPalScriptProvider>
      
      {!user && (
        <p className="text-sm text-red-500 mt-2 text-center">
          {t('payment_login_required')}
        </p>
      )}
    </div>
  );
}