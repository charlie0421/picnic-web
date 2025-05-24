/**
 * 테스트 유틸리티
 *
 * 컴포넌트 테스트를 위한 공통 유틸리티 함수와 래퍼를 제공합니다.
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 테스트 래퍼 옵션 인터페이스
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // 추가 옵션들을 여기에 정의할 수 있습니다
}

/**
 * 테스트를 위한 간단한 래퍼와 함께 컴포넌트를 렌더링합니다.
 *
 * @param ui 렌더링할 리액트 컴포넌트
 * @param options 렌더링 옵션
 * @returns 테스팅 라이브러리 렌더링 결과
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  // 간단한 래퍼 컴포넌트
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return <div data-testid="test-wrapper">{children}</div>;
  }

  // 컴포넌트 렌더링
  return {
    ...render(ui, { wrapper: TestWrapper, ...options }),
    // 사용자 이벤트 생성 헬퍼 추가
    user: userEvent.setup(),
  };
}

// 테스트 유틸리티 재내보내기
export * from '@testing-library/react';
export { renderWithProviders as render };
export { userEvent };

// 테스트용 모의 데이터
export const mockTestUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  app_metadata: {
    provider: 'email',
  },
};

export const mockTestSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockTestUser,
};
