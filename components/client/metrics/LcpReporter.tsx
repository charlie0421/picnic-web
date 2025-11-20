'use client';

import { useEffect } from 'react';

type LcpEntry = LargestContentfulPaint & {
  element?: Element;
};

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

const pushToWindowLog = (payload: Record<string, unknown>) => {
  const globalObject = window as typeof window & {
    __PICNIC_LCP__?: Record<string, unknown>[];
  };
  const existing = Array.isArray(globalObject.__PICNIC_LCP__)
    ? globalObject.__PICNIC_LCP__
    : [];
  existing.push(payload);
  globalObject.__PICNIC_LCP__ = existing.slice(-5);
};

const logLcp = (entry: LcpEntry) => {
  const elementInfo = serializeElement(entry.element ?? null);
  const payload = {
    value: entry.renderTime || entry.loadTime || entry.startTime,
    size: entry.size,
    url: entry.url || (entry.element instanceof HTMLImageElement ? entry.element.currentSrc : undefined),
    element: elementInfo,
    timestamp: Date.now(),
  };

  if (typeof window !== 'undefined') {
    pushToWindowLog(payload);
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.info('[perf] LCP candidate', payload);
  }
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
      let hasFlushed = false;
      let observer: PerformanceObserver | null = null;

      const flush = () => {
        if (hasFlushed || !latestEntry) {
          return;
        }
        hasFlushed = true;
        logLcp(latestEntry);
      };

      observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          latestEntry = entry as LcpEntry;
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          flush();
          observer?.disconnect();
        }
      };

      const handlePageHide = () => {
        flush();
        observer?.disconnect();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', handlePageHide);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pagehide', handlePageHide);
        observer?.disconnect();
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[perf] LCP observer failed', error);
    }
  }, []);

  return null;
}

