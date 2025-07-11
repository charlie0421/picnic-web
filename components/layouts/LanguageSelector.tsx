'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

const languages = [
  { code: 'ko', name: '한국어', shortName: '한', flag: '🇰🇷' },
  { code: 'en', name: 'English', shortName: 'EN', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', shortName: '日', flag: '🇯🇵' },
  { code: 'zh', name: '中文', shortName: '中', flag: '🇨🇳' },
  { code: 'id', name: 'Bahasa Indonesia', shortName: 'ID', flag: '🇮🇩' },
];

const LanguageSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentLocale, changeLocale } = useLocaleRouter();

  // 마운트 상태 관리
  useEffect(() => {
    setMounted(true);
    
    // 모바일 감지
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      setMounted(false);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const currentLanguageObj = languages.find(
    (lang) => lang.code === currentLocale,
  );

  useEffect(() => {
    if (!mounted) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mounted]);

  const toggleDropdown = () => {
    if (!mounted) return;
    setIsOpen(!isOpen);
  };

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === currentLocale) return;

    try {
      // useLocaleRouter의 changeLocale 함수 사용
      await changeLocale(langCode as any, true); // preservePath = true
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  // 서버 사이드에서는 빈 div를 렌더링
  if (!mounted) {
    return (
      <div className="w-10 h-8 sm:w-[170px] sm:h-10" />
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative inline-block w-10 sm:w-[170px]"
    >
      <button
        type='button'
        onClick={toggleDropdown}
        className="flex items-center justify-center sm:justify-between w-full h-8 sm:h-10 px-2 sm:px-3 border border-gray-300 rounded-lg bg-white cursor-pointer text-gray-700 text-xs sm:text-sm hover:bg-gray-50 transition-colors"
      >
        {/* 모바일: 플래그만 표시 */}
        <span className="block sm:hidden text-base">
          {currentLanguageObj?.flag || '🌐'}
        </span>
        
        {/* 데스크톱: 전체 이름 표시 */}
        <span className="hidden sm:block">
          {currentLanguageObj?.name || 'Language'}
        </span>
        
        {/* 화살표 (데스크톱에서만) */}
        <span
          className="hidden sm:block text-xs transition-transform duration-200"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
          }}
        >
          ▼
        </span>
      </button>

      <div
        className={`
          fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg
          transition-all duration-200 ease-in-out
          w-10 sm:w-[170px] max-h-80 overflow-y-auto
          ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}
        `}
        style={{
          top: dropdownRef.current
            ? dropdownRef.current.getBoundingClientRect().bottom + 4
            : 0,
          left: dropdownRef.current
            ? dropdownRef.current.getBoundingClientRect().left
            : 0,
        }}
      >
        {languages.map((language) => {
          const isCurrentLanguage = language.code === currentLocale;
          return (
            <button
              key={language.code}
              type='button'
              onClick={() => handleLanguageChange(language.code)}
              disabled={isCurrentLanguage}
              className={`
                block w-full text-left border-none transition-colors
                ${isCurrentLanguage 
                  ? 'bg-gray-100 text-gray-500 cursor-default font-semibold' 
                  : 'bg-white text-gray-700 cursor-pointer hover:bg-gray-50'
                }
                ${language.code !== languages[languages.length - 1].code ? 'border-b border-gray-100' : ''}
              `}
            >
              {/* 모바일: 플래그만 */}
              <div className="block sm:hidden p-2 text-center text-base">
                {language.flag}
              </div>
              
              {/* 데스크톱: 전체 이름 */}
              <div className="hidden sm:block px-3 py-2 text-sm">
                {language.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;
