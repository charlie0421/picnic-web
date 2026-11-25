import { useState, useCallback } from 'react';
import { Products } from '@/types/interfaces';
import { User } from '@supabase/supabase-js';
import { PaymentMethod } from './PaymentMethodSelector';
import { getCurrencyByPaymentMethod } from '@/utils/ip-detection';
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
  // PortOne opens only the order-bound hosted checkout. The old browser verify flow is no longer reachable from here.
  const [portOneSelection, setPortOneSelection] = useState<{ userId: string; productId: string } | null>(null);
  const portOneHostedProductId = portOneSelection && portOneSelection.userId === user?.id ? portOneSelection.productId : null;

  const effectiveProcessingProductId = processingProductId ?? internalProcessingProductId ?? payPalProductId ?? portOneHostedProductId;
  const closePayPalCheckout = useCallback(() => setPayPalSelection(null), []);
  const closePortOneHostedCheckout = useCallback(() => setPortOneSelection(null), []);

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
        setPortOneSelection({ userId: user.id, productId: product.id });
      } else {
        setPayPalSelection({ userId: user.id, productId: product.id });
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(t('payment_failed'));
    } finally {
      setProcessingProductId(null);
    }
  }, [user, effectiveProcessingProductId, selectedPaymentMethod, pathname, currentLanguage, router, showLoginRequired, t, ensureActiveMembership]);

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
    portOneHostedProductId,
    closePortOneHostedCheckout,
  };
}
