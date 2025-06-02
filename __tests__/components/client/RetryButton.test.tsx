/**
 * RetryButton 컴포넌트 테스트
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { renderWithProviders } from '../../utils/test-utils';
import { RetryButton } from '../../../components/client/RetryButton';

// Next.js router 모킹
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('RetryButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    } as any);
  });

  it('renders the retry button correctly', () => {
    renderWithProviders(<RetryButton />);
    
    const button = screen.getByRole('button', { name: '로그인으로 돌아가기' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('px-4', 'py-2', 'bg-primary-500', 'text-white', 'rounded-lg');
  });

  it('navigates to default login path when clicked', () => {
    renderWithProviders(<RetryButton />);
    
    const button = screen.getByRole('button', { name: '로그인으로 돌아가기' });
    fireEvent.click(button);
    
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('navigates to custom redirect path when provided', () => {
    const customPath = '/custom-login';
    renderWithProviders(<RetryButton redirectPath={customPath} />);
    
    const button = screen.getByRole('button', { name: '로그인으로 돌아가기' });
    fireEvent.click(button);
    
    expect(mockPush).toHaveBeenCalledWith(customPath);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('has proper hover styles', () => {
    renderWithProviders(<RetryButton />);
    
    const button = screen.getByRole('button', { name: '로그인으로 돌아가기' });
    expect(button).toHaveClass('hover:bg-primary-600', 'transition-colors');
  });

  it('handles multiple clicks correctly', () => {
    renderWithProviders(<RetryButton />);
    
    const button = screen.getByRole('button', { name: '로그인으로 돌아가기' });
    
    // 여러 번 클릭
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    
    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('is accessible with proper button role and text', () => {
    renderWithProviders(<RetryButton />);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('로그인으로 돌아가기');
    
    // 버튼이 클릭 가능한지 확인
    expect(button).not.toBeDisabled();
  });
}); 