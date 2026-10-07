'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Record a plain DOM anchor without router prefetch. */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// This page is copied into app only during the local envelope build.
export default function BrowserPrivacyFixture() {
  useEffect(() => {
    Object.assign(window, {
      runPrivacyFixture: async () => {
        const url = `${location.origin}/callback?code=privacy-error-query#privacy-error-fragment`;
        Sentry.addBreadcrumb({ category: 'navigation', data: { from: url, to: 'callback?code=privacy-relative-query' } });
        Sentry.captureException(new Error(`browser-privacy-error ${url}`));
        await Sentry.startSpan({ name: `browser-privacy-transaction ${url}`, op: 'privacy-test', forceTransaction: true }, async () => {
          await Sentry.startSpan({ name: `GET ${url}`, op: 'http.client', attributes: { 'http.url': url } }, async () => {
            await fetch('/api/envelope-test/browser/data?token=privacy-fetch-query');
          });
        });
        document.getElementById('fixture-link')?.setAttribute('href', '/changed?token=privacy-mutation-query#private');
        history.pushState({}, '', '/api/envelope-test/browser?code=privacy-navigation-query#privacy-navigation-fragment');
        await new Promise((resolve) => setTimeout(resolve, 6000));
        await Sentry.getReplay()?.flush();
        await Sentry.flush(10000);
      },
      privacyReplayReady: () => !!Sentry.getReplay()?.getReplayId(),
    });
  }, []);
  return <html lang="ko"><body>
    <h1>브라우저 개인정보 테스트</h1>
    <a id="fixture-link" href="/callback?code=privacy-dom-query#privacy-dom-fragment">링크</a>
    <div id="fixture-style" style={{ backgroundImage: 'url("/asset?token=privacy-css-query")', color: 'rgb(1, 2, 3)' }}>마스킹 대상</div>
    <input defaultValue="privacy-input-value" />
  </body></html>;
}
