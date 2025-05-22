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
import { setupSupabaseMock, mockSession } from './mockSupabase';

// Provider 타입
interface ProviderProps {
  children: React.ReactNode;
}

// 테마 프로바이더 목 컴포넌트
const MockThemeProvider = ({ children }: ProviderProps) => {
  return <div data-testid="theme-provider">{children}</div>;
};

// next-intl 메시지를 위한 타입 확장
const mockMessages = messages as unknown as Record<string, Record<string, string>>;

// 모의 SessionContextProvider 컴포넌트
const MockSessionProvider = ({ children }: ProviderProps) => {
  return <div data-testid="auth-provider">{children}</div>;
};

// 확장된 렌더 옵션 (사용자 이벤트 포함)
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialEntries?: string[];
  locale?: string;
  messages?: Record<string, Record<string, string>>;
  withAuth?: boolean;
  withSession?: boolean;
  withTheme?: boolean;
  supapaseOptions?: {
    user?: any;
    session?: any;
    signInError?: Error | null;
    data?: Record<string, any[]>;
  };
}

/**
 * 전역 프로바이더 래퍼
 * Next.js 앱에서 사용하는 모든 프로바이더를 포함합니다.
 */
const AllProviders: React.FC<ProviderProps & CustomRenderOptions> = ({ 
  children, 
  locale = 'ko',
  messages = mockMessages,
  withAuth = true,
  withTheme = true,
  supapaseOptions
}) => {
  // Supabase 모킹 설정 (필요한 경우)
  if (withAuth && supapaseOptions) {
    setupSupabaseMock(supapaseOptions);
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {withTheme ? (
        <MockThemeProvider>
          {withAuth ? (
            <MockSessionProvider>
              {children}
            </MockSessionProvider>
          ) : (
            children
          )}
        </MockThemeProvider>
      ) : withAuth ? (
        <MockSessionProvider>
          {children}
        </MockSessionProvider>
      ) : (
        children
      )}
    </NextIntlClientProvider>
  );
};

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
  
  // AllProviders에 옵션 전달
  const AllTheProviders = (props: ProviderProps) => (
    <AllProviders {...options} {...props} />
  );
  
  return {
    user,
    ...render(ui, {
      wrapper: AllTheProviders,
      ...options
    })
  };
}

/**
 * 서버 컴포넌트 렌더링 시뮬레이션
 * 실제 서버 컴포넌트처럼 작동하지는 않지만 동일한 출력을 제공합니다.
 */
function renderServerComponent(
  ui: ReactElement,
  options?: Omit<CustomRenderOptions, 'withAuth' | 'withTheme'> 
) {
  // 서버 컴포넌트는 클라이언트 상태나 프로바이더를 사용하지 않습니다
  return render(ui, options);
}

// 기본 테스트 ID 생성기
const getTestId = (id: string) => `test-${id}`;

// 테스트 데이터 생성 유틸리티
const createTestData = <T extends Record<string, any>>(
  baseData: T,
  overrides?: Partial<T>
): T => {
  return {
    ...baseData,
    ...overrides,
  };
};

// 모든 Testing Library 함수를 다시 내보냅니다
export * from '@testing-library/react';

// 커스텀 함수를 내보냅니다
export { 
  customRender as render, 
  renderServerComponent,
  getTestId,
  createTestData,
  mockMessages,
}; 