'use client';

import React, { useEffect } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/common/atoms';
import { useLanguageStore } from '@/stores/languageStore';

export function VoteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useLanguageStore();
  // 원시 오류 메시지는 사용자에게 보여주지 않고 콘솔에만 남긴다 (DES-013)
  useEffect(() => {
    console.error('[VoteErrorFallback]', error);
  }, [error]);
  return (
    <div
      role="alert"
      className="p-4 rounded-md border border-red-200 bg-red-50 text-red-700"
    >
      <p>{t('vote_error_general')}</p>
      <Button onClick={resetErrorBoundary} className="mt-2">
        {t('button_retry')}
      </Button>
    </div>
  );
} 