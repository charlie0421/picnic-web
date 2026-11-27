import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import { businessCopyKeys, type BusinessCopy } from '@/lib/charts/business-copy';

vi.mock('@/app/shell', () => ({ inter: { className: 'font-inter' } }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('@/lib/i18n/server', () => ({
  getTranslations: async (locale: string) => {
    const { readFileSync } = await import('node:fs');
    const dictionary = JSON.parse(readFileSync(`public/locales/${locale}.json`, 'utf8'));
    return (key: string): string => key.split('.').reduce((value, part) => value?.[part], dictionary) ?? `[${key}]`;
  },
}));

import BusinessPage, { generateMetadata } from '@/app/(business)/[lang]/charts/business/page';
import BusinessLayout from '@/app/(business)/[lang]/layout';

describe('localized first-party business route', () => {
  it.each(SUPPORTED_LANGUAGES)('renders complete %s copy and same-origin navigation', async lang => {
    const dictionary = JSON.parse(fs.readFileSync(path.join('public/locales', `${lang}.json`), 'utf8'));
    const copy: BusinessCopy = dictionary.kpop_business;
    for (const key of businessCopyKeys) expect(copy[key]).toEqual(expect.any(String));
    render(await BusinessPage({ params: Promise.resolve({ lang }) }));
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.company)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.back })).toHaveAttribute('href', `/${lang}/charts`);
    expect(screen.getByRole('link', { name: copy.privacy })).toHaveAttribute('href', `/${lang}/privacy`);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('generates canonical and alternate URLs for the actual business route', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'ko' }) });
    expect(metadata.alternates?.canonical).toBe('https://chart.picnic.fan/ko/charts/business');
    expect(metadata.alternates?.languages?.['zh-TW']).toBe('https://chart.picnic.fan/zh-tw/charts/business');
  });

  it('provides its own localized document without the tracked application shell', async () => {
    const html = await BusinessLayout({ params: Promise.resolve({ lang: 'zh-tw' }), children: 'intake' }) as ReactElement<{ lang: string; children: ReactElement<{ children: ReactElement<{ children: string }> }> }>;
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('zh-TW');
    expect(html.props.children.type).toBe('body');
    const main = html.props.children.props.children;
    expect(main.type).toBe('main');
    expect(main.props.children).toBe('intake');
    await expect(BusinessLayout({ params: Promise.resolve({ lang: 'fr' }), children: 'intake' })).rejects.toThrow('not-found');
  });
});
