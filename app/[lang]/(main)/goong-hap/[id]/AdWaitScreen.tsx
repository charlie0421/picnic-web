'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useTranslations } from '@/hooks/useTranslations';
import AdBanner from '@/components/client/ads/AdBanner';

const AD_WAIT_SECONDS = 30;

interface AdWaitScreenProps {
  id: string;
  onComplete: () => void;
}

export default function AdWaitScreen({ id, onComplete }: AdWaitScreenProps) {
  const router = useRouter();
  const { tDynamic: t } = useTranslations();
  const [seconds, setSeconds] = useState(AD_WAIT_SECONDS);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // onComplete을 ref로 저장하여 useEffect dependency 문제 방지
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const progressPercent = ((AD_WAIT_SECONDS - seconds) / AD_WAIT_SECONDS) * 100;

  // 타이머 완료 처리
  const handleComplete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;

    try {
      const supabase = createBrowserSupabaseClient();
      await supabase
        .from('goonghap_results')
        .update({ is_ads: true })
        .eq('id', id);
    } catch (e) {
      // Silent fail - ads completion update failed
    }
    onCompleteRef.current();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [handleComplete]);

  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-4xl mx-auto'>
          {/* 헤더 영역 - 다른 페이지와 동일 */}
          <div className='mb-8'>
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

          <div className='max-w-md mx-auto space-y-6'>
            {/* 광고 영역 1 (상단) */}
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden p-4'>
              <AdBanner format='rectangle' className='min-h-[250px]' />
            </div>

            {/* 진행률 카드 + 안내 메시지 */}
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
              <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-lg'>✨</span>
                  <h2 className='text-white font-bold'>{t('goongHap.waitingForResult', '결과를 불러오는 중입니다')}</h2>
                </div>
              </div>
              <div className='p-5 space-y-4'>
                <div>
                  <div className='flex justify-between items-center mb-3'>
                    <span className='text-gray-600'>{t('goongHap.progress', '진행률')}</span>
                    <span className='font-bold text-lg text-purple-600'>{seconds}{t('goongHap.seconds', '초')}</span>
                  </div>
                  <div className='w-full h-4 bg-purple-100 rounded-full overflow-hidden'>
                    <div
                      className='h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000 ease-linear'
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className='pt-3 border-t border-gray-200 text-center space-y-1'>
                  <p className='text-sm text-gray-600'>
                    {t('goongHap.waitingMessage', '잠시만 기다려 주세요. 궁합 결과를 분석하고 있습니다.')}
                  </p>
                  <p className='text-xs text-amber-600'>
                    {t('goongHap.warningExit', '페이지를 벗어나면 분석이 중단될 수 있습니다.')}
                  </p>
                </div>
              </div>
            </div>

            {/* 광고 영역 2 (하단) */}
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden p-4'>
              <AdBanner format='rectangle' className='min-h-[250px]' />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
