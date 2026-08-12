'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useLanguage } from '@/hooks/useLanguage';
import { formatWalletAmount } from '@/lib/wallet/parse';
import type { CurrencyHistoryItem, CurrencyHistoryPage } from '@/types/wallet';

type Tab = 'STAR_CANDY' | 'BONUS_STAR_CANDY' | 'COTTON_CANDY';

// 지갑 표시 순서(스타 → 보너스 → 코튼)와 동일
const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'STAR_CANDY', labelKey: 'vote_popup_star_candy' },
  { key: 'BONUS_STAR_CANDY', labelKey: 'vote_popup_star_candy_bonus' },
  { key: 'COTTON_CANDY', labelKey: 'vote_popup_cotton_candy' },
];

const localeMap: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  id: 'id-ID',
};

export default function CandyHistoryClient() {
  const { t, currentLanguage } = useLanguageStore();
  const { formatDate } = useLanguage();
  const locale = localeMap[currentLanguage] || 'en-US';

  const [tab, setTab] = useState<Tab>('STAR_CANDY');
  const [items, setItems] = useState<CurrencyHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (currency: Tab, cursor: string | null, append: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ currency, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/user/wallet/history?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'WALLET_HISTORY_LOAD_FAILED');
      }
      const page: CurrencyHistoryPage = result.page;
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNextCursor(page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WALLET_HISTORY_LOAD_FAILED');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(tab, null, false);
  }, [tab, loadPage]);

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('wallet_history_title')}</h1>

      <div className="flex space-x-2 mb-4 border-b border-gray-200">
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-red-600 text-sm mb-4">{error}</div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">{t('wallet_history_empty')}</p>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between bg-white/90 border border-gray-200 rounded-xl p-3"
          >
            <div>
              <div className="text-sm font-medium text-gray-900">{item.event_type}</div>
              <div className="text-xs text-gray-500">{formatDate(item.created_at)}</div>
              {item.expires_at && (
                <div className="text-xs text-gray-400">{formatDate(item.expires_at)}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">
                {formatWalletAmount(item.delta, locale)}
              </div>
              <div className="text-xs text-gray-500">
                {formatWalletAmount(item.balance_effect, locale)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="text-center mt-4">
          <button
            onClick={() => loadPage(tab, nextCursor, true)}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            {t('label_load_more')}
          </button>
        </div>
      )}
    </div>
  );
}
