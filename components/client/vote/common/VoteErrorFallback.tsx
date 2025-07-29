'use client';

import React from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/common/atoms';

export function VoteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="p-4 rounded-md border border-red-200 bg-red-50 text-red-700"
    >
      <p>투표 정보를 불러오는데 실패했습니다.</p>
      <pre className="my-2 p-2 bg-red-100 text-xs rounded">
        {error.message}
      </pre>
      <Button onClick={resetErrorBoundary} className="mt-2">
        다시 시도
      </Button>
    </div>
  );
} 