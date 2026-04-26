'use client';

import React from 'react';
import NavigationLink from '@/components/client/NavigationLink';

interface PurchaseDialogProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  purchasing: boolean;
  purchaseError: string | null;
  userStarCandy: number | null;
  starCandyCost: number;
  t: (key: string, fallback?: string) => string;
  getLocalizedPath: (path: string) => string;
}

export function PurchaseDialog({
  show,
  onClose,
  onConfirm,
  purchasing,
  purchaseError,
  userStarCandy,
  starCandyCost,
  t,
  getLocalizedPath,
}: PurchaseDialogProps) {
  if (!show) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      onClick={() => !purchasing && onClose()}
    >
      <div
        className='bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden'
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4'>
          <h3 className='text-white text-lg font-bold text-center'>
            {t('goonghap_purchase_confirm_title') || '궁합 결과 열람'}
          </h3>
        </div>

        {/* 본문 */}
        <div className='px-6 py-5 space-y-4'>
          <p className='text-gray-700 text-center'>
            {t('goonghap_purchase_confirm_message') || '별사탕 100개를 사용하여 상세 궁합 결과를 열람하시겠습니까?'}
          </p>

          {/* 별사탕 잔액 표시 */}
          <div className='flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-lg'>
            <span className='text-gray-600 text-sm'>{t('goongHap.currentBalance', '현재 보유')}</span>
            <span className='text-xl'>⭐</span>
            <span className='text-lg font-bold text-gray-900'>{userStarCandy ?? '-'}</span>
          </div>

          {/* 차감 안내 */}
          <div className='flex items-center justify-center gap-2 text-sm'>
            <span className='text-gray-500'>{t('goongHap.willDeduct', '차감될 별사탕')}</span>
            <span className='font-bold text-pink-500'>-{starCandyCost}</span>
          </div>

          {/* 에러 메시지 */}
          {purchaseError && (
            <div className='text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg'>
              {purchaseError}
            </div>
          )}

          {/* 별사탕 부족 시 상점 이동 버튼 */}
          {userStarCandy !== null && userStarCandy < starCandyCost && (
            <NavigationLink
              href={getLocalizedPath('/star-candy')}
              className='flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-xl hover:from-amber-500 hover:to-orange-600 transition-all shadow-md'
            >
              <span>⭐</span>
              <span>{t('goongHap.goToStore', '상점에서 별사탕 충전하기')}</span>
            </NavigationLink>
          )}
        </div>

        {/* 버튼 영역 */}
        <div className='px-6 pb-5 flex gap-3'>
          <button
            type='button'
            onClick={onClose}
            disabled={purchasing}
            className='flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50'
          >
            {t('cancel') || '취소'}
          </button>
          <button
            type='button'
            onClick={onConfirm}
            disabled={purchasing || (userStarCandy !== null && userStarCandy < starCandyCost)}
            className='flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {purchasing ? (
              <span className='flex items-center justify-center gap-2'>
                <span className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                {t('processing') || '처리 중...'}
              </span>
            ) : (
              t('confirm') || '확인'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
