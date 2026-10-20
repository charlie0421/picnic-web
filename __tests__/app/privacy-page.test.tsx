import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const { getPolicy, notFoundError } = vi.hoisted(() => ({
  getPolicy: vi.fn(),
  notFoundError: new Error('NEXT_HTTP_ERROR_FALLBACK;404'),
}));

vi.mock('@/lib/data-fetching/server/policy-service', () => ({ getPolicy }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw notFoundError; },
}));

import PrivacyPage from '@/app/[lang]/(main)/privacy/page';

const props = (lang: string) => ({ params: Promise.resolve({ lang }) });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getPolicy.mockReset();
});

describe.each([
  { lang: 'ko', title: '개인정보처리방침', version: '버전: 2.4', date: '시행일: 2026년 6월 4일', contact: /앱 내 1:1 문의/ },
  { lang: 'en', title: 'Privacy Policy', version: 'Version: 2.4', date: 'Effective date: June 4, 2026', contact: /in-app 1:1 inquiry/i },
])('Privacy page ($lang)', ({ lang, title, version, date, contact }) => {
  it('preserves published policy metadata and does not invent metadata from the render date', async () => {
    getPolicy.mockResolvedValue(`## ${version}\n\n${date}\n\n**PICNIC**`);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const first = render(await PrivacyPage(props(lang)));

    expect(getPolicy).toHaveBeenCalledWith('privacy', lang);
    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    const policy = within(screen.getByRole('main'));
    expect(policy.getByRole('heading', { name: version, level: 2 })).toBeInTheDocument();
    expect(policy.getByText(date)).toBeInTheDocument();
    expect(policy.getByText('PICNIC').tagName).toBe('STRONG');
    const firstMarkup = first.container.innerHTML;
    first.unmount();

    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    const second = render(await PrivacyPage(props(lang)));
    expect(second.container.innerHTML).toBe(firstMarkup);
    expect(screen.queryByText(/(?:Version:|버전:)\s*1\.0/)).not.toBeInTheDocument();
  });

  it('directs questions to the existing in-app inquiry channel without a broken web link', async () => {
    getPolicy.mockResolvedValue('PICNIC');
    render(await PrivacyPage(props(lang)));

    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByText(contact)).toBeInTheDocument();
    expect(footer.queryByRole('link')).not.toBeInTheDocument();
  });
});

it('keeps the 404 response when no privacy policy is available', async () => {
  getPolicy.mockResolvedValue(null);
  await expect(PrivacyPage(props('ko'))).rejects.toBe(notFoundError);
});
