'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ConsentAwareAdsenseProps {
  clientId: string;
  delayUntilIdle?: boolean;
  idleTimeout?: number;
}

const CONSENT_STORAGE_KEY = 'picnic-cookie-consent';
const CONSENT_UPDATED_EVENT = 'picnic-consent-updated';
const ADSENSE_SCRIPT_ID = 'adsense-script';

/**
 * 사용자 동의 여부에 따라 AdSense 스크립트를 지연 로드합니다.
 * 동의 정보는 localStorage(JSON) 또는 단순 문자열('granted', 'accepted')에서 탐지합니다.
 */
const runWhenIdle = (callback: () => void, timeout = 1200) => {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }
  const win = window as typeof window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof win.requestIdleCallback === 'function') {
    const handle = win.requestIdleCallback(callback, { timeout });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(handle);
};

export function ConsentAwareAdsense({
  clientId,
  delayUntilIdle = false,
  idleTimeout = 1500,
}: ConsentAwareAdsenseProps) {
  const [canLoadAds, setCanLoadAds] = useState(false);
  const [isIdleReady, setIsIdleReady] = useState(() => !delayUntilIdle);
  const scriptLoaded = useRef(false);

  const resolveConsent = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) {
        setCanLoadAds(false);
        return;
      }

      if (stored === 'granted' || stored === 'accepted') {
        setCanLoadAds(true);
        return;
      }

      const parsed = JSON.parse(stored);
      if (
        parsed?.marketing === true ||
        parsed?.ads === true ||
        parsed?.advertising === true
      ) {
        setCanLoadAds(true);
        return;
      }

      setCanLoadAds(false);
    } catch {
      setCanLoadAds(false);
    }
  }, []);

  useEffect(() => {
    resolveConsent();
    window.addEventListener(CONSENT_UPDATED_EVENT, resolveConsent);
    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, resolveConsent);
    };
  }, [resolveConsent]);

  useEffect(() => {
    if (!delayUntilIdle || isIdleReady) {
      return;
    }
    const dispose = runWhenIdle(() => setIsIdleReady(true), idleTimeout);
    return dispose;
  }, [delayUntilIdle, idleTimeout, isIdleReady]);

  // 동적으로 AdSense 스크립트 삽입 (data-nscript 속성 문제 회피)
  useEffect(() => {
    if (!canLoadAds || (delayUntilIdle && !isIdleReady) || scriptLoaded.current) {
      return;
    }

    // 이미 스크립트가 존재하는지 확인
    if (document.getElementById(ADSENSE_SCRIPT_ID)) {
      scriptLoaded.current = true;
      return;
    }

    const script = document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.async = true;
    script.crossOrigin = 'anonymous';

    document.head.appendChild(script);
    scriptLoaded.current = true;
  }, [canLoadAds, delayUntilIdle, isIdleReady, clientId]);

  return null;
}

export default ConsentAwareAdsense;

