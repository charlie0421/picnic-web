'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';

interface RetryButtonProps {
  redirectPath?: string;
}

/**
 * 로그인 오류 시 재시도 버튼 컴포넌트
 * 
 * 클라이언트 이벤트 핸들링이 필요하기 때문에 클라이언트 컴포넌트로 구현
 */
export function RetryButton({ redirectPath = '/login' }: RetryButtonProps) {
  const router = useRouter();
  const { t } = useLanguageStore();

  const handleClick = () => {
    router.push(redirectPath);
  };

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
    >
      {t('return_to_login')}
    </button>
  );
} 