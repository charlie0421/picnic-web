'use client';
import { useLanguageStore } from '@/stores/languageStore';
import { useAuth } from '@/lib/supabase/auth-provider';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';
import useSWR from 'swr';

interface VoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  voteId: number;
  voteItemId: number;
  artistName: string;
  onVoteSuccess?: (amount: number) => void;
}

interface UserBalance {
  starCandy: number;
  starCandyBonus: number;
  totalAvailable: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const VoteDialog: React.FC<VoteDialogProps> = ({
  isOpen,
  onClose,
  voteId,
  voteItemId,
  artistName,
  onVoteSuccess,
}) => {
  const [voteAmount, setVoteAmount] = useState(1);
  const [useAllVotes, setUseAllVotes] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { t, currentLanguage } = useLanguageStore();
  const { user, isAuthenticated } = useAuth();

  // SWR을 사용하여 사용자 프로필(잔액) 정보 가져오기
  const { 
    data: profileData, 
    error: balanceError, 
    isLoading: isLoadingBalance,
    mutate: mutateProfile 
  } = useSWR(isOpen && user ? `/api/user/profile?userId=${user.id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const userBalance: UserBalance | null = profileData?.success ? {
    starCandy: profileData.user.star_candy || 0,
    starCandyBonus: profileData.user.star_candy_bonus || 0,
    totalAvailable: profileData.user.total_candy || 0,
  } : null;
  
  // 전체 사용 체크박스 핸들러
  const handleUseAllChange = useCallback((checked: boolean) => {
    setUseAllVotes(checked);
    if (checked && userBalance) {
      setVoteAmount(userBalance.totalAvailable);
    } else {
      setVoteAmount(1);
    }
  }, [userBalance]);

  // 투표 수량 변경 핸들러
  const handleAmountChange = useCallback((amount: number) => {
    if (!userBalance) return;
    
    const maxAmount = userBalance.totalAvailable;
    const newAmount = Math.max(1, Math.min(amount, maxAmount));
    setVoteAmount(newAmount);
    
    setUseAllVotes(newAmount === maxAmount);
  }, [userBalance]);

  // 입력 필드 변경 핸들러  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (value === '' || value === '0') {
      setVoteAmount(1);
      setUseAllVotes(false);
      return;
    }
    
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      handleAmountChange(numValue);
    }
  }, [handleAmountChange]);

  // 투표 실행
  const handleVoteSubmit = useCallback(async () => {
    if (!user || !userBalance) return;

    setIsVoting(true);
    setVoteError(null);

    try {
      const voteData = {
        vote_id: voteId,
        vote_item_id: voteItemId,
        amount: voteAmount,
      };

      const response = await fetch('/api/vote/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
      });

      const result = await response.json();

        if (!response.ok) {
        throw new Error(result.error || t('vote_popup_vote_failed'));
      }

      console.log('✅ [VotePopup] 투표 제출 성공:', result);
      
      // 잔액 정보 갱신
      mutateProfile();

      setShowSuccess(true);
      onVoteSuccess?.(voteAmount);
      
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Vote submission error:', error);
      setVoteError(error instanceof Error ? error.message : t('vote_popup_vote_failed'));
    } finally {
      setIsVoting(false);
    }
  }, [user, userBalance, voteAmount, voteId, voteItemId, onVoteSuccess, onClose, t, mutateProfile]);

  // 로케일 매핑
  const getLocale = useCallback(() => {
    const localeMap: Record<string, string> = {
      ko: 'ko-KR',
      en: 'en-US', 
      ja: 'ja-JP',
      zh: 'zh-CN',
      id: 'id-ID',
    };
    return localeMap[currentLanguage] || 'en-US';
  }, [currentLanguage]);

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
          <AnimatePresence>
            {isVoting && (
              <motion.div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center text-white">
                  <motion.div
                    className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Image
                      src="/images/logo.png"
                      alt="Vote Loading"
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
                      priority
                    />
                  </motion.div>
                  <motion.h3 
                    className="text-xl font-bold"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {t('vote_popup_voting')}
                  </motion.h3>
                  <motion.p 
                    className="text-sm text-white/80 mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {t('vote_popup_please_wait')}
                  </motion.p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 성공 애니메이션 오버레이 */}
          <AnimatePresence>
            {showSuccess && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-primary to-secondary bg-opacity-90 flex items-center justify-center z-10"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <div className="text-center text-white">
                  <motion.div
                    className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.6 }}
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </motion.div>
                  <h3 className="text-xl font-bold">{t('vote_popup_vote_success')}</h3>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
            {isLoadingBalance ? (
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
            ) : balanceError ? (
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
            ) : userBalance ? (
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
            ) : (
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
            )}

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
                    src="/images/logo.png"
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
                    src="/images/logo.png"
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
