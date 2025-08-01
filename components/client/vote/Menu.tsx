'use client';

import React from 'react';
import NavigationLink from '@/components/client/NavigationLink';
import { usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import CurrentTime from '@/components/client/vote/common/CurrentTime';
import menuConfig from '@/config/menu.json';

export const Menu: React.FC = () => {
  const pathname = usePathname();
  const { t, currentLanguage, isTranslationLoaded } = useLanguageStore();

  // 현재 언어의 번역 로딩 상태 확인
  const isCurrentLanguageLoaded = isTranslationLoaded[currentLanguage];

  // Vote 포털의 서브메뉴 가져오기
  const votePortal = menuConfig.portals.find(portal => portal.id === 'vote');
  const subMenus = votePortal?.subMenus || [];

  // 디버깅 로그 추가
  console.log('🔍 [Vote Menu] 렌더링:', {
    pathname,
    currentLanguage,
    isCurrentLanguageLoaded,
    votePortal: !!votePortal,
    subMenusCount: subMenus.length,
    subMenus: subMenus.map(m => ({ key: m.key, path: m.path }))
  });

  // 현재 경로가 특정 경로와 일치하는지 확인 (언어 프리픽스 제거)
  const isActive = (path: string) => {
    // 현재 pathname에서 언어 프리픽스 제거
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';
    
    console.log('🔍 [Vote Menu] isActive 체크:', {
      originalPath: pathname,
      pathWithoutLocale,
      targetPath: path,
    });
    
    if (path === '/vote') {
      // '/vote' 정확히 일치하거나 '/vote/' 로 시작하는 경우
      return pathWithoutLocale === '/vote' || pathWithoutLocale.startsWith('/vote/');
    }
    return pathWithoutLocale.startsWith(path);
  };

  // 메뉴가 없는 경우 에러 상태 표시
  if (!votePortal || subMenus.length === 0) {
    console.error('🚨 [Vote Menu] 메뉴 설정을 찾을 수 없습니다:', { votePortal, subMenus });
    return (
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center py-2'>
        <div className='text-red-500 text-sm'>메뉴 로드 실패</div>
      </div>
    );
  }

  // 번역이 로드되지 않은 경우 로딩 표시
  if (!isCurrentLanguageLoaded) {
    console.log('🔍 [Vote Menu] 번역 로딩 중...');
    return (
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center py-2'>
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
          {/* <CurrentTime /> */}
        </div>
      </div>
    );
  }

  console.log('🔍 [Vote Menu] 정상 렌더링 시작');

  return (
    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center py-2'>
      <div className='flex overflow-x-auto scrollbar-hide whitespace-nowrap w-full sm:w-auto'>
        {subMenus.map((menuItem) => {
          const translatedText = menuItem.i18nKey ? t(menuItem.i18nKey) : menuItem.name;
          console.log('🔍 [Vote Menu] 메뉴 아이템:', { 
            key: menuItem.key, 
            path: menuItem.path, 
            translatedText,
            isActive: isActive(menuItem.path)
          });
          
          return (
            <NavigationLink
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
            </NavigationLink>
          );
        })}
      </div>
      <div className='mt-1 sm:mt-0'>
        {/* <CurrentTime /> */}
      </div>
    </div>
  );
};
