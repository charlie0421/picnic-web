import React from 'react';
import { MediaListFetcher } from '@/components/server/media';

/**
 * 미디어 페이지
 * 
 * 서버 컴포넌트를 사용하여 데이터 페칭을 수행합니다.
 * loading.tsx가 로딩 UI를 담당합니다.
 */
export default function MediaPage() {
  return (
    <main className='container mx-auto px-4 py-8'>
      <MediaListFetcher className="mt-4" />
    </main>
  );
}
