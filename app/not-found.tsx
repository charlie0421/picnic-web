'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { languages, translations, type Language } from './not-found-data';
import GlobalNotFoundDecorations from './GlobalNotFoundDecorations';

/**
 * 글로벌 Not Found 페이지
 *
 * Next.js가 요구하는 글로벌 not-found 페이지입니다.
 * URL에서 직접 언어를 감지하고 언어 선택기를 제공합니다.
 */

export default function GlobalNotFound() {
  const router = useRouter();
  const [currentPath, setCurrentPath] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState('ko');
  const [isClient, setIsClient] = useState(false);

  // 클라이언트 사이드에서만 실행
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      setCurrentPath(pathname);

      // URL에서 언어 추출 (예: /ja/vote2 → ja, /zh-cn/vote → zh-cn)
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

      // 지원하는 언어인지 확인
      if (languages[detectedLang]) {
        setCurrentLanguage(detectedLang);
      } else {
        setCurrentLanguage('ko');
      }
    }
  }, []);

  console.log('🔍 [GlobalNotFound] 404 페이지 로드됨:', {
    currentLanguage,
    pathname: currentPath,
    isClient
  });

  // zh로 시작하는 경우 zh-cn으로 기본값 설정
  const normalizedLang = currentLanguage === 'zh' ? 'zh-cn' : currentLanguage;
  const t = translations[normalizedLang as keyof typeof translations] || translations.ko;

  const handleGoHome = () => {
    const langPath = normalizedLang;
    console.log('🚀 [GlobalNotFound] 홈으로 리다이렉트:', `/${langPath}`);
    router.push(`/${langPath}`);
  };

  const handleGoBack = () => {
    if (typeof window !== 'undefined') {
      console.log('⬅️ [GlobalNotFound] 뒤로 가기');
      window.history.back();
    }
  };

  const handleLanguageChange = (newLang: string) => {
    console.log('🌐 [GlobalNotFound] 언어 변경:', { from: currentLanguage, to: newLang });
    setCurrentLanguage(newLang);
    // 404 페이지에서는 홈으로 이동하지 않고 언어만 변경
  };

  // 클라이언트 렌더링 전에는 기본 언어(ko)로 표시
  if (!isClient) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#ffffff',
          color: '#333333',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '8rem',
            fontWeight: '900',
            background: 'linear-gradient(45deg, #ff006e, #ff7b00, #ffb700, #8ac926, #0077b6, #7209b7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '1rem'
          }}>
            404
          </div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <GlobalNotFoundDecorations>
      <div style={{
        textAlign: 'center',
        maxWidth: '600px',
        padding: '2rem',
        zIndex: 10,
        position: 'relative'
      }}>
        {/* 무지개 404 숫자 */}
        <div style={{
          fontSize: '8rem',
          fontWeight: '900',
          background: 'linear-gradient(45deg, #ff006e, #ff7b00, #ffb700, #8ac926, #0077b6, #7209b7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'pulse 2s ease-in-out infinite',
          marginBottom: '1rem',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
        }}>
          404
        </div>

        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: '700',
          marginBottom: '1rem',
          color: '#333333',
          textShadow: '1px 1px 2px rgba(255, 255, 255, 0.8)'
        }}>
          {t.title}
        </h1>

        <p style={{
          fontSize: '1.3rem',
          marginBottom: '1rem',
          color: '#666666',
          textShadow: '1px 1px 2px rgba(255, 255, 255, 0.8)'
        }}>
          {t.subtitle}
        </p>

        <p style={{
          fontSize: '1.1rem',
          marginBottom: '2.5rem',
          color: '#888888',
          lineHeight: '1.6',
          textShadow: '1px 1px 2px rgba(255, 255, 255, 0.8)'
        }}>
          {t.description}
        </p>

        {/* 간단한 언어 선택기 - 가로 버튼 스타일 */}
        <div style={{ marginBottom: '2rem' }}>
          <p style={{
            fontSize: '1rem',
            marginBottom: '1rem',
            color: '#666666',
            fontWeight: '600',
            textShadow: '1px 1px 2px rgba(255, 255, 255, 0.8)'
          }}>
            {t.languageSelect}
          </p>

          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {Object.entries(languages).map(([lang, { name, flag }]) => {
              const isSelected = lang === normalizedLang;
              return (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isSelected ? '#7c3aed' : 'rgba(243, 244, 246, 0.9)',
                    color: isSelected ? 'white' : '#374151',
                    border: isSelected ? '2px solid #7c3aed' : '2px solid rgba(229, 231, 235, 0.9)',
                    borderRadius: '20px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backdropFilter: 'blur(5px)'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(229, 231, 235, 0.9)';
                      e.currentTarget.style.borderColor = 'rgba(209, 213, 219, 0.9)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(243, 244, 246, 0.9)';
                      e.currentTarget.style.borderColor = 'rgba(229, 231, 235, 0.9)';
                    }
                  }}
                >
                  <span style={{ fontSize: '1.1em' }}>{flag}</span>
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleGoHome}
            style={{
              padding: '14px 28px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
              backdropFilter: 'blur(5px)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🏠 {t.homeButton}
          </button>

          <button
            onClick={handleGoBack}
            style={{
              padding: '14px 28px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
              backdropFilter: 'blur(5px)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#10b981';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ⬅️ {t.backButton}
          </button>
        </div>
      </div>
    </GlobalNotFoundDecorations>
  );
}
