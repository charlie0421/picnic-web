'use client';
import { motion } from 'framer-motion';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';
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

        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-800 font-medium mb-1">{t('vote_popup_star_candy')}</div>
            <AnimatedCount
              value={userBalance.starCandy}
              className="text-2xl font-bold text-primary"
              suffix=""
              locale={getLocale()}
            />
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-800 font-medium mb-1">{t('vote_popup_star_candy_bonus')}</div>
            <AnimatedCount
              value={userBalance.starCandyBonus}
              className="text-2xl font-bold text-secondary-600"
              suffix=""
              locale={getLocale()}
            />
          </div>
      </div>

        <div className="mt-4 pt-3 border-t border-primary/30">
          <div className="text-center">
            <div className="text-sm text-gray-800 font-medium mb-1">{t('vote_popup_total_available')}</div>
            <motion.div
              className="text-3xl font-bold text-primary"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <AnimatedCount value={userBalance.totalAvailable} suffix="" locale={getLocale()} />
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
