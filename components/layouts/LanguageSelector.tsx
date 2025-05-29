'use client';

import React, {useEffect, useRef, useState} from 'react';
import {useLanguageStore} from '@/stores/languageStore';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { Language } from '@/config/settings';

const languages = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const LanguageSelector: React.FC = () => {
  const { currentLanguage, setLanguage, loadTranslations } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { pushWithLanguage, getPathnameWithoutLocale } = useLocaleRouter();

  // 마운트 상태 설정
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const currentLanguageObj = languages.find((lang) => lang.code === currentLanguage);

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
    if (!mounted || isChanging) return;
    setIsOpen(!isOpen);
  };

  const handleLanguageChange = async (lang: string) => {
    if (lang === currentLanguage || isChanging) return;

    setIsChanging(true);
    
    try {
      // 언어 스토어 업데이트
      await setLanguage(lang as Language);
      
      // 현재 경로에서 언어 프리픽스를 제거한 경로를 가져옴
      const currentPath = getPathnameWithoutLocale();
      
      // 새로운 언어로 이동
      pushWithLanguage(currentPath, lang as Language);
      
      // 선택한 언어의 번역 데이터를 미리 로드
      await loadTranslations(lang);
      
      // 드롭다운 닫기
      setIsOpen(false);
      
      // 사용자 선호도를 localStorage에 저장 (persist 미들웨어와 별도로)
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferredLanguage', lang);
      }
      
    } catch (error) {
      console.error('언어 변경 중 오류 발생:', error);
    } finally {
      setIsChanging(false);
    }
  };

  // 서버 사이드에서는 빈 div를 렌더링
  if (!mounted) {
    return (
      <div
        style={{
          width: '170px',
          height: '36px',
        }}
      />
    );
  }

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '170px',
      }}
    >
      <button
        type='button'
        onClick={toggleDropdown}
        disabled={isChanging}
        style={{
          padding: '8px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: isChanging ? '#f9fafb' : 'white',
          cursor: isChanging ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '170px',
          justifyContent: 'space-between',
          color: isChanging ? '#9ca3af' : '#374151',
          position: 'relative',
          fontSize: '13px',
          opacity: isChanging ? 0.7 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        <span>{currentLanguageObj?.name || 'Language'}</span>
        {isChanging ? (
          <span style={{ fontSize: '12px' }}>...</span>
        ) : (
          <span
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              fontSize: '12px',
            }}
          >
            ▼
          </span>
        )}
      </button>

      <div
        style={{
          visibility: isOpen && !isChanging ? 'visible' : 'hidden',
          opacity: isOpen && !isChanging ? 1 : 0,
          position: 'fixed',
          top: dropdownRef.current
            ? dropdownRef.current.getBoundingClientRect().bottom + 4
            : 0,
          left: dropdownRef.current
            ? dropdownRef.current.getBoundingClientRect().left
            : 0,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '170px',
          maxHeight: '300px',
          overflowY: 'auto',
          transition: 'opacity 0.2s ease-in-out',
          zIndex: 9999,
          fontSize: '14px',
        }}
      >
        {languages.map((language) => {
          const isCurrentLanguage = language.code === currentLanguage;
          return (
            <button
              key={language.code}
              type='button'
              onClick={() => handleLanguageChange(language.code)}
              disabled={isCurrentLanguage || isChanging}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                border: 'none',
                backgroundColor: isCurrentLanguage ? '#f0f0f0' : 'white',
                color: isCurrentLanguage ? '#9ca3af' : '#374151',
                cursor: isCurrentLanguage || isChanging ? 'default' : 'pointer',
                transition: 'background-color 0.2s',
                borderBottom: '1px solid #f3f4f6',
                fontWeight: isCurrentLanguage ? 'bold' : 'normal',
                opacity: isChanging ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCurrentLanguage && !isChanging && mounted) {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }
              }}
              onMouseLeave={(e) => {
                if (mounted) {
                  e.currentTarget.style.backgroundColor = isCurrentLanguage
                    ? '#f0f0f0'
                    : 'white';
                }
              }}
            >
              {language.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;
