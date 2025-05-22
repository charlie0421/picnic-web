import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a spinner with default class', () => {
    render(<LoadingSpinner />);
    
    // 스피너 요소가 존재하는지 확인
    const spinnerElement = screen.getByRole('generic', { hidden: true });
    expect(spinnerElement).toBeInTheDocument();
    
    // 기본 클래스가 적용되었는지 확인
    expect(spinnerElement.parentElement).toHaveClass('flex justify-center items-center min-h-[300px]');
    
    // 애니메이션 클래스가 적용되었는지 확인
    const spinnerDiv = spinnerElement.querySelector('div');
    expect(spinnerDiv).toHaveClass('animate-spin');
  });
  
  it('applies custom className prop correctly', () => {
    const customClass = 'custom-test-class';
    render(<LoadingSpinner className={customClass} />);
    
    // 커스텀 클래스가 적용되었는지 확인
    const container = screen.getByRole('generic', { hidden: true });
    expect(container).toBeInTheDocument();
    expect(container.parentElement).toHaveClass(customClass);
  });
}); 