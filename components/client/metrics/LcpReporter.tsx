'use client';

import { useEffect } from 'react';

type LcpEntry = LargestContentfulPaint & {
  element?: Element;
};

let hasLogged = false;

const serializeElement = (element: Element | undefined | null) => {
  if (!element) {
    return null;
  }

  const base: Record<string, unknown> = {
    tag: element.tagName,
  };

  if (element instanceof HTMLElement) {
    base.id = element.id || undefined;
    base.className = element.className || undefined;
    base.textContent =
      element instanceof HTMLImageElement
        ? undefined
        : element.textContent?.trim()?.slice(0, 80) || undefined;
  }

  if (element instanceof HTMLImageElement) {
    base.src = element.currentSrc || element.src || undefined;
    base.alt = element.alt || undefined;
  }

  return base;
};

const logLcp = (entry: LcpEntry) => {
  if (hasLogged) {
    return;
  }
  hasLogged = true;

  const elementInfo = serializeElement(entry.element ?? null);
  const payload = {
    value: entry.renderTime || entry.loadTime || entry.startTime,
    size: entry.size,
    url: entry.url || (entry.element instanceof HTMLImageElement ? entry.element.currentSrc : undefined),
    element: elementInfo,
  };

  if (typeof window !== 'undefined') {
    (window as any).__PICNIC_LCP__ = payload;
  }

  // eslint-disable-next-line no-console
  console.info('[perf] LCP candidate', payload);
};

export function LcpReporter() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (
      !('performance' in window) ||
      typeof (window as any).PerformanceObserver !== 'function'
    ) {
      return;
    }

    try {
      let latestEntry: LcpEntry | null = null;

      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          latestEntry = entry as LcpEntry;
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && latestEntry) {
          logLcp(latestEntry);
          observer.disconnect();
        }
      };

      const handlePageHide = () => {
        if (latestEntry) {
          logLcp(latestEntry);
        }
        observer.disconnect();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', handlePageHide);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pagehide', handlePageHide);
        observer.disconnect();
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[perf] LCP observer failed', error);
    }
  }, []);

  return null;
}

