'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useLanguage } from '@/hooks/useLanguage';
import { formatWalletAmount } from '@/lib/wallet/parse';
import type { CurrencyHistoryItem, CurrencyHistoryPage } from '@/types/wallet';

type Tab = 'STAR_CANDY' | 'BONUS_STAR_CANDY' | 'COTTON_CANDY';

// 지갑 표시 순서(스타 → 보너스 → 코튼)와 동일
const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'STAR_CANDY', labelKey: 'wallet_star_candy' },
  { key: 'BONUS_STAR_CANDY', labelKey: 'wallet_bonus_star_candy' },
  { key: 'COTTON_CANDY', labelKey: 'wallet_cotton_candy' },
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
  // 코튼 잔액 0과 기능 OFF는 다르다 — 잔액을 대용으로 쓰지 않고 API 의 disabled 신호를 그대로 반영한다.
  const [isDisabled, setIsDisabled] = useState(false);

  // 탭을 빠르게 전환하면 이전 탭 요청이 나중에 도착해 현재 탭 상태(items/disabled)를 덮어쓸 수 있다.
  // 최신 요청 번호만 state 를 commit 하도록 해서 out-of-order 응답을 버린다.
  const requestSeqRef = useRef(0);

  const loadPage = useCallback(async (currency: Tab, cursor: string | null, append: boolean) => {
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setError(null);
    if (!append) setIsDisabled(false);
    try {
      const params = new URLSearchParams({ currency, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/user/wallet/history?${params.toString()}`);
      const result = await response.json();
      if (seq !== requestSeqRef.current) return; // 낡은 응답 — 무시
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'WALLET_HISTORY_LOAD_FAILED');
      }
      const page: CurrencyHistoryPage = result.page;
      setIsDisabled(!!result.disabled);
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNextCursor(page.next_cursor);
    } catch (e) {
      if (seq !== requestSeqRef.current) return; // 낡은 요청의 실패도 현재 탭에 표시하지 않는다
      setError(e instanceof Error ? e.message : 'WALLET_HISTORY_LOAD_FAILED');
    } finally {
      if (seq === requestSeqRef.current) setIsLoading(false);
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

      {!isLoading && !error && isDisabled && (
        <p className="text-gray-500 text-sm py-8 text-center">{t('wallet_cotton_read_disabled')}</p>
      )}

      {!isLoading && !error && !isDisabled && items.length === 0 && (
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
