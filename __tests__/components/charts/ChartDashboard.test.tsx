import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChartDashboard from '@/components/charts/ChartDashboard';
import en from '@/public/locales/en.json';
import type { ChartCopy } from '@/lib/charts/copy';

const copy = en.kpop_dashboard as ChartCopy;
const fixture = () => ({
  schema_version: 1, status: 'ready', published_at: new Date().toISOString(), refresh_due_at: new Date(Date.now() + 86400000).toISOString(),
  period: { start: new Date(Date.parse(new Date().toISOString().slice(0, 10)) - 7 * 86400000).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10), days: 7 },
  filters: { country: 'ALL', entity: 'artist', group_mode: 'direct', group_gender: 'all', metric: 'voters' },
  available_countries: ['ALL', 'KR'], available_days: [7, 30, 90],
  summary: Object.fromEntries(['voters', 'votes', 'purchaser_voters', 'growth_pct'].map(key => [key, { status: 'available', value: 100 }])),
  rankings: [{ id: '1', name: { en: 'Test Artist' }, entity: 'artist', gender: null, rank: 1, value: { status: 'available', value: 100 }, growth_pct: { status: 'unavailable', value: null } }], series: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('public chart experience', () => {
  it('clears the previous scope while loading another one and reports a failed fetch honestly', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(fixture())).mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    render(<ChartDashboard locale="en" copy={copy} />);
    await screen.findByText('Test Artist');
    fireEvent.change(screen.getByLabelText(copy.entity), { target: { value: 'group' } });
    expect(screen.queryByText('Test Artist')).toBeNull();
    await screen.findByRole('button', { name: copy.retry });
    expect(screen.getByRole('link', { name: copy.b2bAction })).toHaveAttribute('href', '/en/charts/business');
    expect(screen.getByRole('group', { name: copy.groupMode })).toBeInTheDocument();
  });
  it('does not show identifying rows from a suppressed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...fixture(), status: 'suppressed' })));
    render(<ChartDashboard locale="en" copy={copy} />);
    await waitFor(() => expect(screen.queryByText(copy.loading)).toBeNull());
    const table = screen.getByRole('table', { name: `${copy.ranking} · ${copy.voters}` });
    expect(within(table).queryByText('Test Artist')).toBeNull();
    expect(within(table).getByText(copy.suppressed)).toBeInTheDocument();
    expect(screen.getByText(copy.sampleBadge, { selector: 'span' })).toBeInTheDocument();
  });
  it('opens the Indonesian girl-group market and orders published rows by growth', async () => {
    const base = fixture();
    const row = base.rankings[0];
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(base)).mockResolvedValueOnce(Response.json({
      ...base, available_countries: ['ALL','ID'], period: { ...base.period, days: 30, start: new Date(Date.parse(base.period.end) - 30 * 86400000).toISOString().slice(0,10) },
      filters: { ...base.filters, country: 'ID', entity: 'group', group_mode: 'member_rollup', group_gender: 'female' },
      rankings: [
        { ...row, entity: 'group', gender: 'female', name: { en: 'Group One' }, growth_pct: { status: 'available', value: 5 } },
        { ...row, id: '2', entity: 'group', gender: 'female', name: { en: 'Group Two' }, rank: 2, growth_pct: { status: 'available', value: 40 } },
      ]
    }));
    vi.stubGlobal('fetch', fetcher);
    render(<ChartDashboard locale="en" copy={copy} />);
    await screen.findByText('Test Artist');
    fireEvent.click(screen.getByRole('button', { name: copy.indonesiaMarket }));
    await screen.findByText('Group Two');
    const rows = () => screen.getAllByRole('rowheader').map(cell => cell.textContent);
    expect(rows()[0]).toContain('Group Two');
    expect(screen.getByLabelText(copy.country)).toHaveValue('ID');
    expect(screen.getByLabelText(copy.gender)).toHaveValue('female');
    fireEvent.change(screen.getByLabelText(copy.orderBy), { target: { value: 'metric' } });
    expect(rows()[0]).toContain('Group One');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('identifies rankings that use existing profile countries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...fixture(), country_basis: 'profile_at_publication' })));
    render(<ChartDashboard locale="en" copy={copy} />);
    await screen.findByText('Test Artist');
    expect(screen.getByText(copy.profileCountryNote)).toBeInTheDocument();
    expect(screen.queryByText(copy.countryNote)).toBeNull();
  });
  it('marks the dashboard itself when a deployment serves synthetic votes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(fixture())));
    render(<ChartDashboard locale="en" copy={copy} syntheticPreview />);
    await screen.findByText('Test Artist');
    expect(screen.getByRole('note', {name: copy.sampleBadge})).toHaveTextContent(copy.sampleBadge);
  });
  it('always offers a same-origin localized inquiry route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(fixture())));
    render(<ChartDashboard locale="ko" copy={copy} />);
    await screen.findByText('Test Artist');
    expect(screen.getByRole('link', { name: copy.b2bAction })).toHaveAttribute('href', '/ko/charts/business');
  });
});
