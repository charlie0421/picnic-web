'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { languages, translations, type Language, type ErrorPageProps } from './error-data';
import ErrorDecorations from './ErrorDecorations';

/**
 * 500 에러 페이지
 *
 * React error boundary에 의해 호출되는 에러 페이지입니다.
 * URL에서 직접 언어를 감지하고 언어 선택기를 제공합니다.
 */

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();
  const params = useParams();
  const [currentLanguage, setCurrentLanguage] = useState<Language>('ko');
  const [isClient, setIsClient] = useState(false);

  // 클라이언트 사이드 렌더링 확인
  useEffect(() => {
    setIsClient(true);
  }, []);

  // URL에서 언어 파싱
  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      // zh-cn, zh-tw 같은 하이픈 포함 언어 코드도 처리
      const languageMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/);
      let detectedLang: Language = 'ko';

      if (languageMatch) {
        const langCode = languageMatch[1];
        // zh-cn, zh-tw 같은 코드는 그대로 사용
        if (langCode === 'zh-cn' || langCode === 'zh-tw') {
          detectedLang = langCode as Language;
        } else if (langCode === 'zh') {
          // zh만 있으면 zh-cn으로 기본값 설정
          detectedLang = 'zh-cn';
        } else {
          detectedLang = langCode as Language;
        }
      }

      if (languages[detectedLang]) {
        setCurrentLanguage(detectedLang);
      }

      console.log('🚨 [Error500] 500 페이지 로드됨:', {
        currentLanguage: detectedLang,
        pathname,
        isClient
      });
    }
  }, [isClient]);

  const t = translations[currentLanguage] || translations.ko;

  const handleLanguageChange = (newLang: Language) => {
    setCurrentLanguage(newLang);
    // 언어만 변경하고 홈으로 이동하지 않음!
  };

  const handleGoHome = () => {
    router.push(`/${currentLanguage}`);
  };

  const handleGoBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  const handleRetry = () => {
    reset(); // React error boundary reset
  };

  // 클라이언트 렌더링 전에는 기본 화면 표시
  if (!isClient) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#333',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <ErrorDecorations>
      {/* 메인 컨텐츠 */}
      <div style={{
        textAlign: 'center',
        zIndex: 10,
        color: '#333'
      }}>
        {/* 500 숫자 */}
        <div
          style={{
            fontSize: '120px',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #ff4444, #ff6666, #ff8888, #ffaaaa, #ff4444)',
            backgroundSize: '400% 400%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradientShift 3s ease-in-out infinite, pulse 2s ease-in-out infinite',
            marginBottom: '20px',
            textShadow: '4px 4px 8px rgba(0,0,0,0.3)',
            filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))'
          }}
        >
          500
        </div>

        {/* 제목 */}
        <h1 style={{
          fontSize: '32px',
          marginBottom: '16px',
          color: '#333',
          textShadow: '2px 2px 4px rgba(255,255,255,0.8)'
        }}>
          {t.title}
        </h1>

        {/* 부제목 */}
        <p style={{
          fontSize: '18px',
          marginBottom: '12px',
          color: '#666',
          textShadow: '1px 1px 2px rgba(255,255,255,0.8)'
        }}>
          {t.subtitle}
        </p>

        {/* 설명 */}
        <p style={{
          fontSize: '16px',
          marginBottom: '32px',
          color: '#888',
          textShadow: '1px 1px 2px rgba(255,255,255,0.8)'
        }}>
          {t.description}
        </p>

        {/* 에러 코드 */}
        <p style={{
          fontSize: '14px',
          marginBottom: '32px',
          color: '#999',
          fontFamily: 'monospace',
          textShadow: '1px 1px 2px rgba(255,255,255,0.8)'
        }}>
          {t.errorCode}
        </p>

        {/* 언어 선택기 */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{
            fontSize: '14px',
            marginBottom: '12px',
            color: '#666',
            textShadow: '1px 1px 2px rgba(255,255,255,0.8)'
          }}>
            {t.languageSelect}
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {Object.entries(languages).map(([code, lang]) => {
              const isCurrentLang = currentLanguage === code;
              return (
                <button
                  key={code}
                  onClick={() => handleLanguageChange(code as Language)}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '20px',
                    backgroundColor: isCurrentLang ? '#8b5cf6' : '#e5e7eb',
                    color: isCurrentLang ? 'white' : '#374151',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backdropFilter: 'blur(5px)',
                    fontWeight: isCurrentLang ? 'bold' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrentLang) {
                      e.currentTarget.style.backgroundColor = '#d1d5db'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentLang) {
                      e.currentTarget.style.backgroundColor = '#e5e7eb'
                    }
                  }}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 버튼들 */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <button
            onClick={handleRetry}
            style={{
              padding: '12px 24px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(5px)',
              boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {t.retryButton}
          </button>

          <button
            onClick={handleGoHome}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(5px)',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {t.homeButton}
          </button>

          <button
            onClick={handleGoBack}
            style={{
              padding: '12px 24px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(5px)',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#059669'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#10b981'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {t.backButton}
          </button>
        </div>
      </div>
    </ErrorDecorations>
  );
}
