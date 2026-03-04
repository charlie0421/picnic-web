'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { type Language } from '@/config/settings';
import { languages, translations, isValidLanguage } from './not-found-data';
import { NotFoundDecorations } from './NotFoundDecorations';

/**
 * 언어별 라우트의 Not Found 페이지
 *
 * 모든 404 상황을 처리합니다:
 * - 언어가 포함된 경로에서 존재하지 않는 페이지: /ja/nonexistent
 * - 존재하지 않는 글로벌 경로 (미들웨어를 통해 언어별로 리다이렉션됨): /nonexistent → /ko/nonexistent
 * - 특정 섹션의 404: /ja/vote/999, /ja/media/888
 */

export default function LanguageNotFound() {
  const [mounted, setMounted] = useState(false);
  const params = useParams();
  const router = useRouter();
  const { currentLanguage, setLanguage, t } = useLanguageStore();

  // 현재 언어 감지
  const currentLang = (params?.lang as string) || currentLanguage || 'ko';

  useEffect(() => {
    setMounted(true);
    if (params?.lang && currentLanguage !== params.lang) {
      // params.lang이 유효한 Language 타입인지 확인
      if (isValidLanguage(params.lang as string)) {
        setLanguage(params.lang as Language);
      }
    }
  }, [params?.lang, currentLanguage, setLanguage]);

  if (!mounted) {
    return <div>Loading...</div>;
  }

  // zh로 시작하는 경우 zh-cn으로 기본값 설정
  const normalizedLang = currentLang === 'zh' ? 'zh-cn' : currentLang;
  const trans = translations[normalizedLang as keyof typeof translations] || translations.ko;

  const handleLanguageChange = (newLang: string) => {
    if (isValidLanguage(newLang)) {
      setLanguage(newLang);
    }
  };

  const handleGoHome = () => {
    router.push(`/${currentLang}`);
  };

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/${currentLang}`);
    }
  };

  return (
    <NotFoundDecorations>
      {/* 메인 컨텐츠 */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: '600px',
          width: '100%',
        }}
      >
        {/* 404 숫자 */}
        <div
          style={{
            fontSize: 'clamp(60px, 15vw, 150px)',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57)',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: '20px',
            textShadow: '0 4px 8px rgba(0,0,0,0.3)',
          }}
          className="bounce"
        >
          404
        </div>

        {/* 제목 */}
        <h1
          style={{
            fontSize: 'clamp(20px, 4vw, 36px)',
            fontWeight: 'bold',
            color: '#333',
            marginBottom: '16px',
            textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
          }}
        >
          {trans.title}
        </h1>

        {/* 설명 */}
        <p
          style={{
            fontSize: 'clamp(14px, 3vw, 18px)',
            color: '#666',
            marginBottom: '40px',
            lineHeight: '1.6',
            textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
          }}
        >
          {trans.description}
        </p>

        {/* 언어 선택기 */}
        <div
          style={{
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '12px',
              textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
            }}
          >
            {trans.languageSelect}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center',
            }}
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '20px',
                  backgroundColor: currentLang === lang.code ? '#8b5cf6' : '#e5e7eb',
                  color: currentLang === lang.code ? '#ffffff' : '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
                onMouseEnter={(e) => {
                  if (currentLang !== lang.code) {
                    e.currentTarget.style.backgroundColor = '#d1d5db';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentLang !== lang.code) {
                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                  }
                }}
              >
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <button
            onClick={handleGoHome}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minWidth: '150px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {trans.homeButton}
          </button>

          <button
            onClick={handleGoBack}
            style={{
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minWidth: '130px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#10b981';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {trans.backButton}
          </button>
        </div>
      </div>
    </NotFoundDecorations>
  );
}
