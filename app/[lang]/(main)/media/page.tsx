import React, { Suspense } from 'react';
import { LoadingState } from '@/components/server';
import { MediaListFetcher } from '@/components/server/media';

/**
 * 미디어 페이지
 * 
 * 하이브리드 서버 컴포넌트를 사용하여 데이터 페칭을 수행합니다.
 */
export default function MediaPage() {
  return (
    <main className='container mx-auto px-4 py-8'>
      <Suspense fallback={<LoadingState message="미디어 데이터를 불러오는 중..." size="large" fullPage />}>
        <MediaListFetcher className="mt-4" />
      </Suspense>
    </main>
  );
}
