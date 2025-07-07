'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 글로벌 Not Found 페이지
 * 
 * Next.js가 요구하는 글로벌 not-found 페이지입니다.
 * URL에서 직접 언어를 감지하고 언어 선택기를 제공합니다.
 */

const languages = {
  ko: { name: '한국어', flag: '🇰🇷' },
  en: { name: 'English', flag: '🇺🇸' },
  ja: { name: '日本語', flag: '🇯🇵' },
  zh: { name: '中文', flag: '🇨🇳' },
  id: { name: 'Bahasa Indonesia', flag: '🇮🇩' }
};

const translations = {
  ko: {
    title: '페이지를 찾을 수 없습니다',
    subtitle: '요청하신 페이지가 존재하지 않습니다.',
    description: '주소를 다시 확인해주시거나 홈페이지로 돌아가주세요.',
    homeButton: '홈으로 가기',
    backButton: '뒤로 가기',
    languageSelect: '언어 선택'
  },
  en: {
    title: 'Page Not Found',
    subtitle: 'The page you requested does not exist.',
    description: 'Please check the address again or return to the homepage.',
    homeButton: 'Go Home',
    backButton: 'Go Back',
    languageSelect: 'Select Language'
  },
  ja: {
    title: 'ページが見つかりません',
    subtitle: '要求されたページは存在しません。',
    description: 'アドレスを再確認するか、ホームページに戻ってください。',
    homeButton: 'ホームに戻る',
    backButton: '戻る',
    languageSelect: '言語選択'
  },
  zh: {
    title: '找不到页面',
    subtitle: '您请求的页面不存在。',
    description: '请重新检查地址或返回首页。',
    homeButton: '返回首页',
    backButton: '返回',
    languageSelect: '选择语言'
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    subtitle: 'Halaman yang Anda minta tidak ada.',
    description: 'Silakan periksa alamat lagi atau kembali ke beranda.',
    homeButton: 'Ke Beranda',
    backButton: 'Kembali',
    languageSelect: 'Pilih Bahasa'
  }
};

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
      
      // URL에서 언어 추출 (예: /ja/vote2 → ja)
      const languageMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
      const detectedLang = languageMatch ? languageMatch[1] : 'ko';
      
      // 지원하는 언어인지 확인
      if (languages[detectedLang as keyof typeof languages]) {
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

  const t = translations[currentLanguage as keyof typeof translations] || translations.ko;

  const handleGoHome = () => {
    console.log('🚀 [GlobalNotFound] 홈으로 리다이렉트:', `/${currentLanguage}`);
    router.push(`/${currentLanguage}`);
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#ffffff',
        color: '#333333',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 반짝이는 배경 이모지들 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1
      }}>
        {['⭐', '🌟', '✨', '💫', '⭐'].map((emoji, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              fontSize: '2rem',
              animation: `sparkle 3s ease-in-out infinite ${index * 0.6}s`,
              left: `${20 + index * 15}%`,
              top: `${10 + index * 20}%`
            }}
          >
            {emoji}
          </div>
        ))}
      </div>

      {/* 떠다니는 도형들 */}
      {[...Array(6)].map((_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            width: `${30 + index * 10}px`,
            height: `${30 + index * 10}px`,
            backgroundColor: index % 2 === 0 ? '#DEB887' : '#CD853F',
            borderRadius: index % 3 === 0 ? '50%' : index % 3 === 1 ? '0%' : '20%',
            animation: `float 6s ease-in-out infinite ${index * 1.2}s`,
            left: `${10 + index * 15}%`,
            top: `${15 + index * 12}%`,
            opacity: 0.6,
            zIndex: 0
          }}
        />
      ))}

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
            {Object.entries(languages).map(([lang, { name, flag }]) => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: lang === currentLanguage ? '#7c3aed' : 'rgba(243, 244, 246, 0.9)',
                  color: lang === currentLanguage ? 'white' : '#374151',
                  border: lang === currentLanguage ? '2px solid #7c3aed' : '2px solid rgba(229, 231, 235, 0.9)',
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
                  if (lang !== currentLanguage) {
                    e.currentTarget.style.backgroundColor = 'rgba(229, 231, 235, 0.9)';
                    e.currentTarget.style.borderColor = 'rgba(209, 213, 219, 0.9)';
                  }
                }}
                onMouseOut={(e) => {
                  if (lang !== currentLanguage) {
                    e.currentTarget.style.backgroundColor = 'rgba(243, 244, 246, 0.9)';
                    e.currentTarget.style.borderColor = 'rgba(229, 231, 235, 0.9)';
                  }
                }}
              >
                <span style={{ fontSize: '1.1em' }}>{flag}</span>
                <span>{name}</span>
              </button>
            ))}
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

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        @keyframes sparkle {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
} 