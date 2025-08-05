'use client';

import React from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import NavigationLink from '@/components/client/NavigationLink';

interface MyPageAccountMenuProps {
  handleLogout: () => void;
  showDebugMenus: boolean;
}

export default function MyPageAccountMenu({ handleLogout, showDebugMenus }: MyPageAccountMenuProps) {
  const { tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;

  return (
    <div className='bg-gradient-to-r from-primary-400 to-primary-600 rounded-2xl p-1'>
      <div className='bg-white rounded-2xl p-4'>
        <div className='flex items-center mb-4'>
          <div className='w-10 h-10 bg-gradient-to-r from-primary-400 to-primary-600 rounded-xl flex items-center justify-center mr-3'>
            <span className='text-xl'>👤</span>
          </div>
          <h2 className='text-lg font-bold text-gray-900'>
            {t('label_mypage_account_management')}
          </h2>
        </div>
        
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          {showDebugMenus && (
            <NavigationLink href='/mypage/edit-profile' className='group'>
              <div className='bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-primary-200 h-16'>
                <div className='flex items-center justify-center space-x-2 h-full'>
                  <div className='w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center'>
                    <span className='text-white text-sm'>✏️</span>
                  </div>
                  <div>
                    <h3 className='font-semibold text-gray-900 group-hover:text-primary-600 transition-colors text-sm'>
                      {t('label_mypage_edit_profile')}
                      <span className='ml-1 px-1 py-0.5 bg-primary-100 text-primary-600 text-xs rounded-full'>
                        {t('label_debug')}
                      </span>
                    </h3>
                  </div>
                </div>
              </div>
            </NavigationLink>
          )}
          
          <NavigationLink href='/mypage/qna' className='group'>
            <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-16'>
              <div className='flex items-center justify-center space-x-2 h-full'>
                <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center'>
                  <span className='text-white text-sm'>💬</span>
                </div>
                <div>
                  <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-sm'>
                    {t('label_mypage_qna')}
                  </h3>
                </div>
              </div>
            </div>
          </NavigationLink>

          <button onClick={handleLogout} className='group text-left'>
            <div className='bg-gradient-to-r from-point-50 to-point-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-point-200 h-16'>
              <div className='flex items-center justify-center space-x-2 h-full'>
                <div className='w-8 h-8 bg-gradient-to-r from-point-500 to-point-600 rounded-lg flex items-center justify-center'>
                  <span className='text-white text-sm'>🚪</span>
                </div>
                <div>
                  <h3 className='font-semibold text-gray-900 group-hover:text-point-600 transition-colors text-sm'>
                    {t('label_mypage_logout')}
                  </h3>
                </div>
              </div>
            </div>
          </button>

          {showDebugMenus && (
            <div className='mt-4 pt-4 border-t border-gray-200 sm:col-span-2'>
              <NavigationLink href='/mypage/withdrawal' className='group'>
                <div className='bg-gradient-to-r from-point-50 to-point-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-point-200'>
                  <div className='flex items-center justify-center space-x-2'>
                    <div className='w-8 h-8 bg-gradient-to-r from-point-500 to-point-600 rounded-lg flex items-center justify-center'>
                      <span className='text-white text-sm'>⚠️</span>
                    </div>
                    <div className='text-center'>
                      <h3 className='font-semibold text-gray-900 group-hover:text-point-600 transition-colors text-sm'>
                        {t('label_mypage_withdrawal')}
                        <span className='ml-1 px-1 py-0.5 bg-point-100 text-point-600 text-xs rounded-full'>
                          {t('label_debug')}
                        </span>
                      </h3>
                    </div>
                  </div>
                </div>
              </NavigationLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
