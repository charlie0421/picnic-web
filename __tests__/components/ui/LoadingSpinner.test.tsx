/**
 * LoadingSpinner 컴포넌트 테스트
 *
 * 이 테스트는 공통 UI 컴포넌트인 LoadingSpinner의 기능을 검증합니다.
 * 테스트 대상: 렌더링, 스타일 적용, 접근성
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../utils/test-utils';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders the loading spinner correctly', () => {
    const { container } = renderWithProviders(<LoadingSpinner />);

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
    const { container } = renderWithProviders(<LoadingSpinner className={customClass} />);

    // 커스텀 클래스가 적용되었는지 확인
    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toHaveClass('test-class', 'bg-red-500');
    expect(spinnerContainer).toHaveClass(
      'flex',
      'justify-center',
      'items-center',
      'min-h-[300px]',
    );
  });

  it('renders spinner with animation styles', () => {
    const { container } = renderWithProviders(<LoadingSpinner />);

    // 애니메이션 스피너 요소의 스타일 확인
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('animate-spin');
    expect(spinner).toHaveClass('border-t-2');
    expect(spinner).toHaveClass('border-b-2');
    expect(spinner).toHaveClass('border-primary');
  });

  it('has proper structure for loading indicator', () => {
    const { container } = renderWithProviders(<LoadingSpinner />);

    // 현재 구현에서는 명시적인 접근성 속성이 없으므로 화면 요소가 존재하는지 확인
    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toBeInTheDocument();

    // 스피너가 중앙 정렬되어 있는지 확인
    expect(spinnerContainer).toHaveClass('justify-center', 'items-center');
    
    // 최소 높이가 설정되어 있는지 확인
    expect(spinnerContainer).toHaveClass('min-h-[300px]');
  });

  it('renders without className prop', () => {
    const { container } = renderWithProviders(<LoadingSpinner />);

    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toBeInTheDocument();
    expect(spinnerContainer).toHaveClass('flex', 'justify-center', 'items-center', 'min-h-[300px]');
  });

  it('combines custom className with default classes', () => {
    const customClass = 'my-custom-class';
    const { container } = renderWithProviders(<LoadingSpinner className={customClass} />);

    const spinnerContainer = container.querySelector(
      'div.flex.justify-center.items-center',
    );
    expect(spinnerContainer).toHaveClass('my-custom-class');
    expect(spinnerContainer).toHaveClass('flex', 'justify-center', 'items-center', 'min-h-[300px]');
  });
});
