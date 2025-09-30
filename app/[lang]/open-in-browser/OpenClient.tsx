'use client';

import { useEffect } from 'react';

export default function OpenClient() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      try {
        const msg = e?.message || '알 수 없는 오류가 발생했습니다.';
        alert(`오류가 발생했습니다.\n${msg}`);
      } catch {}
    }
    function onRejection(e: PromiseRejectionEvent) {
      try {
        const msg = (e?.reason && (e.reason.message || e.reason.toString?.())) || '알 수 없는 오류가 발생했습니다.';
        alert(`오류가 발생했습니다.\n${msg}`);
      } catch {}
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection as any);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection as any);
    };
  }, []);

  return null;
}


