/**
 * 테스트 유틸리티
 * 
 * 컴포넌트 테스트를 위한 공통 유틸리티 함수와 래퍼를 제공합니다.
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/locales/ko.json';
import { mockSession } from './mockSupabase';

// Provider 타입
interface ProviderProps {
  children: React.ReactNode;
}

// 테마 프로바이더 목 컴포넌트
const MockThemeProvider = ({ children }: ProviderProps) => {
  return <div data-testid="theme-provider">{children}</div>;
};

// 인증 프로바이더 목 컴포넌트
const MockAuthProvider = ({ children }: ProviderProps) => {
  return <div data-testid="auth-provider">{children}</div>;
};

// next-intl 메시지를 위한 타입 확장
const mockMessages = messages as unknown as Record<string, Record<string, string>>;

// 테스트 래퍼 옵션 인터페이스
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  messages?: Record<string, Record<string, string>>;
  withAuth?: boolean;
  withTheme?: boolean;
  supapaseOptions?: any;
}

/**
 * 테스트를 위한 모든 필요한 컨텍스트 프로바이더와 함께 컴포넌트를 렌더링합니다.
 * 
 * @param ui 렌더링할 리액트 컴포넌트
 * @param options 렌더링 옵션 (테마, 인증, 메시지 등)
 * @returns 테스팅 라이브러리 렌더링 결과
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    messages = mockMessages,
    withAuth = true,
    withTheme = true,
    supapaseOptions,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // 모든 프로바이더를 포함하는 래퍼
  function AllProviders({ children }: ProviderProps) {
    return (
      <NextIntlClientProvider messages={messages} locale="ko">
        {withTheme ? (
          <MockThemeProvider>
            {withAuth ? (
              <MockAuthProvider>{children}</MockAuthProvider>
            ) : (
              children
            )}
          </MockThemeProvider>
        ) : withAuth ? (
          <MockAuthProvider>{children}</MockAuthProvider>
        ) : (
          children
        )}
      </NextIntlClientProvider>
    );
  }

  // 컴포넌트 렌더링
  return {
    ...render(ui, { wrapper: AllProviders, ...renderOptions }),
    // 사용자 이벤트 생성 헬퍼 추가
    user: userEvent.setup()
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
    provider: 'email'
  }
};

export const mockTestSession = {
  ...mockSession,
  user: mockTestUser
}; 