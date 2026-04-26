'use client';

import React from 'react';

interface DuplicateDialogProps {
  show: boolean;
  onClose: () => void;
  duplicateResult: { id: string; score: number | null; created_at: string; details?: any; tips?: any; goonghap_results_i18n?: any[] };
  submitting: boolean;
  onConfirm: () => void;
  t: (key: string, fallback?: string) => string;
}

export default function DuplicateDialog({
  show,
  onClose,
  duplicateResult,
  submitting,
  onConfirm,
  t,
}: DuplicateDialogProps) {
  if (!show) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      onClick={onClose}
    >
      <div
        className='bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4'>
          <h3 className='text-white text-lg font-bold text-center'>
            {t('goonghap_duplicate_data_title', '이미 존재하는 궁합 데이터')}
          </h3>
        </div>

        {/* Body */}
        <div className='px-6 py-5 space-y-4'>
          <div className='text-center'>
            <span className='text-4xl'>💫</span>
          </div>
          <p className='text-gray-700 text-center'>
            {t('goonghap_duplicate_data_message', '동일한 조건의 궁합 데이터가 이미 존재합니다.')}
          </p>

          {/* Existing result info */}
          {duplicateResult.score !== null && (
            <div className='flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg'>
              <span className='text-gray-600 text-sm'>{t('goonghap_score', '궁합 점수')}</span>
              <span className='text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                {duplicateResult.score}
              </span>
              <span className='text-gray-500 text-sm'>pt</span>
            </div>
          )}

          <p className='text-xs text-gray-500 text-center'>
            {new Date(duplicateResult.created_at).toLocaleDateString()}
          </p>

          <p className='text-sm text-gray-600 text-center font-medium'>
            {t('goonghap_new_ask', '새로 분석하시겠습니까?')}
          </p>
        </div>

        {/* Buttons */}
        <div className='px-6 pb-5 flex gap-3'>
          <button
            type='button'
            onClick={onClose}
            className='flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors'
          >
            {t('button_cancel', '취소')}
          </button>
          <button
            type='button'
            disabled={submitting}
            onClick={onConfirm}
            className='flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50'
          >
            {submitting ? t('common_processing', '처리 중...') : t('goonghap_analyze_start', '분석 시작')}
          </button>
        </div>
      </div>
    </div>
  );
}
