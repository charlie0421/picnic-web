import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/utils/api/strings', () => ({
  getLocalizedString: (val: any) => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val.en || val.ko || '';
    return '';
  },
}));

vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: (props: any) => (
    <img src={props.src} alt={props.alt} data-testid="optimized-image" />
  ),
}));

import { BannerItem } from '@/components/client/banner/BannerItem';

describe('BannerItem', () => {
  const baseBanner = {
    id: 1,
    celeb_id: null,
    created_at: null,
    deleted_at: null,
    duration: null,
    end_at: null,
    image: 'https://example.com/banner.jpg',
    link: null,
    link_target_id: null,
    link_type: null,
    location: null,
    order: null,
    start_at: null,
    thumbnail: null,
    title: 'Test Banner' as any,
    updated_at: null,
  };

  it('renders without crashing', () => {
    const { container } = render(<BannerItem banner={baseBanner} />);
    expect(container).toBeTruthy();
  });

  it('renders image when banner has image', () => {
    render(<BannerItem banner={baseBanner} />);
    expect(screen.getByTestId('optimized-image')).toBeInTheDocument();
  });

  it('renders title overlay when both title and image exist', () => {
    render(<BannerItem banner={baseBanner} />);
    expect(screen.getByText('Test Banner')).toBeInTheDocument();
  });

  it('renders title as fallback when no image', () => {
    const noImageBanner = { ...baseBanner, image: null };
    render(<BannerItem banner={noImageBanner} />);
    expect(screen.getByText('Test Banner')).toBeInTheDocument();
  });

  it('wraps in a link when banner has link', () => {
    const linkedBanner = { ...baseBanner, link: 'https://example.com' };
    render(<BannerItem banner={linkedBanner} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('does not wrap in a link when banner has no link', () => {
    render(<BannerItem banner={baseBanner} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sets aria-label from title when link exists', () => {
    const linkedBanner = { ...baseBanner, link: 'https://example.com' };
    render(<BannerItem banner={linkedBanner} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'Test Banner');
  });

  it('uses priority prop for image loading', () => {
    render(<BannerItem banner={baseBanner} priority={true} />);
    const img = screen.getByTestId('optimized-image');
    expect(img).toBeInTheDocument();
  });
});
