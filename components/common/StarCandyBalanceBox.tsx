'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useLanguageStore } from '@/stores/languageStore';
import { useWalletSummary } from '@/hooks/useWalletSummary';
import { formatWalletAmount } from '@/lib/wallet/parse';
import Image from 'next/image';

const STAR_CANDY_IMAGE_URL = '/images/star-candy/star_100.png';

interface StarCandyBalanceBoxProps {
  /**
   * 별사탕 수량 (props로 전달 시 사용)
   */
  starCandy?: number;
  /**
   * 보너스 별사탕 수량 (props로 전달 시 사용)
   */
  starCandyBonus?: number;
  /**
   * 총 별사탕 수량 (props로 전달 시 사용)
   */
  totalCandy?: number;
  /**
   * 로딩 상태 (props로 전달 시 사용)
   */
  isLoading?: boolean;
  /**
   * props로 데이터를 전달하지 않으면 useAuth를 사용하여 자동으로 데이터를 가져옵니다
   */
  autoFetch?: boolean;
  /**
   * 추가 클래스명
   */
  className?: string;
  /**
   * 컴팩트 모드 (작은 크기)
   */
  compact?: boolean;
}

export default function StarCandyBalanceBox({
  starCandy: propStarCandy,
  starCandyBonus: propStarCandyBonus,
  totalCandy: propTotalCandy,
  isLoading: propIsLoading,
  autoFetch = true,
  className = '',
  compact = false,
}: StarCandyBalanceBoxProps) {
  const { t, currentLanguage } = useLanguageStore();
  const { user, userProfile, loadUserProfile } = useAuth();
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const { wallet } = useWalletSummary();

  const localeMap: Record<string, string> = {
    ko: 'ko-KR',
    en: 'en-US',
    ja: 'ja-JP',
    zh: 'zh-CN',
    id: 'id-ID',
  };
  const locale = localeMap[currentLanguage] || 'en-US';

  // 코튼캔디는 autoFetch 일 때만 표시(내부 훅이 지갑을 스스로 조회). 값이 '0'/null 이면 자연스럽게 숨는다.
  const cottonCandy = autoFetch && wallet ? wallet.cotton : null;
  const cottonExpiringAmount = autoFetch && wallet ? wallet.cotton_expiring_amount : null;

  // autoFetch가 true이고 user가 있으면 API에서 최신 데이터를 가져옵니다
  useEffect(() => {
    if (!autoFetch || !user) {
      setIsLoadingProfile(false);
      return;
    }

    if (userProfile) {
      setIsLoadingProfile(false);
      return;
    }

    let cancelled = false;
    setIsLoadingProfile(true);

    loadUserProfile(user.id)
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [autoFetch, user, userProfile, loadUserProfile]);

  // 데이터 우선순위: props > API > userProfile > 기본값
  const getStarCandyData = () => {
    if (propStarCandy !== undefined && propStarCandyBonus !== undefined && propTotalCandy !== undefined) {
      return {
        starCandy: propStarCandy,
        starCandyBonus: propStarCandyBonus,
        totalCandy: propTotalCandy,
        isLoading: propIsLoading || false,
      };
    }

    if (userProfile) {
      return {
        starCandy: userProfile.star_candy || 0,
        starCandyBonus: userProfile.star_candy_bonus || 0,
        totalCandy: (userProfile.star_candy || 0) + (userProfile.star_candy_bonus || 0),
        isLoading: false,
      };
    }

    return {
      starCandy: 0,
      starCandyBonus: 0,
      totalCandy: 0,
      isLoading: isLoadingProfile,
    };
  };

  const { starCandy, starCandyBonus, totalCandy, isLoading } = getStarCandyData();

  // 비로그인 상태에서는 컴포넌트를 표시하지 않음
  // autoFetch가 true일 때는 user가 없으면 표시하지 않음
  // autoFetch가 false일 때는 props로 데이터가 전달되더라도 user가 없으면 표시하지 않음
  if (autoFetch && !user) {
    return null;
  }
  if (!autoFetch && !user && propStarCandy === undefined) {
    return null;
  }

  if (compact) {
    return (
      <div
        className={`bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 rounded-lg shadow-md p-3 text-white ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image
              src={STAR_CANDY_IMAGE_URL}
              alt={t('label_mypage_star_candy')}
              width={48}
              height={48}
              className="animate-scale-pulse"
            />
            <div>
              <div className="text-xs opacity-90 leading-tight">{t('label_mypage_star_candy_total')}</div>
              <div className="text-base font-bold leading-tight">
                {isLoading ? '...' : totalCandy.toLocaleString('en-US')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Image
                src={STAR_CANDY_IMAGE_URL}
                alt={t('label_mypage_star_candy')}
                width={28}
                height={28}
              />
              <span className="opacity-90">{starCandy.toLocaleString('en-US')}</span>
            </div>
            {starCandyBonus > 0 && (
              <>
                <span className="opacity-50">+</span>
                <div className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded">
                  <span className="text-xs">🎁</span>
                  <span className="text-xs font-semibold">{starCandyBonus.toLocaleString('en-US')}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 rounded-xl shadow-xl p-6 text-white transform transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] ${className}`}
    >
      <div className="space-y-4">
        {/* 총 별사탕 */}
        <div className="text-center">
          <div className="text-sm opacity-90 mb-1">{t('label_mypage_star_candy_total')}</div>
          <div className="text-3xl font-bold tracking-tight">
            {isLoading ? (
              <span className="inline-block animate-pulse">...</span>
            ) : (
              totalCandy.toLocaleString('en-US')
            )}
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/20"></div>

        {/* 상세 정보 */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* 기본 별사탕 */}
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
            <Image
              src={STAR_CANDY_IMAGE_URL}
              alt={t('label_mypage_star_candy')}
              width={56}
              height={56}
              className="animate-scale-pulse"
            />
            <div>
              <div className="text-xs opacity-80">별사탕</div>
              <div className="text-lg font-semibold">
                {isLoading ? '...' : starCandy.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* 보너스 별사탕 */}
          {starCandyBonus > 0 && (
            <div className="flex items-center gap-2 bg-gradient-to-r from-point-400 to-point-500 px-4 py-2 rounded-lg shadow-md animate-scale-in">
              <span className="text-2xl">🎁</span>
              <div>
                <div className="text-xs opacity-90">보너스</div>
                <div className="text-lg font-semibold">{starCandyBonus.toLocaleString('en-US')}</div>
              </div>
            </div>
          )}
        </div>

        {/* 코튼캔디 (플래그 OFF 동안 '0' 이라 자연스럽게 미노출) */}
        {cottonCandy && cottonCandy !== '0' && (
          <>
            <div className="border-t border-white/20"></div>
            <div className="flex justify-between text-sm">
              <span className="opacity-90">{t('wallet_cotton_candy')}</span>
              <span className="font-semibold">{formatWalletAmount(cottonCandy, locale)}</span>
            </div>
            {cottonExpiringAmount && cottonExpiringAmount !== '0' && (
              <div className="text-xs opacity-80">
                {t('wallet_cotton_expires_today', { amount: formatWalletAmount(cottonExpiringAmount, locale) })}
              </div>
            )}
            <p className="text-xs opacity-70">{t('cotton_candy_daily_expiry_notice')}</p>
          </>
        )}
      </div>
    </div>
  );
}

