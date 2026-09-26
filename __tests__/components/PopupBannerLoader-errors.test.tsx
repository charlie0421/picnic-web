import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ErrorBoundary } from 'react-error-boundary';

/**
 * PopupBannerLoader 는 전역 레이아웃에 에러 바운더리 없이 마운트된다.
 * /api/popups 가 비정상 응답(500·배열이 아닌 JSON)을 줘도 렌더가 깨지면 안 된다.
 */
vi.mock('@/components/client/vote/dialogs/PopupBanner', () => ({
  default: ({ slides }: { slides: unknown[] }) => <div data-testid="popup-banner">{slides.length}</div>,
}));

import PopupBannerLoader from '@/components/client/common/PopupBannerLoader';

const renderLoader = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ErrorBoundary fallback={<div data-testid="crashed" />}>
        <PopupBannerLoader />
      </ErrorBoundary>
    </SWRConfig>,
  );

describe('PopupBannerLoader — 비정상 응답 방어', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('500 {error} 응답이어도 렌더가 깨지지 않고 배너를 띄우지 않는다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Failed to fetch popups' }), { status: 500 }),
    );
    const { queryByTestId } = renderLoader();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(queryByTestId('crashed')).toBeNull();
    expect(queryByTestId('popup-banner')?.textContent ?? '0').toBe('0');
  });

  it('200 이지만 배열이 아닌 JSON 이어도 깨지지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    const { queryByTestId } = renderLoader();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(queryByTestId('crashed')).toBeNull();
    expect(queryByTestId('popup-banner')?.textContent ?? '0').toBe('0');
  });
});
