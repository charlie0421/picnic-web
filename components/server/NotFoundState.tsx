'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguageStore } from '@/stores/languageStore';

interface NotFoundStateProps {
  message?: string;
  backLink?: string;
  backLabel?: string;
  title?: string;
}

/**
 * 서버 컴포넌트에서 데이터를 찾지 못했을 때 표시할 컴포넌트
 * 
 * Next.js의 notFound() 함수와 함께 사용할 수 있으며,
 * not-found.tsx 파일에서 활용할 수 있습니다.
 * 
 * @example
 * // app/[lang]/(main)/vote/[id]/not-found.tsx
 * import { NotFoundState } from '@/components/server';
 * 
 * export default function VoteNotFound() {
 *   return (
 *     <NotFoundState 
 *       title="투표를 찾을 수 없습니다"
 *       message="요청하신 투표가 존재하지 않거나 삭제되었습니다."
 *       backLink="/vote"
 *       backLabel="투표 목록으로 돌아가기"
 *     />
 *   );
 * }
 */
export default function NotFoundState({ 
  message,
  backLink = '/',
  backLabel,
  title
}: NotFoundStateProps) {
  const { t } = useLanguageStore();
  
  // 기본값을 번역된 텍스트로 설정
  const displayTitle = title || t('notFound.title');
  const displayMessage = message || t('notFound.description');
  const displayBackLabel = backLabel || t('notFound.homeButton');
  
  return (
    <div className="flex flex-col justify-center items-center min-h-[50vh] p-4">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">{displayTitle}</h1>
        <p className="text-gray-600 mb-6">{displayMessage}</p>
        <div className="flex justify-center">
          <Link 
            href={backLink}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 transition-colors"
          >
            {displayBackLabel}
          </Link>
        </div>
      </div>
    </div>
  );
} 