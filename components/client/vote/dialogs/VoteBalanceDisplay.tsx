'use client';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { formatWalletAmount } from '@/lib/wallet/parse';
import { CURRENCY_ICON } from '@/lib/wallet/currency-icons';
import type { UserBalance } from './useVoteDialog';

interface VoteBalanceDisplayProps {
  isLoadingBalance: boolean;
  balanceError: any;
  userBalance: UserBalance | null;
  getLocale: () => string;
  mutateProfile: () => void;
  t: (key: string) => string;
}

export function VoteBalanceDisplay({
  isLoadingBalance,
  balanceError,
  userBalance,
  getLocale,
  mutateProfile,
  t,
}: VoteBalanceDisplayProps) {
  if (isLoadingBalance) {
    return (
      <motion.div
        className="bg-gradient-to-r from-primary/5 to-secondary/10 p-4 rounded-xl border-2 border-primary/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('vote_popup_total_available')}</h3>

        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </motion.div>
    );
  }

  if (balanceError) {
    return (
      <motion.div
        className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-xl border-2 border-red-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('vote_popup_total_available')}</h3>

        <div className="text-center py-4">
          <div className="text-red-500 mb-2">
            <svg className="w-8 h-8 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-red-600 font-medium text-sm">{balanceError.message || '캔디 정보를 불러올 수 없습니다.'}</p>
          <button
            onClick={mutateProfile}
            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg transition-colors"
          >
            다시 시도
          </button>
        </div>
      </motion.div>
    );
  }

  if (userBalance) {
    return (
      <motion.div
        className="bg-gradient-to-r from-primary/5 to-secondary/10 p-4 rounded-xl border-2 border-primary/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('vote_popup_total_available')}</h3>

        {/* 앱 wallet_summary_panel.dart 와 동일한 3열 구성.
            코튼캔디만 아래로 내리지 않는다. */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <Image
              src={CURRENCY_ICON.star}
              alt=""
              width={32}
              height={32}
              className="mx-auto mb-1"
            />
            <div className="text-xs text-gray-800 font-medium mb-1 leading-tight">{t('wallet_star_candy')}</div>
            <div className="text-xl font-bold text-primary">
              {formatWalletAmount(userBalance.starCandy, getLocale())}
            </div>
          </div>

          <div className="text-center">
            <Image
              src={CURRENCY_ICON.bonus}
              alt=""
              width={32}
              height={32}
              className="mx-auto mb-1"
            />
            <div className="text-xs text-gray-800 font-medium mb-1 leading-tight">{t('wallet_bonus_star_candy')}</div>
            <div className="text-xl font-bold text-secondary-600">
              {formatWalletAmount(userBalance.starCandyBonus, getLocale())}
            </div>
          </div>

          {/* 코튼캔디 — 잔액 0 이어도 항상 노출한다(정책). 통화가 화면에서 사라지면
              사용자는 재화 자체가 없어진 것으로 오인한다. 앱과 동일하게 강조한다. */}
          <div className="text-center rounded-lg bg-pink-50/70 py-1">
            <Image
              src={CURRENCY_ICON.cotton}
              alt=""
              width={32}
              height={32}
              className="mx-auto mb-1"
            />
            <div className="text-xs text-gray-800 font-medium mb-1 leading-tight">{t('wallet_cotton_candy')}</div>
            <div className="text-xl font-bold text-pink-600">
              {formatWalletAmount(userBalance.cottonCandy, getLocale())}
            </div>
          </div>
        </div>

        {/* 주어 없이 "매일 자정 소멸" 만 두면 세 통화 전체에 걸리는 말로 읽힌다.
            앱(usage_policy_dialog.dart)처럼 아이콘·통화명과 함께 묶어 코튼캔디에 대한
            안내임을 분명히 한다. 새 번역 없이 기존 두 키를 조합한다. */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-2">
          <Image src={CURRENCY_ICON.cotton} alt="" width={14} height={14} />
          <span>
            {t('wallet_cotton_candy')} · {t('cotton_candy_daily_expiry_notice')}
          </span>
        </p>

        <div className="mt-4 pt-3 border-t border-primary/30">
          <div className="text-center">
            <div className="text-sm text-gray-800 font-medium mb-1">{t('vote_popup_total_available')}</div>
            <motion.div
              className="text-3xl font-bold text-primary"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {formatWalletAmount(userBalance.totalAvailable, getLocale())}
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 rounded-xl border-2 border-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('vote_popup_total_available')}</h3>

      <div className="text-center py-4">
        <p className="text-gray-500 text-sm">캔디 정보를 불러오지 못했습니다.</p>
      </div>
    </motion.div>
  );
}
