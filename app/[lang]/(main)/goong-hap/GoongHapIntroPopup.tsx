'use client';

import React from 'react';
import { useTranslations } from '@/hooks/useTranslations';

interface GoongHapIntroPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoongHapIntroPopup: React.FC<GoongHapIntroPopupProps> = ({
  isOpen,
  onClose,
}) => {
  const { tDynamic: t } = useTranslations();

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      onClick={onClose}
    >
      <div
        className='bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 그라데이션 배경 */}
        <div className='relative bg-gradient-to-br from-purple-500 via-pink-500 to-rose-400 p-6 rounded-t-2xl'>
          {/* 장식용 이모지 */}
          <div className='absolute top-3 left-3 text-xl opacity-80'>✨</div>
          <div className='absolute top-4 right-4 text-lg opacity-80'>💜</div>

          {/* 메인 타이틀 */}
          <div className='text-center pt-2'>
            <h2 className='text-white text-3xl font-bold drop-shadow-md'>궁합</h2>
            <p className='text-white/90 text-base font-medium mt-1'>宮合</p>
            <p className='text-white/70 text-xs'>Goong-Hap</p>
            <p className='text-white/90 text-sm mt-3'>
              {t('goongHap.subtitle', '나와 최애의 운명적 케미는?')} 💫
            </p>
          </div>
        </div>

        {/* 컨텐츠 영역 */}
        <div className='p-5 space-y-4'>
          {/* 전통 문화 소개 */}
          <div className='flex items-start gap-3'>
            <div className='flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-lg'>
              🏯
            </div>
            <div className='min-w-0'>
              <h3 className='font-bold text-gray-900 text-sm'>
                {t('goongHap.tradition.title', '한국의 전통 문화')}
              </h3>
              <p className='text-gray-600 text-xs leading-relaxed mt-0.5'>
                {t('goongHap.tradition.description', '궁합은 수백 년 동안 이어져 온 한국의 전통 문화예요.')}
              </p>
            </div>
          </div>

          {/* K-POP 아티스트와의 궁합 */}
          <div className='flex items-start gap-3'>
            <div className='flex-shrink-0 w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-lg'>
              🎤
            </div>
            <div className='min-w-0'>
              <h3 className='font-bold text-gray-900 text-sm'>
                {t('goongHap.kpop.title', 'K-POP 아티스트와 나의 궁합')}
              </h3>
              <p className='text-gray-600 text-xs leading-relaxed mt-0.5'>
                {t('goongHap.kpop.description', '최애와의 운명적 궁합을 확인해 보세요!')} 🌟
              </p>
            </div>
          </div>

          {/* 재미 포인트 */}
          <div className='flex items-start gap-3'>
            <div className='flex-shrink-0 w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-lg'>
              💕
            </div>
            <div className='min-w-0'>
              <h3 className='font-bold text-gray-900 text-sm'>
                {t('goongHap.fun.title', '덕질의 새로운 재미')}
              </h3>
              <p className='text-gray-600 text-xs leading-relaxed mt-0.5'>
                {t('goongHap.fun.description', '친구들과 궁합 점수를 비교해 보세요!')} 😆
              </p>
            </div>
          </div>

          {/* 참고 안내 */}
          <div className='bg-gray-50 rounded-lg p-3'>
            <p className='text-gray-500 text-[11px] text-center leading-relaxed'>
              🔮 {t('goongHap.notice', '궁합 결과는 재미로 즐겨주세요!')} ✨
            </p>
          </div>
        </div>

        {/* 버튼 영역 */}
        <div className='p-4 pt-0'>
          <button
            className='w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-sm hover:from-purple-600 hover:to-pink-600 transition-all shadow-md active:scale-[0.98]'
            onClick={onClose}
          >
            {t('goongHap.closeButton', '닫기')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoongHapIntroPopup;
