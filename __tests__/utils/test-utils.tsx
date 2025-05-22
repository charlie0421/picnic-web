/**
 * 테스트 유틸리티
 * 
 * 컴포넌트 테스트를 위한 공통 유틸리티 함수와 래퍼를 제공합니다.
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Provider 타입
interface ProviderProps {
  children: React.ReactNode;
}

// 전역 프로바이더 목록 (Next.js 앱에서 사용하는 모든 프로바이더)
// 필요에 따라 실제 프로바이더 또는 모킹된 프로바이더를 추가하세요
const AllProviders = ({ children }: ProviderProps) => {
  return (
    <>
      {/* 여기에 전역 프로바이더를 추가하세요 */}
      {children}
    </>
  );
};

// 확장된 렌더 옵션 (사용자 이벤트 포함)
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialEntries?: string[];
}

/**
 * 커스텀 렌더 함수
 * - 모든 필요한 프로바이더와 함께 컴포넌트를 렌더링합니다.
 * - userEvent 인스턴스를 반환합니다.
 */
function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  const user = userEvent.setup();
  
  return {
    user,
    ...render(ui, {
      wrapper: AllProviders,
      ...options
    })
  };
}

// 기본 테스트 ID 생성기
const getTestId = (id: string) => `test-${id}`;

// 모든 Testing Library 함수를 다시 내보냅니다
export * from '@testing-library/react';

// 커스텀 함수를 내보냅니다
export { customRender as render, getTestId }; 