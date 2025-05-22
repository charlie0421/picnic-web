import React from 'react';
import { render, screen } from '@testing-library/react';
import BannerAd from '@/components/ui/BannerAd';

// AdSense 컴포넌트 모킹
jest.mock('@/components/ui/AdSense', () => {
  return jest.fn((props) => (
    <div data-testid="mock-adsense" data-props={JSON.stringify(props)}>
      AdSense Mock
    </div>
  ));
});

describe('BannerAd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a top banner with correct props', () => {
    render(<BannerAd position="top" />);
    
    const bannerContainer = screen.getByTestId('mock-adsense').parentElement;
    expect(bannerContainer).toHaveClass('banner-ad top-banner');
    
    // AdSense 모킹 컴포넌트로부터 props 추출
    const propsData = JSON.parse(screen.getByTestId('mock-adsense').getAttribute('data-props') || '{}');
    
    // 필수 props 검증
    expect(propsData.client).toBe('ca-pub-YOUR_PUBLISHER_ID');
    expect(propsData.slot).toBe('YOUR_TOP_BANNER_SLOT_ID');
    expect(propsData.format).toBe('auto');
    expect(propsData.responsive).toBe('true');
    expect(propsData.style).toEqual({
      display: 'block',
      width: '728px',
      height: '90px',
      margin: '0 auto'
    });
  });

  it('renders a bottom banner with correct props', () => {
    render(<BannerAd position="bottom" />);
    
    const bannerContainer = screen.getByTestId('mock-adsense').parentElement;
    expect(bannerContainer).toHaveClass('banner-ad bottom-banner');
    
    // AdSense 모킹 컴포넌트로부터 props 추출
    const propsData = JSON.parse(screen.getByTestId('mock-adsense').getAttribute('data-props') || '{}');
    
    // 필수 props 검증
    expect(propsData.client).toBe('ca-pub-YOUR_PUBLISHER_ID');
    expect(propsData.slot).toBe('YOUR_BOTTOM_BANNER_SLOT_ID');
    expect(propsData.format).toBe('auto');
  });

  it('renders a sidebar banner with correct props', () => {
    render(<BannerAd position="sidebar" />);
    
    const bannerContainer = screen.getByTestId('mock-adsense').parentElement;
    expect(bannerContainer).toHaveClass('banner-ad sidebar-banner');
    
    // AdSense 모킹 컴포넌트로부터 props 추출
    const propsData = JSON.parse(screen.getByTestId('mock-adsense').getAttribute('data-props') || '{}');
    
    // 필수 props 검증
    expect(propsData.slot).toBe('YOUR_SIDEBAR_BANNER_SLOT_ID');
    expect(propsData.style).toEqual({
      display: 'block',
      width: '300px',
      height: '600px'
    });
  });

  it('applies custom className prop correctly', () => {
    const customClass = 'custom-test-class';
    render(<BannerAd position="top" className={customClass} />);
    
    const bannerContainer = screen.getByTestId('mock-adsense').parentElement;
    expect(bannerContainer).toHaveClass('banner-ad top-banner');
    expect(bannerContainer).toHaveClass(customClass);
  });
}); 