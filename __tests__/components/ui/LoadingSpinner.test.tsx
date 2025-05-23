import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a spinner with default class', () => {
    render(<LoadingSpinner />);
    
    // 스피너 컨테이너가 존재하는지 확인
    const spinnerContainer = document.querySelector('div.flex.justify-center.items-center');
    expect(spinnerContainer).toBeInTheDocument();
    
    // 기본 클래스가 적용되었는지 확인
    expect(spinnerContainer).toHaveClass('flex justify-center items-center min-h-[300px]');
    
    // 애니메이션 클래스가 적용되었는지 확인
    const spinnerDiv = spinnerContainer?.querySelector('.animate-spin');
    expect(spinnerDiv).toHaveClass('animate-spin');
  });
  
  it('applies custom className prop correctly', () => {
    const customClass = 'custom-test-class';
    render(<LoadingSpinner className={customClass} />);
    
    // 커스텀 클래스가 적용되었는지 확인
    const container = document.querySelector('div.flex.justify-center.items-center');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass(customClass);
  });
}); 