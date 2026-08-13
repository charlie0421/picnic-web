'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import Image from 'next/image';
import { useLanguageStore } from '@/stores/languageStore';
import { formatWalletAmount } from '@/lib/wallet/parse';
import { CURRENCY_ICON } from '@/lib/wallet/currency-icons';
import { bonusExpiryDateLabel, type ExpiringBonusMonth } from '@/lib/wallet/expiring-bonus';
import { fillExampleMonths } from '@/lib/wallet/expiry-example';
import { jsonFetcher } from '@/lib/wallet/json-fetcher';
import { msUntilNextKstMidnight } from '@/lib/wallet/next-kst-midnight';
import type { WalletSummary } from '@/types/wallet';

const WALLET_KEY = '/api/user/wallet';
const EXPIRING_KEY = '/api/user/wallet/expiring-bonus';

const localeMap: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  id: 'id-ID',
};

/** 재화 / 소멸 예정일 / 수량 3열 표의 한 행 */
function ExpiryRow({
  icon,
  currency,
  date,
  amount,
}: {
  icon: string;
  currency: string;
  date: string;
  amount: string;
}) {
  return (
    <div className="grid grid-cols-[1.2fr_1.3fr_0.7fr] gap-2 items-center py-2.5 border-t border-gray-100 text-sm">
      <span className="flex items-center gap-1.5 text-gray-900">
        <Image src={icon} alt="" width={20} height={20} />
        {currency}
      </span>
      <span className="text-gray-600">{date}</span>
      <span className="text-right font-semibold text-gray-900">{amount}</span>
    </div>
  );
}

export default function ExpiryGuideClient() {
  const { t, currentLanguage } = useLanguageStore();
  const locale = localeMap[currentLanguage] || 'en-US';

  // 소멸 경계를 넘기면 값이 바뀌므로 포커스 재검증을 켠다(기본 화면들과 달리 stale 이 위험하다).
  const {
    data: walletRes,
    error: walletError,
    isLoading: walletLoading,
    mutate: mutateWallet,
  } = useSWR(WALLET_KEY, jsonFetcher<{ wallet: WalletSummary }>);
  const {
    data: bonusRes,
    error: bonusError,
    isLoading: bonusLoading,
    mutate: mutateBonus,
  } = useSWR(EXPIRING_KEY, jsonFetcher<{ months: ExpiringBonusMonth[] }>);

  // 코튼캔디는 KST 자정에 소멸한다. 화면을 열어둔 채 자정을 넘기면 이미 사라진 수량과
  // "오늘밤 자정" 문구가 남으므로 경계에서 다시 불러온다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        mutateWallet();
        mutateBonus();
        arm();
      }, msUntilNextKstMidnight());
    };
    arm();
    return () => clearTimeout(timer);
  }, [mutateWallet, mutateBonus]);

  const wallet: WalletSummary | null = walletRes?.wallet ?? null;
  const months: ExpiringBonusMonth[] | null = bonusRes?.months ?? null;

  const cottonExpiring = wallet?.cotton_expiring_amount ?? '0';
  const hasCotton = cottonExpiring !== '0';
  const bonusMonths = (months ?? []).filter((m) => m.expiring_amount > 0);
  const hasAnyExpiring = hasCotton || bonusMonths.length > 0;

  // jsonFetcher 가 HTTP 오류·success:false 를 throw 하므로 error 만 보면 된다.
  const walletFailed = !!walletError;
  const bonusFailed = !!bonusError;
  const isLoading = walletLoading || bonusLoading;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">
        {t('expiring_bonus_candy_guide')}
      </h1>

      {/* 1. 내 소멸 예정 캔디 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-gray-900">{t('expiry_quantity_title')}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-3">{t('expiry_quantity_description')}</p>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-[1.2fr_1.3fr_0.7fr] gap-2 text-xs text-gray-500 pb-1">
            <span>{t('expiry_quantity_currency')}</span>
            <span>{t('expiry_quantity_date')}</span>
            <span className="text-right">{t('expiry_quantity_amount')}</span>
          </div>

          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!isLoading && walletFailed && (
            <p className="py-4 text-sm text-red-600">{t('wallet_load_failed')}</p>
          )}
          {!isLoading && bonusFailed && (
            <p className="py-4 text-sm text-red-600">
              {t('bonus_candy_expiration_policy_load_fail')}
            </p>
          )}

          {!isLoading && hasCotton && (
            <ExpiryRow
              icon={CURRENCY_ICON.cotton}
              currency={t('wallet_cotton_candy')}
              date={t('expiry_tonight_at_midnight')}
              amount={formatWalletAmount(cottonExpiring, locale)}
            />
          )}

          {!isLoading && bonusMonths.map((m) => (
            <ExpiryRow
              key={m.prediction_month}
              icon={CURRENCY_ICON.bonus}
              currency={t('wallet_bonus_star_candy')}
              date={bonusExpiryDateLabel(m.prediction_month, locale)}
              amount={m.expiring_amount.toLocaleString(locale)}
            />
          ))}

          {!isLoading && !walletFailed && !bonusFailed && !hasAnyExpiring && (
            <p className="py-6 text-center text-sm text-gray-500">
              {t('wallet_history_empty')}
            </p>
          )}
        </div>
      </section>

      {/* 2. 소멸 정책 안내 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-gray-900">{t('expiry_policy_guide')}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-3">{t('expiry_policy_description')}</p>

        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          <div className="p-4">
            <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
              <Image src={CURRENCY_ICON.cotton} alt="" width={20} height={20} />
              {t('wallet_cotton_candy')}
            </div>
            <p className="text-sm text-gray-600">{t('cotton_candy_daily_expiry_notice')}</p>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
              <Image src={CURRENCY_ICON.bonus} alt="" width={20} height={20} />
              {t('bonus_star_candy_expiration_guide')}
            </div>
            <p className="text-sm text-gray-600">{t('bonus_expiry_policy_summary')}</p>

            {/* 예시 — 적립일 → 소멸일 2쌍 */}
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                {t('bonus_candy_example_title')}
              </p>
              {[
                ['bonus_candy_example_1_earn', 'bonus_candy_example_1_expire'],
                ['bonus_candy_example_2_earn', 'bonus_candy_example_2_expire'],
              ].map(([earnKey, expireKey]) => (
                <div key={earnKey} className="grid grid-cols-2 gap-2 text-xs py-1">
                  <div>
                    <div className="text-gray-500">{t('bonus_candy_example_earn_date')}</div>
                    <div className="text-gray-900">{fillExampleMonths(t(earnKey))}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">
                      {t('bonus_candy_example_expiration_date')}
                    </div>
                    <div className="font-semibold text-gray-900">
                      {fillExampleMonths(t(expireKey))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Picnic! 캔디 정책 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {t('bonus_candy_policy_title')}
        </h2>
        <ul className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          {['bonus_candy_policy_1', 'bonus_candy_policy_2', 'bonus_candy_policy_3'].map(
            (key) => (
              <li key={key} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {/* ARB 원문에 박힌 "- " 접두사는 렌더 시점에 뗀다(앱과 동일) */}
                <span>{t(key).replace(/^\s*[-•·]\s*/, '')}</span>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
