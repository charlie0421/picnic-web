'use client';

import React from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useLanguageStore} from '@/stores/languageStore';
import menuConfig from '@/config/menu.json';
import CurrentTime from './common/CurrentTime';

/**
 * 투표 페이지 메뉴 컴포넌트
 * 투표홈, 픽차트, 미디어, 상점 등의 메뉴 항목과 현재 시간을 표시합니다.
 */
export const Menu: React.FC = () => {
  const { t, currentLanguage, translations, isTranslationLoaded } = useLanguageStore();
  const pathname = usePathname();

  // 현재 언어의 번역이 로드되었는지 확인
  const isCurrentLanguageLoaded = isTranslationLoaded[currentLanguage] && 
    translations[currentLanguage] && 
    Object.keys(translations[currentLanguage]).length > 0;

  // 디버깅: 번역 상태 확인
  React.useEffect(() => {
    console.log('🔍 Menu Debug:', {
      currentLanguage,
      isTranslationLoaded: isTranslationLoaded[currentLanguage],
      translationsCount: Object.keys(translations[currentLanguage] || {}).length,
      hasNavVote: 'nav_vote' in (translations[currentLanguage] || {}),
      navVoteValue: translations[currentLanguage]?.['nav_vote'],
      isCurrentLanguageLoaded
    });
  }, [currentLanguage, translations, isTranslationLoaded, isCurrentLanguageLoaded]);

  // 현재 경로에 따라 메뉴 항목의 활성 상태 결정
  const isActive = (path: string) => {
    // 언어 코드를 제외한 경로 비교
    const currentPath = pathname.split('/').slice(2).join('/');
    const targetPath = path.split('/').slice(1).join('/');
    return currentPath.startsWith(targetPath);
  };

  // 투표 포탈의 서브메뉴 가져오기
  const votePortal = menuConfig.portals.find(portal => portal.type === 'vote');
  const subMenus = votePortal?.subMenus || [];

  // 번역이 로드되지 않은 경우 로딩 표시
  if (!isCurrentLanguageLoaded) {
    return (
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center py-0'>
        <div className='flex overflow-x-auto scrollbar-hide whitespace-nowrap w-full sm:w-auto'>
          {subMenus.map((menuItem) => (
            <div
              key={menuItem.key}
              className='px-5 py-2 text-sm sm:text-base text-gray-400 animate-pulse'
            >
              <div className='h-4 bg-gray-200 rounded w-16'></div>
            </div>
          ))}
        </div>
        <div className='mt-1 sm:mt-0'>
          <CurrentTime />
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center py-0'>
      <div className='flex overflow-x-auto scrollbar-hide whitespace-nowrap w-full sm:w-auto'>
        {subMenus.map((menuItem) => {
          const translatedText = menuItem.i18nKey ? t(menuItem.i18nKey) : menuItem.name;
          return (
            <Link
              key={menuItem.key}
              href={menuItem.path}
              className={`px-5 py-2 text-sm sm:text-base ${
                isActive(menuItem.path) &&
                // 투표홈은 하위 경로가 아닐 때만 활성화
                (menuItem.key !== 'vote' ||
                  (!isActive('/vote/chart') && !isActive('/rewards')))
                  ? 'font-medium text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-primary hover:border-b-2 hover:border-primary'
              }`}
            >
              {translatedText}
            </Link>
          );
        })}
      </div>
      <div className='mt-1 sm:mt-0'>
        {/* <CurrentTime /> */}
      </div>
    </div>
  );
};

export default Menu;
