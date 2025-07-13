/**
 * NavigationLink 컴포넌트 테스트
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../utils/test-utils';
import NavigationLink from '../../../components/client/NavigationLink';

// Next.js navigation hooks 모킹
const mockPush = jest.fn();
const mockPathname = '/ko/vote';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => mockPathname,
}));

// useLocaleRouter 모킹
const mockExtractLocaleFromPath = jest.fn();
const mockGetLocalizedPath = jest.fn();

jest.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    extractLocaleFromPath: mockExtractLocaleFromPath,
    getLocalizedPath: mockGetLocalizedPath,
    currentLocale: 'ko',
  }),
}));

// GlobalLoadingContext 모킹
const mockSetIsLoading = jest.fn();

jest.mock('@/contexts/GlobalLoadingContext', () => ({
  useGlobalLoading: () => ({
    setIsLoading: mockSetIsLoading,
  }),
}));

describe('NavigationLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 기본 모킹 설정
    mockExtractLocaleFromPath.mockImplementation((path: string) => {
      if (path.startsWith('/ko/')) {
        return { locale: 'ko', path: path.replace('/ko', '') || '/' };
      }
      if (path.startsWith('/en/')) {
        return { locale: 'en', path: path.replace('/en', '') || '/' };
      }
      return { locale: 'ko', path: path };
    });
    
    mockGetLocalizedPath.mockImplementation((path: string, locale: string) => {
      return `/${locale}${path === '/' ? '' : path}`;
    });
  });

  it('renders the navigation link correctly', () => {
    renderWithProviders(
      <NavigationLink href="/test-page">
        Test Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'Test Link' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Test Link');
  });

  it('applies custom className correctly', () => {
    renderWithProviders(
      <NavigationLink href="/test" className="custom-class">
        Custom Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'Custom Link' });
    expect(link).toHaveClass('custom-class');
    expect(link).toHaveClass('opacity-100');
  });

  it('navigates to different page when clicked', () => {
    // 현재 경로와 다른 경로 설정
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/mypage' }); // target path
    
    mockGetLocalizedPath.mockReturnValue('/ko/mypage');

    renderWithProviders(
      <NavigationLink href="/mypage">
        My Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'My Page' });
    fireEvent.click(link);
    
    expect(mockSetIsLoading).toHaveBeenCalledWith(true);
    expect(mockPush).toHaveBeenCalledWith('/ko/mypage');
  });

  it('cancels navigation when clicking same page', () => {
    // 현재 경로와 같은 경로 설정
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }); // target path

    const mockOnClick = jest.fn();

    renderWithProviders(
      <NavigationLink href="/vote" onClick={mockOnClick}>
        Vote Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'Vote Page' });
    fireEvent.click(link);
    
    // 네비게이션은 취소되어야 함
    expect(mockSetIsLoading).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    
    // onClick 콜백은 실행되어야 함 (메뉴 닫기 등을 위해)
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('handles localized paths correctly', () => {
    // 로케일화되지 않은 href가 전달된 경우
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/mypage' }); // target path
    
    mockGetLocalizedPath.mockReturnValue('/ko/mypage');

    renderWithProviders(
      <NavigationLink href="/mypage">
        My Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'My Page' });
    fireEvent.click(link);
    
    expect(mockGetLocalizedPath).toHaveBeenCalledWith('/mypage', 'ko');
    expect(mockPush).toHaveBeenCalledWith('/ko/mypage');
  });

  it('handles already localized paths correctly', () => {
    // 이미 로케일화된 href가 전달된 경우
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/mypage' }); // target path

    renderWithProviders(
      <NavigationLink href="/ko/mypage">
        My Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'My Page' });
    fireEvent.click(link);
    
    // 이미 로케일화된 경우 getLocalizedPath가 호출되지 않아야 함
    expect(mockPush).toHaveBeenCalledWith('/ko/mypage');
  });

  it('supports keyboard navigation', () => {
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/mypage' }); // target path
    
    mockGetLocalizedPath.mockReturnValue('/ko/mypage');

    renderWithProviders(
      <NavigationLink href="/mypage">
        My Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'My Page' });
    
    // Enter 키 테스트
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(mockPush).toHaveBeenCalledWith('/ko/mypage');
    
    jest.clearAllMocks();
    
    // Space 키 테스트
    fireEvent.keyDown(link, { key: ' ' });
    expect(mockPush).toHaveBeenCalledWith('/ko/mypage');
  });

  it('maintains accessibility with proper button semantics', () => {
    renderWithProviders(
      <NavigationLink href="/accessible-page">
        Accessible Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('button');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).toHaveAttribute('role', 'button');
  });

  it('passes through additional accessibility props', () => {
    renderWithProviders(
      <NavigationLink 
        href="/test" 
        aria-label="Custom navigation link"
        title="Custom title"
      >
        Props Test
      </NavigationLink>
    );
    
    const link = screen.getByRole('button');
    expect(link).toHaveAttribute('aria-label', 'Custom navigation link');
    expect(link).toHaveAttribute('title', 'Custom title');
  });

  it('renders children correctly', () => {
    renderWithProviders(
      <NavigationLink href="/children-test">
        <span>Child Element</span>
        <strong>Bold Text</strong>
      </NavigationLink>
    );
    
    expect(screen.getByText('Child Element')).toBeInTheDocument();
    expect(screen.getByText('Bold Text')).toBeInTheDocument();
  });

  it('shows navigating state correctly', () => {
    mockExtractLocaleFromPath
      .mockReturnValueOnce({ locale: 'ko', path: '/vote' }) // current path
      .mockReturnValueOnce({ locale: 'ko', path: '/mypage' }); // target path
    
    mockGetLocalizedPath.mockReturnValue('/ko/mypage');

    renderWithProviders(
      <NavigationLink href="/mypage">
        My Page
      </NavigationLink>
    );
    
    const link = screen.getByRole('button', { name: 'My Page' });
    
    // 초기 상태는 opacity-100
    expect(link).toHaveClass('opacity-100');
    
    fireEvent.click(link);
    
    // 클릭 후에는 opacity-90 (navigating 상태)
    expect(link).toHaveClass('opacity-90');
  });
}); 