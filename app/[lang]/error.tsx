'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * 500 에러 페이지
 * 
 * React error boundary에 의해 호출되는 에러 페이지입니다.
 * URL에서 직접 언어를 감지하고 언어 선택기를 제공합니다.
 */

const languages = {
  ko: { name: '한국어', flag: '🇰🇷' },
  en: { name: 'English', flag: '🇺🇸' },
  ja: { name: '日本語', flag: '🇯🇵' },
  'zh-cn': { name: '简体中文', flag: '🇨🇳' },
  'zh-tw': { name: '繁體中文', flag: '🇹🇼' },
  id: { name: 'Bahasa Indonesia', flag: '🇮🇩' },
  es: { name: 'Español', flag: '🇪🇸' },
  bn: { name: 'বাংলা', flag: '🇧🇩' },
  tl: { name: 'Filipino', flag: '🇵🇭' },
  th: { name: 'ไทย', flag: '🇹🇭' },
  vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
  my: { name: 'မြန်မာဘာသာ', flag: '🇲🇲' },
};

const translations = {
  ko: {
    title: '서버 오류가 발생했습니다',
    subtitle: '죄송합니다. 일시적인 서버 문제가 발생했습니다.',
    description: '잠시 후 다시 시도해주세요. 문제가 계속되면 고객센터로 문의해주세요.',
    homeButton: '홈으로 가기',
    backButton: '뒤로 가기',
    retryButton: '다시 시도',
    languageSelect: '언어 선택',
    errorCode: '오류 코드: 500'
  },
  en: {
    title: 'Server Error Occurred',
    subtitle: 'Sorry, we encountered a temporary server issue.',
    description: 'Please try again in a moment. If the problem continues, contact customer service.',
    homeButton: 'Go Home',
    backButton: 'Go Back',
    retryButton: 'Try Again',
    languageSelect: 'Select Language',
    errorCode: 'Error Code: 500'
  },
  ja: {
    title: 'サーバーエラーが発生しました',
    subtitle: '申し訳ございません。一時的なサーバーの問題が発生しました。',
    description: 'しばらく後に再度お試しください。問題が続く場合は、カスタマーサービスにお問い合わせください。',
    homeButton: 'ホームに戻る',
    backButton: '戻る',
    retryButton: '再試行',
    languageSelect: '言語選択',
    errorCode: 'エラーコード: 500'
  },
  'zh-cn': {
    title: '服务器错误',
    subtitle: '抱歉，遇到了临时的服务器问题。',
    description: '请稍后再试。如果问题持续，请联系客服。',
    homeButton: '回到首页',
    backButton: '返回',
    retryButton: '重试',
    languageSelect: '选择语言',
    errorCode: '错误代码: 500'
  },
  'zh-tw': {
    title: '伺服器錯誤',
    subtitle: '抱歉，遇到了暫時的伺服器問題。',
    description: '請稍後再試。如果問題持續，請聯絡客服。',
    homeButton: '回到首頁',
    backButton: '返回',
    retryButton: '重試',
    languageSelect: '選擇語言',
    errorCode: '錯誤代碼: 500'
  },
  id: {
    title: 'Terjadi Kesalahan Server',
    subtitle: 'Maaf, terjadi masalah server sementara.',
    description: 'Silakan coba lagi nanti. Jika masalah berlanjut, hubungi layanan pelanggan.',
    homeButton: 'Ke Beranda',
    backButton: 'Kembali',
    retryButton: 'Coba Lagi',
    languageSelect: 'Pilih Bahasa',
    errorCode: 'Kode Error: 500'
  },
  es: {
    title: 'Error del Servidor',
    subtitle: 'Lo sentimos, encontramos un problema temporal del servidor.',
    description: 'Por favor, inténtalo de nuevo en un momento. Si el problema continúa, contacta con el servicio al cliente.',
    homeButton: 'Ir al Inicio',
    backButton: 'Volver',
    retryButton: 'Reintentar',
    languageSelect: 'Seleccionar Idioma',
    errorCode: 'Código de Error: 500'
  },
  bn: {
    title: 'সার্ভার ত্রুটি ঘটেছে',
    subtitle: 'দুঃখিত, আমরা একটি অস্থায়ী সার্ভার সমস্যার সম্মুখীন হয়েছি।',
    description: 'অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন। সমস্যা অব্যাহত থাকলে, গ্রাহক সেবার সাথে যোগাযোগ করুন।',
    homeButton: 'হোমে যান',
    backButton: 'ফিরে যান',
    retryButton: 'আবার চেষ্টা করুন',
    languageSelect: 'ভাষা নির্বাচন করুন',
    errorCode: 'ত্রুটি কোড: 500'
  },
  tl: {
    title: 'Naganap ang Server Error',
    subtitle: 'Paumanhin, nakatagpo kami ng pansamantalang server issue.',
    description: 'Mangyaring subukan muli sa ilang sandali. Kung patuloy ang problema, makipag-ugnayan sa customer service.',
    homeButton: 'Pumunta sa Home',
    backButton: 'Bumalik',
    retryButton: 'Subukan Muli',
    languageSelect: 'Pumili ng Wika',
    errorCode: 'Error Code: 500'
  },
  th: {
    title: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์',
    subtitle: 'ขออภัย พบปัญหาชั่วคราวของเซิร์ฟเวอร์',
    description: 'กรุณาลองใหม่อีกครั้งในอีกสักครู่ หากปัญหายังคงอยู่ กรุณาติดต่อฝ่ายบริการลูกค้า',
    homeButton: 'ไปที่หน้าแรก',
    backButton: 'กลับ',
    retryButton: 'ลองอีกครั้ง',
    languageSelect: 'เลือกภาษา',
    errorCode: 'รหัสข้อผิดพลาด: 500'
  },
  vi: {
    title: 'Lỗi Máy Chủ',
    subtitle: 'Xin lỗi, chúng tôi gặp phải sự cố tạm thời của máy chủ.',
    description: 'Vui lòng thử lại sau một lúc. Nếu vấn đề vẫn tiếp tục, vui lòng liên hệ dịch vụ khách hàng.',
    homeButton: 'Về Trang Chủ',
    backButton: 'Quay Lại',
    retryButton: 'Thử Lại',
    languageSelect: 'Chọn Ngôn Ngữ',
    errorCode: 'Mã Lỗi: 500'
  },
  my: {
    title: 'ဆာဗား အမှားအယွင်း ဖြစ်ပွားခဲ့သည်',
    subtitle: 'ဝမ်းနည်းပါတယ်၊ ကျွန်ုပ်တို့သည် ယာယီဆာဗား ပြဿနာတစ်ခုနှင့် ရင်ဆိုင်ခဲ့ရသည်။',
    description: 'ကျေးဇူးပြု၍ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။ ပြဿနာ ဆက်လက်ရှိနေပါက၊ ဖောက်သည်ဝန်ဆောင်မှုသို့ ဆက်သွယ်ပါ။',
    homeButton: 'ပင်မစာမျက်နှာသို့ သွားရန်',
    backButton: 'ပြန်သွားရန်',
    retryButton: 'ထပ်မံကြိုးစားရန်',
    languageSelect: 'ဘာသာစကား ရွေးချယ်ရန်',
    errorCode: 'အမှားအယွင်း ကုဒ်: 500'
  }
};

type Language = keyof typeof languages;

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 배경 떠다니는 도형들 */}
      <div style={{ position: 'absolute', top: '10%', left: '10%', width: '80px', height: '80px', backgroundColor: '#8B4513', borderRadius: '50%', animation: 'float 6s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '20%', right: '15%', width: '60px', height: '60px', backgroundColor: '#CD853F', borderRadius: '50%', animation: 'float 8s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', bottom: '15%', left: '20%', width: '70px', height: '70px', backgroundColor: '#DEB887', borderRadius: '50%', animation: 'float 7s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '25%', right: '10%', width: '50px', height: '50px', backgroundColor: '#D2691E', borderRadius: '50%', animation: 'float 9s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', top: '50%', left: '5%', width: '40px', height: '40px', backgroundColor: '#A0522D', borderRadius: '50%', animation: 'float 5s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '30%', right: '5%', width: '90px', height: '90px', backgroundColor: '#F4A460', borderRadius: '50%', animation: 'float 10s ease-in-out infinite reverse' }} />

      {/* 반짝이는 이모지들 */}
      <div style={{ position: 'absolute', top: '15%', left: '25%', fontSize: '30px', animation: 'sparkle 2s ease-in-out infinite' }}>💥</div>
      <div style={{ position: 'absolute', top: '25%', right: '30%', fontSize: '25px', animation: 'sparkle 2.5s ease-in-out infinite reverse' }}>🔥</div>
      <div style={{ position: 'absolute', bottom: '20%', left: '30%', fontSize: '35px', animation: 'sparkle 3s ease-in-out infinite' }}>⚡</div>
      <div style={{ position: 'absolute', bottom: '35%', right: '25%', fontSize: '28px', animation: 'sparkle 2.2s ease-in-out infinite reverse' }}>💥</div>
      <div style={{ position: 'absolute', top: '40%', left: '15%', fontSize: '32px', animation: 'sparkle 2.8s ease-in-out infinite' }}>🔥</div>

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

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
} 