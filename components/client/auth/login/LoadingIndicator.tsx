'use client';

import { useLanguageStore } from '@/stores/languageStore';

interface LoadingIndicatorProps {
  message: string;
}

export function LoadingIndicator({ message }: LoadingIndicatorProps) {
  const { t } = useLanguageStore();
  
  return (
    <div className='flex flex-col justify-center items-center min-h-[400px]'>
      <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4'></div>
      <p className='text-gray-600'>{t(message)}</p>
    </div>
  );
}
