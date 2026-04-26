import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/utils/image-utils', () => ({
  createImageErrorHandler: () => vi.fn(),
  isFailedImageUrl: (url: string) => url.includes('failed'),
  resolveAvatarUrlClient: vi.fn(
    async (src: string | null | undefined, _opts: any, config: any) => {
      if (!src) return { url: config?.fallbackUrl || '/images/default-avatar.svg', isFallback: true };
      if (src.includes('error')) throw new Error('Network error');
      return { url: src, isFallback: false };
    },
  ),
}));

import { SafeAvatar, SimpleAvatar } from '@/components/ui/SafeAvatar';

describe('SafeAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<SafeAvatar />);
    expect(container).toBeTruthy();
  });

  it('renders img element', async () => {
    render(<SafeAvatar src="https://example.com/avatar.jpg" />);
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  it('uses fallback when src is null', async () => {
    render(<SafeAvatar src={null} />);
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/images/default-avatar.svg');
    });
  });

  it('uses custom fallbackUrl', async () => {
    render(<SafeAvatar src={null} fallbackUrl="/custom-fallback.svg" />);
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/custom-fallback.svg');
    });
  });

  it('uses fallback for failed image URLs', async () => {
    render(<SafeAvatar src="https://failed.example.com/avatar.jpg" />);
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/images/default-avatar.svg');
    });
  });

  it('renders with default alt text', () => {
    render(<SafeAvatar />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', expect.stringContaining('프로필'));
  });

  it('renders with custom alt text', () => {
    render(<SafeAvatar alt="User Avatar" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'User Avatar');
  });

  it('applies correct size class for sm', () => {
    render(<SafeAvatar size="sm" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-8');
  });

  it('applies correct size class for lg', () => {
    render(<SafeAvatar size="lg" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-16');
  });

  it('applies correct size class for xl', () => {
    render(<SafeAvatar size="xl" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-24');
  });

  it('applies custom className', () => {
    render(<SafeAvatar className="extra-class" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('extra-class');
  });

  it('calls onImageError when resolution fails', async () => {
    const onError = vi.fn();
    render(
      <SafeAvatar src="https://error.example.com/avatar.jpg" onImageError={onError} />,
    );
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('https://error.example.com/avatar.jpg');
    });
  });

  it('shows loading state initially when src is provided', () => {
    const { container } = render(
      <SafeAvatar src="https://example.com/avatar.jpg" />,
    );
    const loadingPlaceholder = container.querySelector('.animate-pulse');
    expect(loadingPlaceholder).toBeTruthy();
  });

  it('has rounded-full class', () => {
    render(<SafeAvatar />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('rounded-full');
  });
});

describe('SimpleAvatar', () => {
  it('renders without crashing', () => {
    const { container } = render(<SimpleAvatar />);
    expect(container).toBeTruthy();
  });

  it('renders img element', () => {
    render(<SimpleAvatar />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('uses fallback when src is null', () => {
    render(<SimpleAvatar src={null} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/images/default-avatar.svg');
  });

  it('applies size class', () => {
    render(<SimpleAvatar size="lg" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-16');
  });

  it('has rounded-full class', () => {
    render(<SimpleAvatar />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('rounded-full');
  });
});
