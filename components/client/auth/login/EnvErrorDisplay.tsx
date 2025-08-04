'use client';

import { useLanguageStore } from '@/stores/languageStore';
import { useRouter } from 'next/navigation';

interface EnvErrorDisplayProps {
  error: string;
}

export function EnvErrorDisplay({ error }: EnvErrorDisplayProps) {
  const { t } = useLanguageStore();
  const router = useRouter();

  return (
    <div className='flex flex-col justify-center items-center min-h-[400px] p-8'>
      <div className='max-w-md text-center'>
        <div className='mb-6'>
          <svg
            className='w-16 h-16 mx-auto text-red-500'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z'
            />
          </svg>
        </div>
        <h3 className='text-xl font-semibold text-gray-900 mb-4'>
          {t('login_service_maintenance_title')}
        </h3>
        <p className='text-gray-600 mb-6'>{error}</p>
        <div className='space-y-3'>
          <button
            onClick={() => window.location.reload()}
            className='w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
          >
            {t('login_refresh_page')}
          </button>
          <button
            onClick={() => router.push('/')}
            className='w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors'
          >
            {t('login_home_button')}
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <div className='mt-6 p-4 bg-red-50 rounded-lg border border-red-200 text-left'>
            <h4 className='font-semibold text-red-800 mb-2'>
              {t('login_developer_info_title')}:
            </h4>
            <div className='text-sm text-red-700 space-y-1'>
              <p>
                • {t('login_env_url_label')}:{' '}
                {process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '❌ 누락'}
              </p>
              <p>
                • {t('login_env_key_label')}:{' '}
                {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '설정됨' : '❌ 누락'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
