import React from 'react';
import NavigationLink from '@/components/client/NavigationLink';

interface ServiceMenuTranslations {
  label_mypage_service_info: string;
  label_mypage_notice: string;
  label_mypage_faq: string;
  label_mypage_terms_of_use: string;
  label_mypage_privacy_policy: string;
}

interface MyPageServiceMenuProps {
  translations: ServiceMenuTranslations;
}

export default function MyPageServiceMenu({ translations }: MyPageServiceMenuProps) {
  const t = (key: keyof ServiceMenuTranslations) => translations[key] || key;

  return (
    <div className='bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-1'>
      <div className='bg-white rounded-2xl p-4'>
        <div className='flex items-center mb-4'>
          <div className='w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mr-3'>
            <span className='text-xl'>🛠️</span>
          </div>
          <h2 className='text-lg font-bold text-gray-900'>
            {t('label_mypage_service_info')}
          </h2>
        </div>
        
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <NavigationLink href='/notice' className='group'>
            <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>📢</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                  {t('label_mypage_notice')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/faq' className='group'>
            <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>❓</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                  {t('label_mypage_faq')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/terms' className='group'>
            <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>📋</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                  {t('label_mypage_terms_of_use')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/privacy' className='group'>
            <div className='bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-blue-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>🔒</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-xs'>
                  {t('label_mypage_privacy_policy')}
                </h3>
              </div>
            </div>
          </NavigationLink>
        </div>
      </div>
    </div>
  );
}