'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const CONSENT_STORAGE_KEY = 'picnic-cookie-consent';
const CONSENT_UPDATED_EVENT = 'picnic-consent-updated';

type ConsentStatus = 'pending' | 'granted' | 'denied';

interface Translations {
  title: string;
  description: string;
  accept: string;
  decline: string;
  learnMore: string;
}

const translations: Record<string, Translations> = {
  ko: {
    title: '쿠키 및 광고 동의',
    description: '더 나은 서비스 제공을 위해 쿠키와 맞춤형 광고를 사용합니다. 동의하시면 관련 광고가 표시됩니다.',
    accept: '동의',
    decline: '거부',
    learnMore: '개인정보처리방침',
  },
  en: {
    title: 'Cookie & Ad Consent',
    description: 'We use cookies and personalized ads to improve your experience. By accepting, you agree to see relevant ads.',
    accept: 'Accept',
    decline: 'Decline',
    learnMore: 'Privacy Policy',
  },
  ja: {
    title: 'Cookieと広告の同意',
    description: 'より良いサービスを提供するため、Cookieとパーソナライズされた広告を使用しています。同意いただくと、関連する広告が表示されます。',
    accept: '同意する',
    decline: '拒否する',
    learnMore: 'プライバシーポリシー',
  },
  'zh-tw': {
    title: 'Cookie 與廣告同意',
    description: '為了提供更好的服務，我們使用 Cookie 和個性化廣告。同意後將顯示相關廣告。',
    accept: '同意',
    decline: '拒絕',
    learnMore: '隱私政策',
  },
  'zh-cn': {
    title: 'Cookie 与广告同意',
    description: '为了提供更好的服务，我们使用 Cookie 和个性化广告。同意后将显示相关广告。',
    accept: '同意',
    decline: '拒绝',
    learnMore: '隐私政策',
  },
  vi: {
    title: 'Đồng ý Cookie & Quảng cáo',
    description: 'Chúng tôi sử dụng cookie và quảng cáo được cá nhân hóa để cải thiện trải nghiệm của bạn.',
    accept: 'Đồng ý',
    decline: 'Từ chối',
    learnMore: 'Chính sách Bảo mật',
  },
  th: {
    title: 'ยินยอม Cookie และโฆษณา',
    description: 'เราใช้ Cookie และโฆษณาส่วนบุคคลเพื่อปรับปรุงประสบการณ์ของคุณ',
    accept: 'ยอมรับ',
    decline: 'ปฏิเสธ',
    learnMore: 'นโยบายความเป็นส่วนตัว',
  },
  id: {
    title: 'Persetujuan Cookie & Iklan',
    description: 'Kami menggunakan cookie dan iklan yang dipersonalisasi untuk meningkatkan pengalaman Anda.',
    accept: 'Terima',
    decline: 'Tolak',
    learnMore: 'Kebijakan Privasi',
  },
  es: {
    title: 'Consentimiento de Cookies y Anuncios',
    description: 'Usamos cookies y anuncios personalizados para mejorar tu experiencia.',
    accept: 'Aceptar',
    decline: 'Rechazar',
    learnMore: 'Política de Privacidad',
  },
  tl: {
    title: 'Pahintulot sa Cookie at Ads',
    description: 'Gumagamit kami ng cookies at personalized ads para mapabuti ang iyong karanasan.',
    accept: 'Tanggapin',
    decline: 'Tanggihan',
    learnMore: 'Patakaran sa Privacy',
  },
  bn: {
    title: 'কুকি ও বিজ্ঞাপন সম্মতি',
    description: 'আমরা আপনার অভিজ্ঞতা উন্নত করতে কুকি এবং ব্যক্তিগতকৃত বিজ্ঞাপন ব্যবহার করি।',
    accept: 'সম্মতি',
    decline: 'প্রত্যাখ্যান',
    learnMore: 'গোপনীয়তা নীতি',
  },
  my: {
    title: 'Cookie နှင့် ကြော်ငြာ သဘောတူညီချက်',
    description: 'သင့်အတွေ့အကြုံကို ပိုမိုကောင်းမွန်စေရန် cookie နှင့် ကြော်ငြာများကို အသုံးပြုပါသည်။',
    accept: 'သဘောတူ',
    decline: 'ငြင်းပယ်',
    learnMore: 'ကိုယ်ရေးအချက်အလက်',
  },
};

function getTranslation(lang: string): Translations {
  return translations[lang] || translations['en'];
}

export function CookieConsentBanner() {
  const params = useParams();
  const lang = (params?.lang as string) || 'ko';
  const t = getTranslation(lang);

  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === 'granted' || stored === 'denied') {
      setStatus(stored);
      setIsVisible(false);
    } else {
      setStatus('pending');
      // 약간의 지연 후 배너 표시 (페이지 로딩 후)
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = useCallback((granted: boolean) => {
    const value = granted ? 'granted' : 'denied';
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
    setStatus(value);
    setIsVisible(false);

    // 동의 이벤트 발생 (ConsentAwareAdsense가 감지)
    window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT));
  }, []);

  // 이미 선택한 경우 렌더링하지 않음
  if (status !== 'pending' || !isVisible) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-slide-up"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <div className="mx-auto max-w-lg rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-5">
          <h2
            id="cookie-consent-title"
            className="text-base font-semibold text-gray-900 mb-2"
          >
            {t.title}
          </h2>
          <p
            id="cookie-consent-description"
            className="text-sm text-gray-600 mb-4 leading-relaxed"
          >
            {t.description}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => handleConsent(true)}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t.accept}
            </button>
            <button
              onClick={() => handleConsent(false)}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              {t.decline}
            </button>
          </div>

          <div className="mt-3 text-center">
            <a
              href={`/${lang}/privacy`}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {t.learnMore}
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default CookieConsentBanner;
