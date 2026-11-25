import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BusinessInquiryForm from '@/components/charts/BusinessInquiryForm';
import en from '@/public/locales/en.json';
import type { BusinessCopy } from '@/lib/charts/business-copy';

const copy = (en as unknown as { kpop_business: BusinessCopy }).kpop_business;
const fill = () => {
  fireEvent.change(screen.getByLabelText(copy.company), { target: { value: 'PICNIC' } });
  fireEvent.change(screen.getByLabelText(copy.email), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText(copy.message), { target: { value: 'We would like a business report.' } });
  fireEvent.click(screen.getByRole('checkbox'));
};
afterEach(() => vi.unstubAllGlobals());

describe('business inquiry form', () => {
  it('links to localized privacy and prevents invalid or unconsented submissions', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<BusinessInquiryForm locale="en" copy={copy} />);
    expect(screen.getByRole('link', { name: copy.privacy })).toHaveAttribute('href', '/en/privacy');
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.companyError)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.company)).toHaveFocus();
    expect(screen.getByText(copy.consentError)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps a UUID on retry, omits credentials, and clears the fields only after accepted', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ status: 'accepted' }));
    vi.stubGlobal('fetch', fetcher);
    render(<BusinessInquiryForm locale="en" copy={copy} />); fill();
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    await screen.findByText(copy.error);
    expect(screen.getByLabelText(copy.company)).toHaveValue('PICNIC');
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    await screen.findByText(copy.success);
    const first = JSON.parse(fetcher.mock.calls[0][1].body), second = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(first.request_id).toMatch(/^[a-f0-9-]{36}$/i);
    expect(second.request_id).toBe(first.request_id);
    expect(fetcher.mock.calls[0][0]).toBe('/api/kpop-chart/business');
    expect(fetcher.mock.calls[0][1].credentials).toBe('omit');
    expect(screen.queryByLabelText(copy.company)).toBeNull();
  });

  it('retains editable fields on conflict and explicitly starts a fresh UUID for revised details', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: 'conflict' }, { status: 409 })).mockResolvedValueOnce(Response.json({ status: 'accepted' }));
    vi.stubGlobal('fetch', fetcher);
    render(<BusinessInquiryForm locale="en" copy={copy} />); fill();
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    await screen.findByText(copy.conflict);
    fireEvent.change(screen.getByLabelText(copy.company), { target: { value: 'Updated company' } });
    fireEvent.click(screen.getByRole('button', { name: copy.newRequest }));
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    await screen.findByText(copy.success);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).request_id).not.toBe(JSON.parse(fetcher.mock.calls[0][1].body).request_id);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).company).toBe('Updated company');
  });

  it('prevents duplicate submissions while busy and reports rate limiting', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; })));
    render(<BusinessInquiryForm locale="en" copy={copy} />); fill();
    fireEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(screen.getByRole('button', { name: copy.busy })).toBeDisabled();
    expect(screen.getByLabelText(copy.company)).toBeDisabled();
    resolve(Response.json({ status: 'rate_limited' }, { status: 429 }));
    await waitFor(() => expect(screen.getByText(copy.rateLimited)).toBeInTheDocument());
    expect(screen.getByLabelText(copy.company)).toBeEnabled();
  });
});
