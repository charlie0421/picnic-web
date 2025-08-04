import React from 'react';
import NavigationLink from '@/components/client/NavigationLink';

interface ActivityMenuTranslations {
  label_mypage_activity_history: string;
  label_mypage_my_votes: string;
  label_mypage_my_posts: string;
  label_mypage_my_comments: string;
  label_mypage_my_recharge_history: string;
}

interface MyPageActivityMenuProps {
  translations: ActivityMenuTranslations;
}

export default function MyPageActivityMenu({ translations }: MyPageActivityMenuProps) {
  const t = (key: keyof ActivityMenuTranslations) => translations[key] || key;
  
  return (
    <div className='bg-gradient-to-r from-secondary-400 to-secondary-600 rounded-2xl p-1'>
      <div className='bg-white rounded-2xl p-4'>
        <div className='flex items-center mb-4'>
          <div className='w-10 h-10 bg-gradient-to-r from-secondary-400 to-secondary-600 rounded-xl flex items-center justify-center mr-3'>
            <span className='text-xl'>📊</span>
          </div>
          <h2 className='text-lg font-bold text-gray-900'>
            {t('label_mypage_activity_history')}
          </h2>
        </div>
        
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <NavigationLink href='/mypage/vote-history' className='group'>
            <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>🗳️</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                  {t('label_mypage_my_votes')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/mypage/posts' className='group'>
            <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>📝</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                  {t('label_mypage_my_posts')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/mypage/comments' className='group'>
            <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>💬</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                  {t('label_mypage_my_comments')}
                </h3>
              </div>
            </div>
          </NavigationLink>
          
          <NavigationLink href='/mypage/recharge-history' className='group'>
            <div className='bg-gradient-to-r from-secondary-50 to-secondary-100 rounded-xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-transparent hover:border-secondary-200 h-20'>
              <div className='text-center h-full flex flex-col justify-center'>
                <div className='w-8 h-8 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg flex items-center justify-center mx-auto mb-2'>
                  <span className='text-white text-sm'>💳</span>
                </div>
                <h3 className='font-semibold text-gray-900 group-hover:text-secondary-600 transition-colors text-xs'>
                  {t('label_mypage_my_recharge_history')}
                </h3>
              </div>
            </div>
          </NavigationLink>
        </div>
      </div>
    </div>
  );
}