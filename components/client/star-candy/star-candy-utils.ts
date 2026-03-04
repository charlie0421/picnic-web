import { Products } from '@/types/interfaces';
import { LoginRequiredDialogProps } from '@/components/ui/Dialog/types';
import { saveRedirectUrl } from '@/utils/auth-redirect';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/** Featured product thresholds (star candy amounts) */
export const FEATURED_PRODUCT_AMOUNTS = [600, 10000] as const;

/** PayPal checkout popup dimensions */
export const PAYPAL_POPUP_WIDTH = 500;
export const PAYPAL_POPUP_HEIGHT = 600;

/** PayPal payment polling interval (ms) */
export const PAYMENT_POLL_INTERVAL_MS = 1000;

/** PayPal payment polling timeout (ms) - 10 minutes */
export const PAYMENT_POLL_TIMEOUT_MS = 600000;

/** Initial delay before first payment verification (ms) */
export const VERIFY_INITIAL_DELAY_MS = 2000;

export function formatPrice(price: number | null, currency: 'KRW' | 'USD') {
  if (!price) return '';

  if (currency === 'KRW') {
    return `\u20A9${price.toLocaleString('ko-KR')}`;
  } else {
    return `$${price.toFixed(2)}`;
  }
}

export function getSafeLocalizedString(value: any, language: string) {
  if (!value) return '';

  // 이미 문자열인 경우
  if (typeof value === 'string') {
    // JSON 문자열인지 확인
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed[language]) {
        return parsed[language];
      }
      if (typeof parsed === 'object' && parsed['en']) {
        return parsed['en'];
      }
      // JSON이지만 해당 언어가 없으면 원본 문자열 반환
      return value;
    } catch {
      // JSON이 아닌 일반 문자열
      return value;
    }
  }

  // 객체인 경우
  if (typeof value === 'object' && value !== null) {
    return value[language] || value['en'] || '';
  }

  return String(value);
}

export function getProductImage(starCandyAmount: number | null | undefined) {
  if (!starCandyAmount) return '/images/star-candy/star_100.png';

  const imageMap = [
    { threshold: 100, image: 'star_100.png' },
    { threshold: 200, image: 'star_200.png' },
    { threshold: 600, image: 'star_600.png' },
    { threshold: 1000, image: 'star_1000.png' },
    { threshold: 2000, image: 'star_2000.png' },
    { threshold: 3000, image: 'star_3000.png' },
    { threshold: 4000, image: 'star_4000.png' },
    { threshold: 5000, image: 'star_5000.png' },
    { threshold: 7000, image: 'star_7000.png' },
    { threshold: 10000, image: 'star_10000.png' },
  ];

  // 수량에 가장 가까운 이미지를 찾기
  let selectedImage = imageMap[0].image;
  for (const item of imageMap) {
    if (starCandyAmount <= item.threshold) {
      selectedImage = item.image;
      break;
    }
    selectedImage = item.image; // 가장 큰 수량보다 많은 경우 최대 이미지 사용
  }

  return `/images/star-candy/${selectedImage}`;
}

export function getSortedProducts(products: Products[]) {
  return [...products].sort((a, b) => {
    // web_display_order가 있으면 그것으로 정렬
    if (a.web_display_order && b.web_display_order) {
      return a.web_display_order - b.web_display_order;
    }
    if (a.web_display_order && !b.web_display_order) return -1;
    if (!a.web_display_order && b.web_display_order) return 1;

    // 별사탕 수량으로 정렬 (오름차순)
    return (a.star_candy || 0) - (b.star_candy || 0);
  });
}

export type ShowLoginRequired = (
  props: Omit<LoginRequiredDialogProps, 'isOpen' | 'onClose'>,
) => Promise<boolean>;

export function buildLoginRedirect(
  pathname: string | null,
  currentLanguage: string,
  router: AppRouterInstance,
  showLoginRequired: ShowLoginRequired,
) {
  const returnTo = pathname || '/';
  const langFromPath = pathname?.split('/')[1] || '';
  const lang = langFromPath || currentLanguage || 'en';

  const doRedirect = () => {
    try { saveRedirectUrl(returnTo); } catch {}
    const loginUrl = `/${lang}/login?returnTo=${encodeURIComponent(returnTo)}`;
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    } else {
      router.push(loginUrl);
    }
  };

  return showLoginRequired({
    redirectUrl: returnTo,
    onLogin: doRedirect,
  }).catch(() => {
    doRedirect();
  });
}
