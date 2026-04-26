'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useVoteDialog } from './useVoteDialog';
import { VotingOverlay, SuccessOverlay } from './VoteDialogOverlays';
import { VoteBalanceDisplay } from './VoteBalanceDisplay';

interface VoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  voteId: number;
  voteItemId: number;
  artistName: string;
  onVoteSuccess?: (amount: number) => void;
}

const VoteDialog: React.FC<VoteDialogProps> = ({
  isOpen,
  onClose,
  voteId,
  voteItemId,
  artistName,
  onVoteSuccess,
}) => {
  const {
    voteAmount,
    setVoteAmount,
    useAllVotes,
    isVoting,
    voteError,
    showSuccess,
    userBalance,
    isLoadingBalance,
    balanceError,
    handleUseAllChange,
    handleAmountChange,
    handleInputChange,
    handleVoteSubmit,
    getLocale,
    mutateProfile,
    t,
  } = useVoteDialog({ isOpen, voteId, voteItemId, onVoteSuccess, onClose });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 투표 처리 중 오버레이 */}
          <VotingOverlay isVoting={isVoting} t={t} />

          {/* 성공 애니메이션 오버레이 */}
          <SuccessOverlay showSuccess={showSuccess} t={t} />

        {/* 헤더 */}
          <div className="bg-gradient-to-r from-primary to-secondary p-6 text-white">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">{artistName}</h2>
          <button
            onClick={onClose}
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
          </div>

          {/* 컨텐츠 */}
          <div className="p-6 space-y-6">
            {/* 보유 별사탕 정보 */}
            <VoteBalanceDisplay
              isLoadingBalance={isLoadingBalance}
              balanceError={balanceError}
              userBalance={userBalance}
              getLocale={getLocale}
              mutateProfile={mutateProfile}
              t={t}
            />

            {/* 투표 수량 설정 */}
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-lg font-semibold text-gray-900">{t('vote_popup_vote_amount')}</h3>

              {/* 투표 수량 입력 */}
              <div className="relative">
            <input
              type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
              min="1"
                  max={userBalance ? userBalance.totalAvailable : undefined}
                  value={voteAmount}
                  onChange={handleInputChange}
                  onBlur={() => {
                    // 포커스를 잃을 때 최소값 보장
                    if (voteAmount <= 0) {
                      setVoteAmount(1);
                    }
                  }}
                  className="w-full p-4 text-2xl font-bold text-center text-gray-900 border-2 border-primary/30 rounded-xl focus:border-primary focus:outline-none bg-white"
                  placeholder="1"
                />
                <div className="absolute inset-y-0 right-0 flex flex-col">
            <button
                    onClick={() => handleAmountChange(voteAmount + 1)}
                    disabled={!userBalance || voteAmount >= userBalance.totalAvailable}
                    className="flex-1 px-3 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-xl transition-colors"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleAmountChange(voteAmount - 1)}
                    disabled={voteAmount <= 1}
                    className="flex-1 px-3 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-br-xl transition-colors"
                  >
                    ▼
            </button>
          </div>
        </div>

              {/* 전체 사용 체크박스 */}
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAllVotes}
                  onChange={(e) => handleUseAllChange(e.target.checked)}
                  className="w-5 h-5 text-primary border-2 border-primary/30 rounded focus:ring-primary"
                />
                <span className="text-gray-900 font-medium">{t('vote_popup_use_all')}</span>
              </label>
            </motion.div>



            {/* 에러 메시지 */}
            <AnimatePresence>
              {voteError && (
                <motion.div
                  className="bg-red-50 border border-red-200 p-3 rounded-lg"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-red-700 text-sm font-medium">{voteError}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 버튼 영역 */}
          <div className="p-6 bg-gray-50 flex space-x-3">
          <button
            onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-200 text-gray-800 font-medium rounded-xl hover:bg-gray-300 transition-colors"
          >
              {t('vote_popup_previous')}
          </button>

            <motion.button
              onClick={handleVoteSubmit}
              disabled={isVoting || isLoadingBalance || !userBalance || voteAmount > userBalance.totalAvailable}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-primary to-secondary text-white font-medium rounded-xl hover:from-primary/90 hover:to-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isVoting ? (
                <span className="flex items-center justify-center space-x-2">
                  <Image
                    src="/images/logo.webp"
                    alt="Voting"
                    width={16}
                    height={16}
                    className="w-4 h-4 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
                    priority
                  />
                  <span>{t('vote_popup_voting')}</span>
                </span>
              ) : isLoadingBalance ? (
                <div className="flex items-center justify-center">
                  <Image
                    src="/images/logo.webp"
                    alt="Loading Balance"
                    width={16}
                    height={16}
                    className="w-4 h-4 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
                    priority
                  />
        </div>
              ) : (
                t('vote_popup_next')
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoteDialog;
