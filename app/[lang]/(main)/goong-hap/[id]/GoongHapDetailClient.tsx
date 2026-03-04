'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AdBanner from '@/components/client/ads/AdBanner';
import AdWaitScreen from './AdWaitScreen';
import { STAR_CANDY_COST, FullPageSkeleton } from './goong-hap-detail-utils';
import { useGoongHapDetail } from './useGoongHapDetail';
import { PurchaseDialog } from './PurchaseDialog';
import { GoongHapHeader } from './GoongHapHeader';

interface GoongHapDetailClientProps {
  initialData: any;
  id: string;
  lang: string;
}

export default function GoongHapDetailClient({ initialData, id, lang: langParam }: GoongHapDetailClientProps) {
  const router = useRouter();
  const { getLocalizedPath } = useLocaleRouter();
  const { userProfile } = useAuth();

  const {
    data,
    loading,
    error,
    mounted,
    localized,
    artistName,
    artistImageUrl,
    countdown,
    processing,
    invokeStatus,
    isPaid,
    i18nLoading,
    isLangMismatch,
    showAdScreen,
    refreshDetail,
    handleAdComplete,
    t,
  } = useGoongHapDetail({ id, initialData, langParam });

  // 별사탕 결제 상태
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [userStarCandy, setUserStarCandy] = useState<number | null>(null);
  const lastPurchaseTime = useRef<number>(0);

  // 별사탕 잔액 조회
  const fetchUserStarCandy = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();
      setUserStarCandy(profile?.star_candy ?? 0);
    } catch {
      setUserStarCandy(0);
    }
  }, []);

  // 구매 확인 다이얼로그 열기
  const handleOpenPurchaseDialog = useCallback(async () => {
    // 연타 방지 (1초)
    const now = Date.now();
    if (now - lastPurchaseTime.current < 1000) return;
    lastPurchaseTime.current = now;

    setPurchaseError(null);
    await fetchUserStarCandy();
    setShowPurchaseDialog(true);
  }, [fetchUserStarCandy]);

  // 구매 처리
  const handlePurchase = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPurchaseError(t('common.auth.login') || '로그인이 필요합니다');
        return;
      }

      // 별사탕 잔액 확인
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.star_candy ?? 0) < STAR_CANDY_COST) {
        setPurchaseError(t('fortune_lack_of_star_candy_message') || `별사탕이 부족합니다. (필요: ${STAR_CANDY_COST}개)`);
        return;
      }

      // Edge function 호출하여 결제 처리
      const { error: fnError } = await supabase.functions.invoke('open-goonghap', {
        body: { userId: user.id, goonghapId: id },
      });

      if (fnError) {
        setPurchaseError(fnError.message || '결제 처리 중 오류가 발생했습니다');
        return;
      }

      // 성공 - 다이얼로그 닫고 데이터 새로고침
      setShowPurchaseDialog(false);
      await refreshDetail();
      await fetchUserStarCandy();
    } catch (e: any) {
      setPurchaseError(e?.message || '결제 처리 중 오류가 발생했습니다');
    } finally {
      setPurchasing(false);
    }
  }, [id, purchasing, t, fetchUserStarCandy, refreshDetail]);

  // 클라이언트 마운트 전까지는 로딩 표시 (hydration mismatch 방지)
  // 캐시 데이터가 있으면 isInitialized를 기다리지 않음
  if (!mounted) {
    return <FullPageSkeleton />;
  }

  // 데이터 로딩 중일 때 전체 스켈레톤 표시 (캐시가 없는 경우만)
  if (loading && !data) {
    return <FullPageSkeleton />;
  }

  // i18n 로딩 중이거나 현재 언어 번역이 없을 때 스켈레톤 표시 (언어 전환 시 이전 언어가 보이는 것 방지)
  if (i18nLoading || isLangMismatch) {
    return <FullPageSkeleton />;
  }

  // 30초 광고 대기 화면
  if (showAdScreen) {
    return <AdWaitScreen id={id} onComplete={handleAdComplete} />;
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-4xl mx-auto'>
          {/* 헤더 영역 */}
          <div className='mb-8'>
            {/* 뒤로 가기 버튼 + 제목 */}
            <div className='flex items-center gap-4 mb-4'>
              <button
                type='button'
                onClick={() => router.back()}
                className='inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-600 transition-colors'
                aria-label={t('common.back') || '뒤로가기'}
              >
                <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                </svg>
              </button>
              <h1 className='text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                궁합
              </h1>
              <div className='flex flex-col'>
                <span className='text-xl font-bold text-gray-600'>宮合</span>
                <span className='text-sm text-gray-400'>Goong-Hap</span>
              </div>
            </div>
          </div>

          {error && (
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-red-200 p-6 shadow-lg text-red-700'>
              {t('goonghap_snackbar_error') || '오류가 발생했습니다.'}
            </div>
          )}
          {!error && data?.status === 'pending' && (
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-200 p-6 shadow-lg text-amber-800 mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <span className='font-medium'>{t('goongHap.waitingMessage', '처리 중입니다. 잠시만 기다려 주세요...')}</span>
                <span className='font-bold text-lg'>{countdown}{t('goongHap.seconds', '초')}</span>
              </div>
              <div className='w-full h-4 bg-amber-100 rounded-full overflow-hidden'>
                <div
                  className='h-4 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000 ease-linear'
                  style={{ width: `${(countdown / 30) * 100}%` }}
                />
              </div>
            </div>
          )}
          {!error && data?.status === 'pending' && invokeStatus && (
            <div className={`rounded-2xl bg-white/80 backdrop-blur-sm p-4 mb-6 shadow-lg ${invokeStatus.ok ? 'border border-emerald-200 text-emerald-800' : 'border border-amber-200 text-amber-800'}`}>
              {invokeStatus.ok ? '처리 요청 전달 완료' : `처리 요청 중 문제가 발생했습니다: ${invokeStatus.message || ''}`}
            </div>
          )}
          {!error && data && (
            <div className='space-y-6'>
              {/* 펜시 헤더: 사용자/아티스트 아바타 + 점수 */}
              <GoongHapHeader
                data={data}
                localized={localized}
                artistName={artistName}
                artistImageUrl={artistImageUrl}
                userProfile={userProfile}
                t={t}
              />

              {/* 상세 콘텐츠 영역 - 결제 여부에 따라 표시 */}
              {!isPaid ? (
                /* 미결제 상태: 플레이스홀더 + 구매 버튼 (실제 내용은 렌더링하지 않음) */
                <div className='relative'>
                  {/* 플레이스홀더 콘텐츠 - 실제 데이터 없이 형태만 표시 */}
                  <div className='select-none pointer-events-none opacity-60'>
                    {/* 스타일 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden mb-6'>
                      <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_style_title') || '스타일'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-3/4' />
                        <div className='h-4 bg-gray-200 rounded w-2/3' />
                        <div className='h-4 bg-gray-200 rounded w-4/5' />
                      </div>
                    </div>

                    {/* 추천 활동 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden mb-6'>
                      <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_activities_title') || '추천 활동'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-1/2' />
                        <div className='h-4 bg-gray-200 rounded w-2/3' />
                        <div className='h-4 bg-gray-200 rounded w-3/5' />
                      </div>
                    </div>

                    {/* 팁 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_tips_title') || '팁'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-4/5' />
                        <div className='h-4 bg-gray-200 rounded w-3/4' />
                      </div>
                    </div>
                  </div>

                  {/* 구매 오버레이 */}
                  <div className='absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-2xl'>
                    {/* 구매 박스 */}
                    <div className='bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 px-8 py-6 flex flex-col items-center'>
                      {/* 별사탕 아이콘 + 비용 표시 */}
                      <div className='flex items-center gap-2 mb-4'>
                        <span className='text-2xl'>⭐</span>
                        <span className='text-xl font-bold text-gray-900'>{STAR_CANDY_COST}</span>
                      </div>

                      {/* 구매 버튼 */}
                      <button
                        type='button'
                        onClick={handleOpenPurchaseDialog}
                        className='px-8 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-base hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]'
                      >
                        {t('fortune_purchase_by_star_candy') || '별사탕으로 열람하기'}
                      </button>

                      <p className='mt-3 text-sm text-gray-500 text-center'>
                        {t('goongHap.purchaseHint', '상세 궁합 결과를 확인하려면 별사탕이 필요해요')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* 결제 완료 상태: 전체 콘텐츠 표시 */
                <>
                  {/* 궁합 스타일 카드 */}
                  {localized?.details?.style && (
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>💜</span>
                          <h2 className='text-white font-bold'>{t('goonghap_style_title') || '스타일'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
                        <p>{localized.details.style.idol_style}</p>
                        <p>{localized.details.style.user_style}</p>
                        <p>{localized.details.style.couple_style}</p>
                      </div>
                    </div>
                  )}

                  {/* 추천 활동 카드 */}
                  {localized?.details?.activities && (
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>🎯</span>
                          <h2 className='text-white font-bold'>{t('goonghap_activities_title') || '추천 활동'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
                        {(localized.details.activities.recommended || []).map((it: string, idx: number) => (
                          <p key={idx}>• {it}</p>
                        ))}
                        {!!localized.details.activities.description && (
                          <p className='text-gray-600 mt-2'>{localized.details.activities.description}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 팁 섹션: i18n.tips 배열이 있으면 렌더링 */}
                  {Array.isArray(localized?.tips) && (localized?.tips?.length ?? 0) > 0 && (
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>💡</span>
                          <h2 className='text-white font-bold'>{t('goonghap_tips_title') || '팁'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
                        {localized.tips.map((tip: string, idx: number) => (
                          <p key={idx}>• {tip}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 구매 확인 다이얼로그 */}
          <PurchaseDialog
            show={showPurchaseDialog}
            onClose={() => !purchasing && setShowPurchaseDialog(false)}
            onConfirm={handlePurchase}
            purchasing={purchasing}
            purchaseError={purchaseError}
            userStarCandy={userStarCandy}
            starCandyCost={STAR_CANDY_COST}
            t={t}
            getLocalizedPath={getLocalizedPath}
          />
        </div>
      </div>
    </div>
  );
}
