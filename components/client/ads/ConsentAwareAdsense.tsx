'use client';

import { useEffect, useState, useCallback } from 'react';
import Script from 'next/script';

interface ConsentAwareAdsenseProps {
  clientId: string;
  delayUntilIdle?: boolean;
  idleTimeout?: number;
}

const CONSENT_STORAGE_KEY = 'picnic-cookie-consent';
const CONSENT_UPDATED_EVENT = 'picnic-consent-updated';

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

  if (!canLoadAds || (delayUntilIdle && !isIdleReady)) {
    return null;
  }

  return (
    <Script
      id='adsense-script'
      strategy='lazyOnload'
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin='anonymous'
    />
  );
}

export default ConsentAwareAdsense;

