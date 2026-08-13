'use client';

import React, { useEffect, useState } from 'react';
import { intlLocale } from '@/lib/i18n/locale';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useLanguageStore } from '@/stores/languageStore';
import { useWalletSummary } from '@/hooks/useWalletSummary';
import { formatWalletAmount } from '@/lib/wallet/parse';
import { formatExpiryDate } from '@/lib/wallet/format-expiry';
import { CURRENCY_ICON } from '@/lib/wallet/currency-icons';
import Image from 'next/image';
import Link from 'next/link';

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
  const locale = intlLocale(currentLanguage);

  // useWalletSummary 는 autoFetch prop 과 무관하게 항상 지갑을 조회한다.
  // 값이 '0'/null 이면 자연스럽게 숨는다.
  const cottonCandy = wallet ? wallet.cotton : null;
  const cottonExpiringAmount = wallet ? wallet.cotton_expiring_amount : null;
  const cottonNextExpiresAt = wallet ? wallet.cotton_next_expires_at : null;

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

  // 데이터 우선순위: wallet.v1(문자열, 안전정수 초과 보존) > props > userProfile > 기본값.
  // props/userProfile 은 number 라 안전정수 초과분의 정밀도를 보존할 수 없어 wallet 이 없을 때의 fallback으로만 쓴다.
  const getStarCandyData = (): {
    starCandy: string;
    starCandyBonus: string;
    totalCandy: string;
    isLoading: boolean;
  } => {
    if (wallet) {
      return {
        starCandy: wallet.star,
        starCandyBonus: wallet.bonus,
        totalCandy: (BigInt(wallet.star) + BigInt(wallet.bonus)).toString(),
        isLoading: false,
      };
    }

    if (propStarCandy !== undefined && propStarCandyBonus !== undefined && propTotalCandy !== undefined) {
      return {
        starCandy: String(propStarCandy),
        starCandyBonus: String(propStarCandyBonus),
        totalCandy: String(propTotalCandy),
        isLoading: propIsLoading || false,
      };
    }

    if (userProfile) {
      return {
        starCandy: String(userProfile.star_candy || 0),
        starCandyBonus: String(userProfile.star_candy_bonus || 0),
        totalCandy: String((userProfile.star_candy || 0) + (userProfile.star_candy_bonus || 0)),
        isLoading: false,
      };
    }

    return {
      starCandy: '0',
      starCandyBonus: '0',
      totalCandy: '0',
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
    // 앱의 "별사탕 파우치" 와 동일한 3통화 카드 구조.
    // 코튼캔디는 만료가 다른 별도 통화라 스타캔디 합계에 섞지 않는다(앱도 합계를 두지 않는다).
    return (
      <div
        className={`bg-white rounded-xl shadow-md border border-primary-200 p-3 ${className}`}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">{t('wallet_pouch_title')}</h3>
          {/* 앱 "별사탕 파우치" 헤더의 소멸 예정 캔디 안내 링크와 동일 */}
          <Link
            href={`/${currentLanguage}/mypage/expiry-guide`}
            className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            {t('expiring_bonus_candy_guide')}
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-gray-50 p-2 text-center">
            <Image
              src={CURRENCY_ICON.star}
              alt=""
              width={32}
              height={32}
              className="mx-auto"
            />
            <div className="mt-1 text-[11px] text-gray-500 leading-tight">
              {t('wallet_star_candy')}
            </div>
            <div className="text-sm font-bold text-gray-900">
              {isLoading ? '...' : formatWalletAmount(starCandy, locale)}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-2 text-center">
            <Image
              src={CURRENCY_ICON.bonus}
              alt=""
              width={32}
              height={32}
              className="mx-auto"
            />
            <div className="mt-1 text-[11px] text-gray-500 leading-tight">
              {t('wallet_bonus_star_candy')}
            </div>
            <div className="text-sm font-bold text-gray-900">
              {isLoading ? '...' : formatWalletAmount(starCandyBonus, locale)}
            </div>
          </div>

          {/* 코튼캔디 — 서버 플래그 OFF 동안 '0' 이라 자연스럽게 미노출 */}
          {cottonCandy && cottonCandy !== '0' ? (
            <div className="rounded-lg bg-pink-50 p-2 text-center">
              <Image
                src={CURRENCY_ICON.cotton}
                alt=""
                width={32}
                height={32}
                className="mx-auto"
              />
              <div className="mt-1 text-[11px] text-gray-500 leading-tight">
                {t('wallet_cotton_candy')}
              </div>
              <div className="text-sm font-bold text-pink-600">
                {formatWalletAmount(cottonCandy, locale)}
              </div>
            </div>
          ) : (
            <div aria-hidden />
          )}
        </div>

        {/* 만료 안내 — 코튼캔디는 다음 KST 자정에 소멸하므로 금액만 보여주면 안 된다 */}
        {cottonCandy && cottonCandy !== '0' && (
          <div className="mt-2 rounded-lg bg-pink-50 px-2 py-1.5 text-[11px] text-pink-700 space-y-0.5">
            {cottonExpiringAmount && cottonExpiringAmount !== '0' && (
              <p>
                {t('wallet_cotton_expires_today', {
                  amount: formatWalletAmount(cottonExpiringAmount, locale),
                })}
              </p>
            )}
            {cottonNextExpiresAt && (
              <p>
                {t('wallet_cotton_next_expiry', {
                  date: formatExpiryDate(cottonNextExpiresAt, locale),
                })}
              </p>
            )}
          </div>
        )}
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
              formatWalletAmount(totalCandy, locale)
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
                {isLoading ? '...' : formatWalletAmount(starCandy, locale)}
              </div>
            </div>
          </div>

          {/* 보너스 별사탕 */}
          {starCandyBonus !== '0' && (
            <div className="flex items-center gap-2 bg-gradient-to-r from-point-400 to-point-500 px-4 py-2 rounded-lg shadow-md animate-scale-in">
              <Image src={CURRENCY_ICON.bonus} alt="" width={28} height={28} />
              <div>
                <div className="text-xs opacity-90">보너스</div>
                <div className="text-lg font-semibold">{formatWalletAmount(starCandyBonus, locale)}</div>
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

