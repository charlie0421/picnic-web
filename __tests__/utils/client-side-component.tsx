/**
 * 클라이언트 사이드 컴포넌트 테스트 유틸리티
 * 
 * 'use client' 지시문이 있는 컴포넌트를 테스트할 때 필요한 헬퍼 함수들을 제공합니다.
 */
import React from 'react';

// 클라이언트 사이드 컴포넌트 모킹 함수
export const mockClientComponent = (componentPath: string) => {
  jest.mock(componentPath, () => {
    return {
      __esModule: true,
      default: jest.fn((props) => (
        <div data-testid="mock-client-component" data-props={JSON.stringify(props)}>
          Mock Client Component
        </div>
      )),
    };
  });
};

// 모킹된 클라이언트 컴포넌트로부터 props 추출 함수
export const getPropsFromMockedComponent = (element: HTMLElement): any => {
  const propsStr = element.getAttribute('data-props');
  if (!propsStr) return {};
  return JSON.parse(propsStr);
};

// 테스트 이전에 호출할 useEffect 모킹 함수
export const mockUseEffect = () => {
  jest.mock('react', () => {
    const originalReact = jest.requireActual('react');
    return {
      ...originalReact,
      useEffect: jest.fn((callback) => callback()),
    };
  });
};

// 테스트 이후에 호출할 정리 함수
export const cleanupMocks = () => {
  jest.restoreAllMocks();
}; 