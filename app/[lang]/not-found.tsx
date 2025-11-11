'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';

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
  { code: 'zh-cn', name: '简体中文', flag: '🇨🇳' },
  { code: 'zh-tw', name: '繁體中文', flag: '🇹🇼' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'bn', name: 'বাংলা', flag: '🇧🇩' },
  { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'my', name: 'မြန်မာဘာသာ', flag: '🇲🇲' },
];

// 번역 객체
const translations = {
  ko: {
    title: '페이지를 찾을 수 없습니다',
    subtitle: '404',
    description: '찾고 계신 페이지가 삭제되었거나, 이름이 변경되었거나, 일시적으로 사용할 수 없습니다.',
    homeButton: '홈으로',
    backButton: '이전 페이지',
    languageSelect: '언어',
  },
  en: {
    title: 'Page Not Found',
    subtitle: '404',
    description: 'The page you are looking for has been deleted, renamed, or is temporarily unavailable.',
    homeButton: 'Home',
    backButton: 'Previous Page',
    languageSelect: 'Language',
  },
  ja: {
    title: 'ページが見つかりません',
    subtitle: '404',
    description: 'お探しのページは削除されたか、名前が変更されたか、一時的にご利用いただけません。',
    homeButton: 'ホーム',
    backButton: '前のページ',
    languageSelect: '言語',
  },
  'zh-cn': {
    title: '页面未找到',
    subtitle: '404',
    description: '您正在寻找的页面已被删除、重命名或暂时不可用。',
    homeButton: '首页',
    backButton: '上一页',
    languageSelect: '语言',
  },
  'zh-tw': {
    title: '頁面未找到',
    subtitle: '404',
    description: '您正在尋找的頁面已被刪除、重新命名或暫時不可用。',
    homeButton: '首頁',
    backButton: '上一頁',
    languageSelect: '語言',
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    subtitle: '404',
    description: 'Halaman yang Anda cari telah dihapus, diubah namanya, atau sementara tidak tersedia.',
    homeButton: 'Beranda',
    backButton: 'Halaman Sebelumnya',
    languageSelect: 'Bahasa',
  },
  es: {
    title: 'Página No Encontrada',
    subtitle: '404',
    description: 'La página que buscas ha sido eliminada, renombrada o no está disponible temporalmente.',
    homeButton: 'Inicio',
    backButton: 'Página Anterior',
    languageSelect: 'Idioma',
  },
  bn: {
    title: 'পৃষ্ঠা পাওয়া যায়নি',
    subtitle: '404',
    description: 'আপনি যে পৃষ্ঠাটি খুঁজছেন তা মুছে ফেলা হয়েছে, নাম পরিবর্তন করা হয়েছে বা সাময়িকভাবে উপলব্ধ নয়।',
    homeButton: 'হোম',
    backButton: 'পূর্ববর্তী পৃষ্ঠা',
    languageSelect: 'ভাষা',
  },
  tl: {
    title: 'Hindi Natagpuan ang Pahina',
    subtitle: '404',
    description: 'Ang pahinang hinahanap mo ay natanggal, pinalitan ng pangalan, o pansamantalang hindi available.',
    homeButton: 'Home',
    backButton: 'Nakaraang Pahina',
    languageSelect: 'Wika',
  },
  th: {
    title: 'ไม่พบหน้า',
    subtitle: '404',
    description: 'หน้าที่คุณกำลังมองหาถูกลบ เปลี่ยนชื่อ หรือไม่พร้อมใช้งานชั่วคราว',
    homeButton: 'หน้าแรก',
    backButton: 'หน้าก่อนหน้า',
    languageSelect: 'ภาษา',
  },
  vi: {
    title: 'Không Tìm Thấy Trang',
    subtitle: '404',
    description: 'Trang bạn đang tìm kiếm đã bị xóa, đổi tên hoặc tạm thời không khả dụng.',
    homeButton: 'Trang Chủ',
    backButton: 'Trang Trước',
    languageSelect: 'Ngôn Ngữ',
  },
  my: {
    title: 'စာမျက်နှာ မတွေ့ရှိပါ',
    subtitle: '404',
    description: 'သင်ရှာဖွေနေသော စာမျက်နှာကို ဖျက်လိုက်ပြီး၊ အမည်ပြောင်းလိုက်ပြီး သို့မဟုတ် ယာယီအားဖြင့် မရရှိနိုင်ပါ။',
    homeButton: 'ပင်မစာမျက်နှာ',
    backButton: 'ယခင်စာမျက်နှာ',
    languageSelect: 'ဘာသာစကား',
  },
};

// 언어가 유효한지 확인하는 타입 가드 함수
function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}

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
    <>
      <style jsx>{`
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
        .bounce {
          animation: bounce 2s infinite;
        }
        .float {
          animation: float 3s ease-in-out infinite;
        }
        .twinkle {
          animation: twinkle 1s infinite;
        }
      `}</style>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* 배경 애니메이션 요소들 */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d2691e, #ff8c00)',
            opacity: 0.7,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            top: '20%',
            right: '15%',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #cd853f, #daa520)',
            opacity: 0.6,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            bottom: '15%',
            left: '20%',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #b8860b, #f4a460)',
            opacity: 0.5,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            bottom: '25%',
            right: '10%',
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #daa520, #ffd700)',
            opacity: 0.8,
          }}
          className="float"
        />

        {/* 반짝이는 이모지들 */}
        <div
          style={{
            position: 'absolute',
            top: '5%',
            left: '5%',
            fontSize: '24px',
          }}
          className="twinkle"
        >
          ⭐
        </div>
        <div
          style={{
            position: 'absolute',
            top: '15%',
            right: '8%',
            fontSize: '20px',
          }}
          className="twinkle"
        >
          🌟
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '8%',
            fontSize: '18px',
          }}
          className="twinkle"
        >
          ✨
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '20%',
            right: '12%',
            fontSize: '22px',
          }}
          className="twinkle"
        >
          💫
        </div>
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '85%',
            fontSize: '20px',
          }}
          className="twinkle"
        >
          ⭐
        </div>

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
      </div>
    </>
  );
}
