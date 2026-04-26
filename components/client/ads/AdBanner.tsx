'use client';

import { useEffect, useRef, useState } from 'react';

interface AdBannerProps {
  className?: string;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  fullWidthResponsive?: boolean;
}

const CLIENT_ID = 'ca-pub-1539304887624918';
const SLOT_ID = '8025770538';
const CONSENT_STORAGE_KEY = 'picnic-cookie-consent';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/**
 * AdSense 배너 광고 컴포넌트
 * 사용자 동의가 있고 프로덕션 환경에서만 광고를 표시합니다.
 */
export default function AdBanner({
  className = '',
  format = 'auto',
  fullWidthResponsive = true,
}: AdBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const [canShow, setCanShow] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    // 프로덕션 환경에서만 광고 표시
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    // 동의 여부 확인
    try {
      const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) {
        return;
      }

      if (stored === 'granted' || stored === 'accepted') {
        setCanShow(true);
        return;
      }

      const parsed = JSON.parse(stored);
      if (parsed?.marketing === true || parsed?.ads === true || parsed?.advertising === true) {
        setCanShow(true);
      }
    } catch {
      // 동의 정보 파싱 실패 시 광고 미표시
    }
  }, []);

  useEffect(() => {
    if (!canShow || adLoaded) {
      return;
    }

    // adsbygoogle가 로드되었는지 확인 후 광고 푸시
    const pushAd = () => {
      try {
        if (adRef.current && adRef.current.offsetWidth > 0) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setAdLoaded(true);
        }
      } catch (error) {
        console.error('AdSense error:', error);
      }
    };

    // 스크립트 로드 대기
    const timer = setTimeout(pushAd, 100);
    return () => clearTimeout(timer);
  }, [canShow, adLoaded]);

  // 개발 환경에서는 플레이스홀더 표시
  if (process.env.NODE_ENV !== 'production') {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 border border-dashed border-gray-300 text-gray-400 text-sm py-4 ${className}`}
      >
        [광고 영역 - 프로덕션에서만 표시됨]
      </div>
    );
  }

  if (!canShow) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={SLOT_ID}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
      />
    </div>
  );
}
