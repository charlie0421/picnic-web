import React from 'react';
import { getLocalizedString } from '@/utils/api/strings';
import { Products } from '@/types/interfaces';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { DialogProps } from '@/components/ui/Dialog/types';
import { ShowLoginRequired } from './star-candy-utils';

// ---------------------------------------------------------------------------
// UsePaymentPollingParams interface
// ---------------------------------------------------------------------------

export interface UsePaymentPollingParams {
  products: Products[];
  user: import('@supabase/supabase-js').User | null;
  router: AppRouterInstance;
  pathname: string | null;
  currentLanguage: string;
  showDialog: ((props: Omit<DialogProps, 'isOpen' | 'onClose'>) => void) | null;
  showLoginRequired: ShowLoginRequired;
  t: (key: string) => string;
}

// ---------------------------------------------------------------------------
// sessionStorage helpers
// ---------------------------------------------------------------------------

const PAYMENT_SESSION_KEY = 'pendingPaymentId';

export function getStoredPaymentId(): string | null {
  return typeof window !== 'undefined' ? sessionStorage.getItem(PAYMENT_SESSION_KEY) : null;
}

export function setStoredPaymentId(paymentId: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(PAYMENT_SESSION_KEY, paymentId);
  }
}

export function removeStoredPaymentId(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PAYMENT_SESSION_KEY);
  }
}

// ---------------------------------------------------------------------------
// Payment verification check
// ---------------------------------------------------------------------------

export function isPaymentVerified(result: { verified?: boolean | string | number }): boolean {
  return result.verified === true || result.verified === 'true' || result.verified === 1;
}

// ---------------------------------------------------------------------------
// Success dialog / alert
// ---------------------------------------------------------------------------

export function showSuccessDialogOrAlert(
  verifyResult: {
    payment?: { productId?: string; starCandy?: number; bonusAmount?: number; amount?: number };
    balance?: { total?: number };
  },
  ctx: {
    products: Products[];
    currentLanguage: string;
    router: AppRouterInstance;
    pathname: string | null;
    showDialog: ((props: Omit<DialogProps, 'isOpen' | 'onClose'>) => void) | null;
    t: (key: string) => string;
  },
): void {
  const { products, currentLanguage, router, pathname, showDialog, t } = ctx;

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
      React.createElement('div', { className: 'space-y-4 py-2' },
        React.createElement('div', { className: 'bg-gray-50 rounded-lg p-4 space-y-2' },
          React.createElement('h4', { className: 'font-semibold text-sm text-gray-700' }, t('recharge_details')),
          React.createElement('div', { className: 'space-y-1.5 text-sm' },
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-gray-600' }, t('product_name_label'), ':'),
              React.createElement('span', { className: 'font-medium text-gray-900' }, productName),
            ),
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-gray-600' }, t('recharge_star_candy_label'), ':'),
              React.createElement('span', { className: 'font-medium text-gray-900' },
                (verifyResult.payment?.starCandy?.toLocaleString() || 0), t('unit_count'),
              ),
            ),
            verifyResult.payment?.bonusAmount && verifyResult.payment.bonusAmount > 0 &&
              React.createElement('div', { className: 'flex justify-between' },
                React.createElement('span', { className: 'text-gray-600' }, t('bonus_star_candy_label'), ':'),
                React.createElement('span', { className: 'font-medium text-green-600' },
                  '+', verifyResult.payment.bonusAmount.toLocaleString(), t('unit_count'),
                ),
              ),
            React.createElement('div', { className: 'flex justify-between pt-2 border-t border-gray-200' },
              React.createElement('span', { className: 'text-gray-600' }, t('payment_amount_label'), ':'),
              React.createElement('span', { className: 'font-semibold text-gray-900' },
                (verifyResult.payment?.amount?.toLocaleString() || 0), t('currency_krw'),
              ),
            ),
          ),
        ),
        React.createElement('div', { className: 'bg-blue-50 rounded-lg p-4 space-y-2' },
          React.createElement('h4', { className: 'font-semibold text-sm text-blue-700' }, t('recharge_result')),
          React.createElement('div', { className: 'space-y-1.5 text-sm' },
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-blue-600' }, t('total_recharge_star_candy_label'), ':'),
              React.createElement('span', { className: 'font-semibold text-blue-700' },
                ((verifyResult.payment?.starCandy || 0) + (verifyResult.payment?.bonusAmount || 0)).toLocaleString(), t('unit_count'),
              ),
            ),
            React.createElement('div', { className: 'flex justify-between pt-2 border-t border-blue-200' },
              React.createElement('span', { className: 'text-blue-600' }, t('current_balance_label'), ':'),
              React.createElement('span', { className: 'font-bold text-lg text-blue-700' },
                (verifyResult.balance?.total?.toLocaleString() || 0), t('unit_count'),
              ),
            ),
          ),
        ),
      )
    ),
    onClose: () => {
      router.replace(pathname || '/ko/star-candy');
      window.location.reload();
    },
  });
}
