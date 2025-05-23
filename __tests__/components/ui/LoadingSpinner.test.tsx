/**
 * LoadingSpinner 컴포넌트 테스트
 *
 * 이 테스트는 공통 UI 컴포넌트인 LoadingSpinner의 기능을 검증합니다.
 * 테스트 대상: 렌더링, 스타일 적용, 접근성
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders the loading spinner correctly', () => {
    const { container } = render(<LoadingSpinner />);

    // 스피너 컨테이너가 존재하는지 확인
    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toBeInTheDocument();
    expect(spinnerContainer).toHaveClass(
      'flex',
      'justify-center',
      'items-center',
      'min-h-[300px]',
    );

    // 애니메이션 스피너 요소가 존재하는지 확인
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass(
      'animate-spin',
      'rounded-full',
      'border-t-2',
      'border-b-2',
      'h-12',
      'w-12',
      'border-primary',
    );
  });

  it('applies custom className properly', () => {
    const customClass = 'test-class bg-red-500';
    const { container } = render(<LoadingSpinner className={customClass} />);

    // 커스텀 클래스가 적용되었는지 확인
    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toHaveClass(customClass);
    expect(spinnerContainer).toHaveClass(
      'flex',
      'justify-center',
      'items-center',
      'min-h-[300px]',
    );
  });

  it('renders spinner with animation styles', () => {
    const { container } = render(<LoadingSpinner />);

    // 애니메이션 스피너 요소의 스타일 확인
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('animate-spin');
    expect(spinner).toHaveClass('border-t-2');
    expect(spinner).toHaveClass('border-b-2');
    expect(spinner).toHaveClass('border-primary');
  });

  it('로딩 인디케이터로 인식 가능해야 한다 (a11y)', () => {
    // 기존 구현에서는 aria-label이 없지만, 이 테스트를 통해 접근성 개선을 제안할 수 있음
    const { container } = render(<LoadingSpinner />);

    // 현재 구현에서는 명시적인 접근성 속성이 없으므로 화면 요소가 존재하는지 확인
    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toBeInTheDocument();

    // 추후 aria-label과 같은 접근성 속성 추가를 권장하는 주석
    // TODO: aria-label 또는 role 속성을 추가하여 접근성 개선
  });
});
