'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

// 언어 목록
const languages = [
  { code: 'ko', name: '한국어', shortName: '한', flag: '🇰🇷' },
  { code: 'en', name: 'English', shortName: 'EN', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', shortName: '日', flag: '🇯🇵' },
  { code: 'zh', name: '中文', shortName: '中', flag: '🇨🇳' },
  { code: 'id', name: 'Bahasa Indonesia', shortName: 'ID', flag: '🇮🇩' },
];

// 간단한 번역 객체 (글로벌 not-found용)
const fallbackTranslations = {
  ko: {
    title: '페이지를 찾을 수 없음',
    description: '찾고 계신 페이지가 삭제되었거나 이동되었을 수 있습니다.',
    homeButton: '홈으로 돌아가기',
    contactButton: '문의하기',
    backButton: '이전으로 돌아가기',
    media: '미디어',
    vote: '투표',
    gallery: '갤러리',
    store: '상점',
  },
  en: {
    title: 'Page Not Found',
    description: 'The page you are looking for might have been removed or moved.',
    homeButton: 'Return to Home',
    contactButton: 'Contact Us',
    backButton: 'Go Back',
    media: 'Media',
    vote: 'Vote',
    gallery: 'Gallery',
    store: 'Store',
  },
  ja: {
    title: 'ページが見つかりません',
    description: 'お探しのページは削除または移動された可能性があります。',
    homeButton: 'ホームへ戻る',
    contactButton: 'お問い合わせ',
    backButton: '戻る',
    media: 'メディア',
    vote: '投票',
    gallery: 'ギャラリー',
    store: 'ストア',
  },
  zh: {
    title: '页面未找到',
    description: '您要查找的页面可能已被删除或移动。',
    homeButton: '返回首页',
    contactButton: '联系我们',
    backButton: '返回',
    media: '媒体',
    vote: '投票',
    gallery: '画廊',
    store: '商店',
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    description: 'Halaman yang Anda cari mungkin telah dihapus atau dipindahkan.',
    homeButton: 'Kembali ke Rumah',
    contactButton: 'Hubungi Kami',
    backButton: 'Kembali',
    media: 'Media',
    vote: 'Voting',
    gallery: 'Galeri',
    store: 'Toko',
  },
};

type PageType = 'general' | 'media' | 'vote' | 'gallery' | 'store' | string;

interface UniversalNotFoundProps {
  pageType?: PageType;
  customTitle?: string;
  customDescription?: string;
  customBackLink?: string;
  showContactButton?: boolean;
  useGlobalLanguageDetection?: boolean;
}

// 언어 감지 함수
const detectLanguageFromPath = (pathname: string): keyof typeof fallbackTranslations => {
  const pathLang = pathname.split('/')[1];
  if (pathLang && pathLang in fallbackTranslations) {
    return pathLang as keyof typeof fallbackTranslations;
  }
  
  if (typeof window !== 'undefined') {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in fallbackTranslations) {
      return browserLang as keyof typeof fallbackTranslations;
    }
  }
  
  return 'ko';
};

// 404 페이지용 간소화된 언어 선택기
function NotFoundLanguageSelector({ 
  currentLang, 
  useGlobalLanguageDetection, 
  onLanguageChange 
}: {
  currentLang: string;
  useGlobalLanguageDetection: boolean;
  onLanguageChange: (lang: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { changeLocale } = useLocaleRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentLanguageObj = languages.find(lang => lang.code === currentLang);

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === currentLang || !mounted) return;

    try {
      if (useGlobalLanguageDetection) {
        await changeLocale(langCode as any, false);
      } else {
        await changeLocale(langCode as any, true);
      }
      
      onLanguageChange(langCode);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  if (!mounted) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: '20px', 
        right: '20px', 
        zIndex: 50,
        width: '80px',
        height: '40px',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: '20px'
      }} />
    );
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: '20px', 
      right: '20px', 
      zIndex: 50 
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '25px',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          fontSize: '14px',
          fontWeight: '500'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <span style={{ fontSize: '18px' }}>{currentLanguageObj?.flag || '🌐'}</span>
        <span style={{ display: window.innerWidth < 640 ? 'none' : 'block' }}>
          {currentLanguageObj?.shortName || 'KO'}
        </span>
        <span style={{ 
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s'
        }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          marginTop: '8px',
          padding: '8px 0',
          backgroundColor: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          minWidth: '160px'
        }}>
          {languages.map((language) => {
            const isCurrentLanguage = language.code === currentLang;
            return (
              <button
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
                disabled={isCurrentLanguage}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  textAlign: 'left',
                  border: 'none',
                  background: 'none',
                  cursor: isCurrentLanguage ? 'default' : 'pointer',
                  backgroundColor: isCurrentLanguage ? '#f3e8ff' : 'transparent',
                  color: isCurrentLanguage ? '#7c3aed' : '#374151',
                  fontWeight: isCurrentLanguage ? '600' : '400',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isCurrentLanguage) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrentLanguage) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ marginRight: '8px' }}>{language.flag}</span>
                {language.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function UniversalNotFound({
  pageType = 'general',
  customTitle,
  customDescription,
  customBackLink,
  showContactButton = true,
  useGlobalLanguageDetection = false,
}: UniversalNotFoundProps) {
  const params = useParams();
  const pathname = usePathname();
  const { t } = useLanguageStore();
  const [detectedLang, setDetectedLang] = useState<keyof typeof fallbackTranslations>('ko');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (useGlobalLanguageDetection) {
      setDetectedLang(detectLanguageFromPath(pathname));
    }
  }, [pathname, useGlobalLanguageDetection]);

  if (!isClient) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(255,255,255,0.3)',
          borderTop: '4px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // 언어 설정
  const lang = useGlobalLanguageDetection 
    ? detectedLang 
    : (params?.lang as string) || 'ko';
  
  // 번역 함수
  const getTranslation = (key: string) => {
    if (useGlobalLanguageDetection) {
      const fallback = fallbackTranslations[lang] || fallbackTranslations.ko;
      return (fallback as any)[key] || key;
    }
    return t(key) || key;
  };

  // 페이지 타입별 메시지 생성
  const getPageSpecificContent = () => {
    switch (pageType) {
      case 'media':
        return {
          title: customTitle || (useGlobalLanguageDetection 
            ? `${getTranslation('media')} ${getTranslation('title')}`
            : t('media.notFound.title')),
          description: customDescription || (useGlobalLanguageDetection 
            ? getTranslation('description')
            : t('media.notFound.description')),
          backLink: customBackLink || `/${lang}/media`,
          backLabel: useGlobalLanguageDetection 
            ? `${getTranslation('media')} ${getTranslation('backButton')}`
            : t('media.notFound.backButton'),
        };
      
      case 'vote':
        return {
          title: customTitle || (useGlobalLanguageDetection 
            ? `${getTranslation('vote')} ${getTranslation('title')}`
            : t('vote.notFound.title')),
          description: customDescription || (useGlobalLanguageDetection 
            ? getTranslation('description')
            : t('vote.notFound.description')),
          backLink: customBackLink || `/${lang}/vote`,
          backLabel: useGlobalLanguageDetection 
            ? `${getTranslation('vote')} ${getTranslation('backButton')}`
            : t('vote.notFound.backButton'),
        };
      
      default:
        return {
          title: customTitle || getTranslation(useGlobalLanguageDetection ? 'title' : 'notFound.title'),
          description: customDescription || getTranslation(useGlobalLanguageDetection ? 'description' : 'notFound.description'),
          backLink: customBackLink || `/${lang}`,
          backLabel: getTranslation(useGlobalLanguageDetection ? 'homeButton' : 'notFound.homeButton'),
        };
    }
  };

  const content = getPageSpecificContent();

  return (
    <>
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 20%, 53%, 80%, 100% { transform: translateY(0); }
          40%, 43% { transform: translateY(-10px); }
          70% { transform: translateY(-5px); }
          90% { transform: translateY(-2px); }
        }
        .floating { animation: float 3s ease-in-out infinite; }
        .pulsing { animation: pulse 2s ease-in-out infinite; }
        .bouncing { animation: bounce 2s infinite; }
      `}</style>
      
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* 배경 장식 요소들 */}
        <div style={{ position: 'absolute', top: '10%', left: '10%', width: '80px', height: '80px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} className="floating" />
        <div style={{ position: 'absolute', top: '20%', right: '20%', width: '60px', height: '60px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '50%' }} className="pulsing" />
        <div style={{ position: 'absolute', bottom: '30%', left: '15%', width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '50%' }} className="bouncing" />
        <div style={{ position: 'absolute', bottom: '15%', right: '25%', width: '100px', height: '100px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} className="floating" />

        {/* 언어 선택기 */}
        <NotFoundLanguageSelector 
          currentLang={lang}
          useGlobalLanguageDetection={useGlobalLanguageDetection}
          onLanguageChange={(newLang) => {
            if (useGlobalLanguageDetection) {
              setDetectedLang(newLang as keyof typeof fallbackTranslations);
            }
          }}
        />

        {/* 메인 콘텐츠 */}
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{ maxWidth: '800px', width: '100%' }}>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '30px',
              padding: '60px 40px',
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
            }}>
              {/* 로고 */}
              <div style={{ marginBottom: '40px' }} className="floating">
                <Image
                  src='/images/logo.png'
                  alt='Picnic Logo'
                  width={120}
                  height={120}
                  style={{ margin: '0 auto', display: 'block', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.3))' }}
                />
              </div>

              {/* 404 숫자 */}
              <div style={{ marginBottom: '40px', position: 'relative' }}>
                <h1 style={{
                  fontSize: window.innerWidth < 768 ? '120px' : '160px',
                  fontWeight: '900',
                  background: 'linear-gradient(45deg, #ff6b6b, #ffd93d, #6bcf7f, #4d9de0, #e15759)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  margin: '0',
                  textShadow: '0 0 30px rgba(255,255,255,0.5)',
                  position: 'relative'
                }} className="pulsing">
                  404
                </h1>
                
                {/* 장식 요소들 */}
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  right: '-20px',
                  width: '50px',
                  height: '50px',
                  backgroundColor: '#ffd93d',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: 'white',
                  boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
                }} className="bouncing">
                  !
                </div>
                
                <div style={{
                  position: 'absolute',
                  bottom: '-10px',
                  left: '-10px',
                  width: '35px',
                  height: '35px',
                  backgroundColor: '#ff6b6b',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: 'white',
                  boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
                }} className="floating">
                  ?
                </div>
              </div>

              {/* 제목과 설명 */}
              <div style={{ marginBottom: '50px' }}>
                <h2 style={{
                  fontSize: window.innerWidth < 768 ? '28px' : '36px',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '20px',
                  textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}>
                  {content.title}
                </h2>
                <p style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: window.innerWidth < 768 ? '16px' : '20px',
                  lineHeight: '1.6',
                  maxWidth: '600px',
                  margin: '0 auto',
                  textShadow: '0 1px 5px rgba(0,0,0,0.2)'
                }}>
                  {content.description}
                </p>
              </div>

              {/* 버튼들 */}
              <div style={{ 
                display: 'flex',
                flexDirection: window.innerWidth < 640 ? 'column' : 'row',
                justifyContent: 'center',
                gap: '16px',
                marginBottom: '40px'
              }}>
                <Link
                  href={content.backLink}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px 32px',
                    backgroundColor: 'white',
                    color: '#333',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontWeight: '600',
                    fontSize: '16px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
                  }}
                >
                  <span style={{ marginRight: '8px' }}>←</span>
                  {content.backLabel}
                </Link>
                
                {showContactButton && (
                  <Link
                    href={`/${lang}/contact`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px 32px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      fontWeight: '600',
                      fontSize: '16px',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
                    }}
                  >
                    <span style={{ marginRight: '8px' }}>💬</span>
                    {getTranslation(useGlobalLanguageDetection ? 'contactButton' : 'notFound.contactButton')}
                  </Link>
                )}
              </div>

              {/* 장식 이모지들 */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '16px',
                fontSize: '24px',
                opacity: '0.7'
              }}>
                <span className="bouncing" style={{ animationDelay: '0s' }}>⭐</span>
                <span className="bouncing" style={{ animationDelay: '0.2s' }}>🌟</span>
                <span className="bouncing" style={{ animationDelay: '0.4s' }}>✨</span>
                <span className="bouncing" style={{ animationDelay: '0.6s' }}>💫</span>
                <span className="bouncing" style={{ animationDelay: '0.8s' }}>⭐</span>
              </div>

              {/* 디버그 정보 */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{
                  marginTop: '40px',
                  padding: '20px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🔍 Debug Info:</div>
                  <div>• Page Type: {pageType}</div>
                  <div>• Detected Language: {lang}</div>
                  <div>• Global Detection: {String(useGlobalLanguageDetection)}</div>
                  <div>• Pathname: {pathname}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 