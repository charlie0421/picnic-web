'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { persistLanguageSelection } from '@/utils/language-detection';

const languages = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const LanguageSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentLocale, changeLocale } = useLocaleRouter();

  // 마운트 상태 관리
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
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
      console.log(`🌐 [LanguageSelector] Changing language to: ${langCode}`);
      
      // 새로운 지속성 시스템을 사용하여 언어 설정 저장
      persistLanguageSelection(langCode as any);
      
      // useLocaleRouter의 changeLocale 함수 사용
      await changeLocale(langCode as any, true); // preservePath = true
      setIsOpen(false);
      
      console.log(`✅ [LanguageSelector] Language changed successfully to: ${langCode}`);
    } catch (error) {
      console.error('❌ [LanguageSelector] Failed to change language:', error);
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
        style={{
          padding: '8px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '170px',
          justifyContent: 'space-between',
          color: '#374151',
          position: 'relative',
          fontSize: '13px',
        }}
        aria-label={`Current language: ${currentLanguageObj?.name || 'Language'}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span>{currentLanguageObj?.name || 'Language'}</span>
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            fontSize: '12px',
          }}
        >
          ▼
        </span>
      </button>

      <div
        style={{
          visibility: isOpen ? 'visible' : 'hidden',
          opacity: isOpen ? 1 : 0,
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
        role="listbox"
        aria-label="Language options"
      >
        {languages.map((language) => {
          const isCurrentLanguage = language.code === currentLocale;
          return (
            <button
              key={language.code}
              type='button'
              onClick={() => handleLanguageChange(language.code)}
              disabled={isCurrentLanguage}
              role="option"
              aria-selected={isCurrentLanguage}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                border: 'none',
                backgroundColor: isCurrentLanguage ? '#f0f0f0' : 'white',
                color: isCurrentLanguage ? '#9ca3af' : '#374151',
                cursor: isCurrentLanguage ? 'default' : 'pointer',
                transition: 'background-color 0.2s',
                borderBottom: '1px solid #f3f4f6',
                fontWeight: isCurrentLanguage ? 'bold' : 'normal',
              }}
              onMouseEnter={(e) => {
                if (!isCurrentLanguage && mounted) {
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
              {isCurrentLanguage && (
                <span 
                  style={{ 
                    marginLeft: '8px', 
                    color: '#10b981',
                    fontSize: '12px'
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;
