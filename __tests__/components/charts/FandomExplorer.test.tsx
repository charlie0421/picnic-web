import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FandomExplorer from '@/components/charts/FandomExplorer';
import en from '@/public/locales/en.json';

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/en/charts/artists',
    useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])('rejects a search result from the other data source (preview=%s)', async (preview) => {
    const subject = { entity: 'group', id: '11', name: { en: 'Unmatched source' }, group_name: null };
    const headers = new Headers();
    if (!preview) headers.set('X-Picnic-Data', 'synthetic');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([subject], { headers })));
    render(<FandomExplorer locale="en" chart={en.kpop_dashboard} copy={en.kpop_fandom} preview={preview} />);
    fireEvent.change(screen.getByPlaceholderText(en.kpop_fandom.searchHint), { target: { value: 'source' } });
    await screen.findByText(en.kpop_dashboard.error + ' · ' + en.kpop_dashboard.retry);
    expect(screen.queryByText('Unmatched source')).toBeNull();
});
