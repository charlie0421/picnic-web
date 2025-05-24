/**
 * NavigationLink 컴포넌트 테스트
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../utils/test-utils';
import NavigationLink from '../../../components/client/NavigationLink';

// Next.js Link 컴포넌트 모킹
jest.mock('next/link', () => {
  return function MockLink({ children, href, className, ...props }: any) {
    return (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    );
  };
});

describe('NavigationLink', () => {
  it('renders the navigation link correctly', () => {
    renderWithProviders(
      <NavigationLink href="/test-page">
        Test Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('link', { name: 'Test Link' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test-page');
    expect(link).toHaveTextContent('Test Link');
  });

  it('applies custom className correctly', () => {
    renderWithProviders(
      <NavigationLink href="/test" className="custom-class">
        Custom Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('link', { name: 'Custom Link' });
    expect(link).toHaveClass('custom-class');
    expect(link).toHaveClass('relative');
    expect(link).toHaveClass('opacity-100');
  });

  it('renders with default opacity when not navigating', () => {
    renderWithProviders(
      <NavigationLink href="/default">
        Default Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('link', { name: 'Default Link' });
    expect(link).toHaveClass('opacity-100');
    expect(link).not.toHaveClass('opacity-70');
  });

  it('passes through additional props to Link component', () => {
    renderWithProviders(
      <NavigationLink 
        href="/test" 
        data-testid="custom-link"
        aria-label="Custom navigation link"
      >
        Props Test
      </NavigationLink>
    );
    
    const link = screen.getByTestId('custom-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('aria-label', 'Custom navigation link');
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

  it('handles different href formats', () => {
    const { rerender } = renderWithProviders(
      <NavigationLink href="/internal-page">
        Internal Link
      </NavigationLink>
    );
    
    let link = screen.getByRole('link', { name: 'Internal Link' });
    expect(link).toHaveAttribute('href', '/internal-page');

    rerender(
      <NavigationLink href="https://external.com">
        External Link
      </NavigationLink>
    );
    
    link = screen.getByRole('link', { name: 'External Link' });
    expect(link).toHaveAttribute('href', 'https://external.com');
  });

  it('maintains accessibility with proper link semantics', () => {
    renderWithProviders(
      <NavigationLink href="/accessible-page">
        Accessible Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href');
    
    // 링크가 키보드로 접근 가능한지 확인
    expect(link).not.toHaveAttribute('tabindex', '-1');
  });

  it('renders without className when not provided', () => {
    renderWithProviders(
      <NavigationLink href="/no-class">
        No Class Link
      </NavigationLink>
    );
    
    const link = screen.getByRole('link', { name: 'No Class Link' });
    expect(link).toHaveClass('relative');
    expect(link).toHaveClass('opacity-100');
    // 빈 문자열이 기본값이므로 추가 클래스는 없어야 함
  });
}); 