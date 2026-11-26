'use client';

import { isAdminProfile } from '@/lib/auth/is-admin';
import React, { useEffect, useRef, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Products } from '@/types/interfaces';
import { useAuth } from '@/lib/supabase/auth-provider';
import { motion } from 'framer-motion';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';
import Image from 'next/image';
import Link from 'next/link';
import { useLoginRequired, useDialog } from '@/components/ui/Dialog';
import { usePathname, useRouter } from 'next/navigation';
import StarCandyBalanceBox from '@/components/common/StarCandyBalanceBox';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import {
  FEATURED_PRODUCT_AMOUNTS,
  formatPrice,
  getSafeLocalizedString,
  getProductImage,
  getSortedProducts,
  buildLoginRedirect,
} from './star-candy-utils';
import { usePaymentPolling } from './usePaymentPolling';
import { usePaymentHandlers } from './usePaymentHandlers';
import { PayPalCheckout } from './PayPalCheckout';
import { PortOneTestCheckout } from './PortOneTestCheckout';
import { PortOneHostedCheckout } from './PortOneHostedCheckout';
import { isLocalPortOneDatabase } from '@/lib/payment/portone-test-local';
import { PORTONE_HOSTED_CHECKOUT_ENABLED, PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED,
  resolvePaymentMethod } from '@/lib/payment/availability';
import { isServerOrderUuid } from '@/lib/payment/server-order';
import { clearHostedResume, hostedResumeStorage, peekHostedResume, saveHostedResume } from '@/lib/payment/portone-hosted-resume';

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
  const { user, userProfile, loadUserProfile, isInitialized } = useAuth();
  const isAdmin = isAdminProfile(userProfile);
  const [portOneSelection, setPortOneSelection] = useState<{actor: string; product: string} | null>(null);
  const portOneTestAvailable = user && isAdmin && process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PORTONE_TEST_CHECKOUT_ENABLED === 'true' &&
    isLocalPortOneDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('paypal');
  const dialogContext = useDialog();
  const showLoginRequired = dialogContext.showLoginRequired;
  const showDialog = dialogContext.showDialog;
  const pathname = usePathname();
  const router = useRouter();

  const ensureActiveMembership = useWithdrawalGuard();

  const {
    pendingPaymentId,
    setPendingPaymentId,
    isVerifying,
    balanceBoxKey,
    setStoredPaymentId,
  } = usePaymentPolling({
    products,
    user,
    router,
    pathname,
    currentLanguage,
    showDialog,
    showLoginRequired,
    t,
  });

  const {
    handlePurchase,
    getCurrentPrice,
    getCurrentCurrency,
    processingProductId,
    payPalProductId,
    closePayPalCheckout,
    portOneHostedProductId,
    closePortOneHostedCheckout,
  } = usePaymentHandlers({
    user,
    selectedPaymentMethod,
    processingProductId: null,
    setPendingPaymentId,
    setStoredPaymentId,
    router,
    pathname,
    currentLanguage,
    showLoginRequired,
    t,
    ensureActiveMembership,
  });

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
  };
  // The admin gate stays for PayPal and the admin drills. Regular customers (and signed-out visitors, who then see
  // the login prompt) reach only the hosted PortOne path, and only under the explicit customer opt-in.
  // Eligibility, environment and recovery remain server and DB decisions.
  const customerPortOne = PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED && resolvePaymentMethod(selectedPaymentMethod) === 'portone';
  const purchaseEnabled = isAdmin || customerPortOne;
  const hostedCheckoutAllowed = PORTONE_HOSTED_CHECKOUT_ENABLED && (isAdmin || PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED);

  // The static PortOne return page sends only the order id back. Status is always re-read from the server.
  // The id is kept as a bounded nonsecret handle so a login on return (which keeps only the pathname) can resume it.
  const [portOneResumeOrderId, setPortOneResumeOrderId] = useState<string | null>(null);
  // The validated order of this page's own callback. It is set synchronously by the URL effect, which runs before the
  // resume effect in the same commit, so a current callback always wins over any older stored handle. Refs survive
  // StrictMode's effect replay; a real remount reads the order again from the carried URL or storage.
  const currentReturn = useRef<string | null>(null);
  // The order already handed to the dialog in this mount. Separate from the source: dismissal, rerenders, auth changes
  // and StrictMode replay never hand it over again, and never fall back to a stored handle.
  const processedReturn = useRef<string | null>(null);
  const [returnSeen, setReturnSeen] = useState(0);
  const loginPrompted = useRef(false);
  useEffect(() => {
    if (!PORTONE_HOSTED_CHECKOUT_ENABLED) return;
    // The order id is stripped even when this visitor cannot open the dialog. The server never trusts it.
    const url = new URL(window.location.href);
    const order = url.searchParams.get('portone_order');
    if (order === null) return;
    url.searchParams.delete('portone_order');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (!isServerOrderUuid(order)) return;
    const id = order.toLowerCase();
    currentReturn.current = id;
    // Replace any older handle. If the write fails, the older handle is removed where possible and is never used:
    // the ref above decides for this mount, and the login returnTo carries this id.
    const storage = hostedResumeStorage();
    clearHostedResume(storage);
    saveHostedResume(storage, id, Date.now());
    setReturnSeen(seen => seen + 1);
  }, []);
  useEffect(() => {
    if (!PORTONE_HOSTED_CHECKOUT_ENABLED || !isInitialized) return;
    const storage = hostedResumeStorage();
    // One resolved source: this page's callback when present (sticky for the whole mount, so storage is never read
    // while it exists), otherwise a handle stored by an earlier return. A processed mount does not look again.
    const order = currentReturn.current ?? (processedReturn.current ? null : peekHostedResume(storage, Date.now()));
    if (!order || processedReturn.current === order) return;
    if (!user) {
      // Ask once. Nothing about the order is shown while signed out. The internal store returnTo always carries
      // exactly this validated id, so the resume never depends on storage surviving the login.
      if (!loginPrompted.current) {
        loginPrompted.current = true;
        const base = pathname && /^\/[a-z-]{2,5}\/star-candy$/.test(pathname) ? pathname : `/${currentLanguage}/star-candy`;
        void buildLoginRedirect(`${base}?portone_order=${order}`, currentLanguage, router, showLoginRequired);
      }
      return;
    }
    // Wait for the profile and opt-in. The owner's server lookup decides; another account gets a closed result.
    if (!hostedCheckoutAllowed) return;
    processedReturn.current = order;
    // Best effort: cleanup may fail. The sticky source and the processed marker do not depend on it.
    clearHostedResume(storage);
    setPortOneResumeOrderId(order);
  }, [isInitialized, user, hostedCheckoutAllowed, returnSeen, pathname, currentLanguage, router, showLoginRequired]);
  const productName = (productId: string) => {
    const product = products.find(item => item.id.toUpperCase() === productId.toUpperCase());
    const name = product ? getSafeLocalizedString(product.product_name, currentLanguage) : '';
    return typeof name === 'string' && name.trim() ? name.trim() : null;
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
        {getSortedProducts(products).map((product, index) => {
          // 추천 상품을 600개, 10,000개 상품만으로 제한 (최대 2개)
          const isFeatured = FEATURED_PRODUCT_AMOUNTS.includes(product.star_candy as typeof FEATURED_PRODUCT_AMOUNTS[number]);
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
                    {(product.star_candy || 0).toLocaleString('en-US')} {t('star_candy_unit')}
                  </h3>

                  {product.web_bonus_amount && product.web_bonus_amount > 0 ? (
                    <p className='text-sm text-green-600 font-medium'>
                      +{product.web_bonus_amount.toLocaleString('en-US')}{' '}
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
                  disabled={isProcessing || !purchaseEnabled}
                  className={`
                    w-full py-3 font-medium rounded-lg transition-colors
                    ${isProcessing || !purchaseEnabled
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
                {portOneTestAvailable && <button type="button" className="mt-3 w-full rounded-lg border py-2"
                  onClick={() => setPortOneSelection({actor:user.id, product:product.id})}>포트원 관리자 테스트</button>}
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

      {portOneTestAvailable && portOneSelection?.actor === user.id &&
        <PortOneTestCheckout key={user.id} userId={user.id} productId={portOneSelection.product} onClose={() => setPortOneSelection(null)} />}
      {user && hostedCheckoutAllowed && (portOneHostedProductId || portOneResumeOrderId) && (
        <PortOneHostedCheckout key={user.id} userId={user.id} productId={portOneHostedProductId}
          resumeOrderId={portOneHostedProductId ? null : portOneResumeOrderId} language={currentLanguage} t={t} productName={productName}
          onClose={() => { closePortOneHostedCheckout(); setPortOneResumeOrderId(null); }} />
      )}
      {user && isAdmin && payPalProductId && (
        <PayPalCheckout key={user.id} userId={user.id} productId={payPalProductId}
          language={currentLanguage} t={t} onClose={closePayPalCheckout} />
      )}

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
