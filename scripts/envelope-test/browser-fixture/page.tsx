'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Record a plain DOM anchor without router prefetch. */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import '@/app/[lang]/globals.css';

// This page is copied into app only during the local envelope build.
export default function BrowserPrivacyFixture() {
  useEffect(() => {
    Object.assign(window, {
      runPrivacyFixture: async () => {
        const url = `${location.origin}/callback?code=privacy-error-query#privacy-error-fragment`;
        const consoleValue = { url: '/callback?code=privacy-console-query' };
        // eslint-disable-next-line no-console -- Verify the real SDK console instrumentation preserves caller data.
        console.warn('browser-privacy-console', consoleValue);
        if (consoleValue.url !== '/callback?code=privacy-console-query') throw new Error('Console instrumentation mutated caller data');
        Sentry.addBreadcrumb({ category: 'navigation', data: { from: url, to: 'callback?code=privacy-relative-query' } });
        Sentry.addBreadcrumb({ category: 'fixture.large', data: { arguments: Array(12000).fill('/a?code=privacy-large-query') }, message: 'large-safe', level: 'warning' });
        Sentry.captureException(new Error(`browser-privacy-error ${url}`));
        await Sentry.startSpan({ name: `browser-privacy-transaction ${url}`, op: 'privacy-test', forceTransaction: true }, async () => {
          await Sentry.startSpan({ name: `GET ${url}`, op: 'http.client', attributes: { 'http.url': url } }, async () => {
            await fetch('/api/envelope-test/browser/data?token=privacy-fetch-query');
          });
        });
        document.getElementById('fixture-link')?.setAttribute('href', '/changed?token=privacy-mutation-query#private');
        const style = document.getElementById('fixture-sheet') as HTMLStyleElement;
        style.sheet!.insertRule('.dynamic{background:url(img?privacy-rule-query)}', 0);
        (style.sheet!.cssRules[0] as CSSStyleRule).style.setProperty('background', 'url(img?privacy-declaration-query)');
        (style.sheet!.cssRules[0] as CSSStyleRule).style.setProperty('filter', 'url(#fixture-shadow)');
        const addedStyle = document.createElement('style');
        addedStyle.textContent = '.added{background:url(img?privacy-added-query)}';
        document.head.appendChild(addedStyle);
        await new Promise((resolve) => setTimeout(resolve, 100));
        addedStyle.firstChild!.textContent = '.changed{background:url(img?privacy-text-query)}';
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
    <style id="fixture-sheet">{'.hover\\:bg-privacy:hover{background:url("/asset?token=privacy-sheet-query");color:#fff}.w-1\\/2{width:50%}'}</style>
    <a id="fixture-link" href="/callback?code=privacy-dom-query#privacy-dom-fragment">링크</a>
    <div id="fixture-style" style={{ backgroundImage: 'url("/asset?token=privacy-css-query")', color: 'rgb(1, 2, 3)' }}>마스킹 대상</div>
    <svg id="fixture-svg" width="100" height="100">
      <defs><linearGradient id="fixture-gradient"><stop stopColor="red" /></linearGradient><path id="fixture-shape" d="M0 0h10v10z" /></defs>
      <rect id="fixture-rect" width="100" height="100" fill="url(#fixture-gradient)" />
      <use id="fixture-use" href="#fixture-shape" />
    </svg>
    <input defaultValue="privacy-input-value" />
    <div data-escaped-query={String.raw`/callback\?code=privacy-escaped-query`}
      data-escaped-fragment={String.raw`/callback\#privacy-escaped-fragment`}
      data-hex-query={String.raw`/callback\3f code=privacy-hex-query`}
      data-hex-fragment={String.raw`/callback\23 privacy-hex-fragment`}
      data-escaped-root={String.raw`\2f callback#privacy-root-fragment`}>정규식 자료</div>
  </body></html>;
}
