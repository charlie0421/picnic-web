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
        {/* react-error-boundary 6.1 부터 error 는 unknown 이다.
            Error 가 아닌 값도 throw 될 수 있으므로 좁혀서 쓴다.
            (예전에는 any 라 비-Error 가 던져지면 undefined 가 렌더됐다) */}
        {error instanceof Error ? error.message : String(error)}
      </pre>
      <Button onClick={resetErrorBoundary} className="mt-2">
        다시 시도
      </Button>
    </div>
  );
} 