import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockLoadSource = vi.fn();
const mockAttachMedia = vi.fn();
const mockOn = vi.fn();
const mockDestroy = vi.fn();

vi.mock('hls.js', () => {
  class HlsMock {
    loadSource = mockLoadSource;
    attachMedia = mockAttachMedia;
    on = mockOn;
    destroy = mockDestroy;
    startLoad = vi.fn();
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: 'hlsError' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError' };
  }
  return { default: HlsMock };
});

import HlsVideo from '@/components/client/HlsVideo';

describe('HlsVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a video element', () => {
    render(<HlsVideo src="video.mp4" data-testid="hls-video" />);
    expect(screen.getByTestId('hls-video')).toBeInTheDocument();
    expect(screen.getByTestId('hls-video').tagName).toBe('VIDEO');
  });

  it('sets src directly for non-HLS video', () => {
    render(<HlsVideo src="video.mp4" data-testid="hls-video" />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video.src).toContain('video.mp4');
  });

  it('uses HLS.js for m3u8 sources when HLS.js is supported', () => {
    render(<HlsVideo src="stream.m3u8" data-testid="hls-video" />);
    expect(mockLoadSource).toHaveBeenCalledWith('stream.m3u8');
    expect(mockAttachMedia).toHaveBeenCalled();
  });

  it('registers error handler for HLS streams', () => {
    render(<HlsVideo src="stream.m3u8" data-testid="hls-video" />);
    expect(mockOn).toHaveBeenCalledWith('hlsError', expect.any(Function));
  });

  it('passes additional video props', () => {
    render(
      <HlsVideo
        src="video.mp4"
        data-testid="hls-video"
        autoPlay
        muted
        loop
        playsInline
      />,
    );
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video).toHaveAttribute('autoplay');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
  });

  it('renders with className', () => {
    render(<HlsVideo src="video.mp4" data-testid="hls-video" className="custom-video" />);
    expect(screen.getByTestId('hls-video')).toHaveClass('custom-video');
  });

  it('does not crash with empty src', () => {
    render(<HlsVideo src="" data-testid="hls-video" />);
    expect(screen.getByTestId('hls-video')).toBeInTheDocument();
  });
});
