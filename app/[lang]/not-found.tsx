'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';

/**
 * 언어별 라우트의 Not Found 페이지
 * 
 * 모든 404 상황을 처리합니다:
 * - 언어가 포함된 경로에서 존재하지 않는 페이지: /ja/nonexistent
 * - 존재하지 않는 글로벌 경로 (미들웨어를 통해 언어별로 리다이렉션됨): /nonexistent → /ko/nonexistent
 * - 특정 섹션의 404: /ja/vote/999, /ja/media/888
 */

// 언어 목록
const languages = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
];

// 번역 객체
const translations = {
  ko: {
    title: '페이지를 찾을 수 없습니다',
    subtitle: '404',
    description: '찾고 계신 페이지가 삭제되었거나 이동되었을 수 있습니다.',
    homeButton: '홈으로 돌아가기',
    backButton: '이전으로 돌아가기',
    contactButton: '문의하기',
  },
  en: {
    title: 'Page Not Found',
    subtitle: '404',
    description: 'The page you are looking for might have been removed or moved.',
    homeButton: 'Return to Home',
    backButton: 'Go Back',
    contactButton: 'Contact Us',
  },
  ja: {
    title: 'ページが見つかりません',
    subtitle: '404',
    description: 'お探しのページは削除されたか移動された可能性があります。',
    homeButton: 'ホームに戻る',
    backButton: '戻る',
    contactButton: 'お問い合わせ',
  },
  zh: {
    title: '找不到页面',
    subtitle: '404',
    description: '您要查找的页面可能已被删除或移动。',
    homeButton: '返回首页',
    backButton: '返回',
    contactButton: '联系我们',
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    subtitle: '404',
    description: 'Halaman yang Anda cari mungkin telah dihapus atau dipindahkan.',
    homeButton: 'Kembali ke Beranda',
    backButton: 'Kembali',
    contactButton: 'Hubungi Kami',
  },
};

export default function LanguageNotFound() {
  const [mounted, setMounted] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const params = useParams();
  const router = useRouter();
  const { currentLanguage, setLanguage, t } = useLanguageStore();

  // 현재 언어 감지
  const currentLang = (params?.lang as string) || currentLanguage || 'ko';
  const currentTranslations = translations[currentLang as keyof typeof translations] || translations.ko;

  useEffect(() => {
    setMounted(true);
    if (params?.lang && currentLanguage !== params.lang) {
      setLanguage(params.lang as string);
    }
  }, [params?.lang, currentLanguage, setLanguage]);

  // 언어 변경 핸들러
  const handleLanguageChange = (langCode: string) => {
    try {
      setLanguage(langCode);
      router.push(`/${langCode}`);
      setShowLanguages(false);
    } catch (error) {
      console.error('언어 변경 실패:', error);
    }
  };

  // 뒤로가기 핸들러
  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      router.push(`/${currentLang}`);
    }
  };

  if (!mounted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.5; transform: scale(1.2) rotate(180deg); }
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0; 
            transform: translateY(30px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        
        .float-element { animation: float 6s ease-in-out infinite; }
        .pulse-element { animation: pulse 2s ease-in-out infinite; }
        .bounce-element { animation: bounce 1s ease-in-out infinite; }
        .sparkle-element { animation: sparkle 3s ease-in-out infinite; }
        .slide-up { animation: slideUp 0.8s ease-out; }
        
        .floating-shape {
          position: absolute;
          border-radius: 50%;
          background: linear-gradient(45deg, 
            rgba(139, 69, 19, 0.1), 
            rgba(255, 140, 0, 0.1), 
            rgba(255, 215, 0, 0.1)
          );
          animation: float 8s ease-in-out infinite;
        }
        
        .floating-shape:nth-child(1) {
          width: 100px;
          height: 100px;
          top: 10%;
          left: 10%;
          animation-delay: 0s;
        }
        
        .floating-shape:nth-child(2) {
          width: 150px;
          height: 150px;
          top: 60%;
          right: 10%;
          animation-delay: 2s;
        }
        
        .floating-shape:nth-child(3) {
          width: 80px;
          height: 80px;
          bottom: 20%;
          left: 15%;
          animation-delay: 4s;
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* 떠다니는 도형들 - 색상 변경 */}
        <div className="floating-shape"></div>
        <div className="floating-shape"></div>
        <div className="floating-shape"></div>

        {/* 언어 선택기 */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 50
        }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowLanguages(!showLanguages)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(200, 200, 200, 0.3)',
                borderRadius: '12px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease',
                transform: showLanguages ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              {languages.find(lang => lang.code === currentLang)?.flag} {currentLang.toUpperCase()}
              <span style={{ fontSize: '12px', color: '#6B7280' }}>▼</span>
            </button>

            {showLanguages && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                marginTop: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(15px)',
                border: '1px solid rgba(200, 200, 200, 0.3)',
                borderRadius: '12px',
                padding: '8px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                minWidth: '180px',
                zIndex: 60
              }}>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: lang.code === currentLang ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#374151',
                      transition: 'all 0.2s ease',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      if (lang.code !== currentLang) {
                        e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.1)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (lang.code !== currentLang) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="slide-up" style={{
          textAlign: 'center',
          maxWidth: '600px',
          zIndex: 10
        }}>
          {/* 거대한 404 숫자 */}
          <div className="pulse-element" style={{
            fontSize: 'clamp(80px, 15vw, 200px)',
            fontWeight: '900',
            background: 'linear-gradient(45deg, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4, #FFEAA7, #DDA0DD, #98D8C8)',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '20px',
            lineHeight: '1',
            textShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
            animation: 'pulse 2s ease-in-out infinite, gradient 3s ease infinite'
          }}>
            {currentTranslations.subtitle}
          </div>

          {/* 장식 버튼들 */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '30px'
          }}>
            <div className="bounce-element" style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#FF6B6B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)',
              animationDelay: '0s'
            }}>
              !
            </div>
            <div className="bounce-element" style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#4ECDC4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: '0 4px 15px rgba(78, 205, 196, 0.4)',
              animationDelay: '0.2s'
            }}>
              ?
            </div>
          </div>

          {/* 제목 */}
          <h1 style={{
            fontSize: 'clamp(24px, 5vw, 42px)',
            fontWeight: '700',
            color: '#1F2937',
            marginBottom: '15px',
            lineHeight: '1.2'
          }}>
            {currentTranslations.title}
          </h1>

          {/* 설명 */}
          <p style={{
            fontSize: 'clamp(14px, 3vw, 18px)',
            color: '#6B7280',
            marginBottom: '40px',
            lineHeight: '1.6',
            maxWidth: '500px',
            margin: '0 auto 40px'
          }}>
            {currentTranslations.description}
          </p>

          {/* 장식 이모지들 */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '15px',
            marginBottom: '40px',
            fontSize: '24px'
          }}>
            {['⭐', '🌟', '✨', '💫', '⭐'].map((emoji, index) => (
              <span
                key={index}
                className="sparkle-element"
                style={{
                  animationDelay: `${index * 0.2}s`,
                  display: 'inline-block'
                }}
              >
                {emoji}
              </span>
            ))}
          </div>

          {/* 액션 버튼들 */}
          <div style={{
            display: 'flex',
            flexDirection: window.innerWidth < 640 ? 'column' : 'row',
            gap: '15px',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <Link href={`/${currentLang}`} style={{ textDecoration: 'none' }}>
              <button style={{
                backgroundColor: '#3B82F6',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
                minWidth: '160px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(59, 130, 246, 0.4)';
              }}>
                🏠 {currentTranslations.homeButton}
              </button>
            </Link>

            <button
              onClick={handleGoBack}
              style={{
                backgroundColor: '#10B981',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                minWidth: '160px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
              }}
            >
              ← {currentTranslations.backButton}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
