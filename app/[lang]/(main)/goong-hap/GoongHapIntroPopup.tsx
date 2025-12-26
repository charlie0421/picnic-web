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

          {/* 십이지신 설명 */}
          <div className='flex items-start gap-3'>
            <div className='flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-lg'>
              🐲
            </div>
            <div className='min-w-0'>
              <h3 className='font-bold text-gray-900 text-sm'>
                {t('goongHap.zodiac.title', '십이지신과 시간')}
              </h3>
              <p className='text-gray-600 text-xs leading-relaxed mt-0.5'>
                {t('goongHap.zodiac.description', '궁합에서는 태어난 시간도 중요해요! 한국에서는 12가지 동물로 시간을 나누는 전통이 있어요.')}
              </p>
            </div>
          </div>

          {/* 12지간 동물 리스트 */}
          <div className='bg-amber-50 rounded-lg p-3'>
            <p className='text-gray-700 text-[10px] font-medium mb-2 text-center'>
              {t('goongHap.zodiac.subtitle', '태어난 시간에 따른 12가지 동물띠')}
            </p>
            <div className='grid grid-cols-2 gap-1 text-[9px] text-gray-600'>
              <span>{t('goongHap.zodiac.animals.rat', '🐭 자시 (쥐) 23:00~01:00')}</span>
              <span>{t('goongHap.zodiac.animals.ox', '🐮 축시 (소) 01:00~03:00')}</span>
              <span>{t('goongHap.zodiac.animals.tiger', '🐯 인시 (호랑이) 03:00~05:00')}</span>
              <span>{t('goongHap.zodiac.animals.rabbit', '🐰 묘시 (토끼) 05:00~07:00')}</span>
              <span>{t('goongHap.zodiac.animals.dragon', '🐲 진시 (용) 07:00~09:00')}</span>
              <span>{t('goongHap.zodiac.animals.snake', '🐍 사시 (뱀) 09:00~11:00')}</span>
              <span>{t('goongHap.zodiac.animals.horse', '🐴 오시 (말) 11:00~13:00')}</span>
              <span>{t('goongHap.zodiac.animals.sheep', '🐑 미시 (양) 13:00~15:00')}</span>
              <span>{t('goongHap.zodiac.animals.monkey', '🐒 신시 (원숭이) 15:00~17:00')}</span>
              <span>{t('goongHap.zodiac.animals.rooster', '🐔 유시 (닭) 17:00~19:00')}</span>
              <span>{t('goongHap.zodiac.animals.dog', '🐶 술시 (개) 19:00~21:00')}</span>
              <span>{t('goongHap.zodiac.animals.pig', '🐷 해시 (돼지) 21:00~23:00')}</span>
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
