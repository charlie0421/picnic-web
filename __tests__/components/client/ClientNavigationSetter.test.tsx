/**
 * ClientNavigationSetter.tsx 테스트
 *
 * 이 테스트는 클라이언트 사이드 네비게이션 설정 컴포넌트를 검증합니다.
 * 테스트 대상: ClientNavigationSetter 컴포넌트
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ClientNavigationSetter } from '@/components/client/ClientNavigationSetter';
import { PortalType } from '@/utils/enums';
import { renderWithProviders } from '../../utils/test-utils';

// NavigationContext 모킹
const mockSetCurrentPortalType = jest.fn();
jest.mock('@/contexts/NavigationContext', () => ({
  useNavigation: () => ({
    setCurrentPortalType: mockSetCurrentPortalType,
    currentPortalType: PortalType.PUBLIC,
  }),
}));

describe('ClientNavigationSetter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('컴포넌트가 정상적으로 렌더링된다', () => {
    const { container } = renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    // 아무것도 렌더링하지 않는 유틸리티 컴포넌트이므로 빈 컨테이너여야 함
    expect(container.firstChild?.firstChild).toBeNull();
  });

  it('PUBLIC 포털 타입으로 네비게이션을 설정한다', () => {
    renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.PUBLIC);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);
  });

  it('MYPAGE 포털 타입으로 네비게이션을 설정한다', () => {
    renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.MYPAGE} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.MYPAGE);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);
  });

  it('AUTH 포털 타입으로 네비게이션을 설정한다', () => {
    renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.AUTH} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.AUTH);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);
  });

  it('VOTE 포털 타입으로 네비게이션을 설정한다', () => {
    renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.VOTE} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.VOTE);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);
  });

  it('포털 타입이 변경되면 새로운 값으로 설정한다', () => {
    const { rerender } = renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.PUBLIC);

    // 포털 타입 변경
    rerender(
      <ClientNavigationSetter portalType={PortalType.MYPAGE} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.MYPAGE);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(2);
  });

  it('동일한 포털 타입으로 다시 렌더링해도 설정이 호출된다', () => {
    const { rerender } = renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.PUBLIC);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);

    // 동일한 portalType으로 재렌더링
    rerender(<ClientNavigationSetter portalType={PortalType.PUBLIC} />);

    // useEffect의 의존성 배열에 portalType이 있지만 값이 동일하므로 다시 호출되지 않음
    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.PUBLIC);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1); // 여전히 1번만 호출
  });

  it('컴포넌트 언마운트 시 에러가 발생하지 않는다', () => {
    const { unmount } = renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    expect(() => unmount()).not.toThrow();
  });

  it('useNavigation 훅이 호출된다', () => {
    renderWithProviders(
      <ClientNavigationSetter portalType={PortalType.PUBLIC} />
    );

    // useNavigation 훅이 호출되어 setCurrentPortalType 함수가 사용됨
    expect(mockSetCurrentPortalType).toHaveBeenCalled();
  });

  it('여러 인스턴스가 동시에 렌더링되어도 각각 설정된다', () => {
    renderWithProviders(
      <div>
        <ClientNavigationSetter portalType={PortalType.PUBLIC} />
        <ClientNavigationSetter portalType={PortalType.MYPAGE} />
      </div>
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.PUBLIC);
    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(PortalType.MYPAGE);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(2);
  });

  it('props가 undefined일 때도 안전하게 처리한다', () => {
    // TypeScript에서는 이런 경우가 발생하지 않지만, 런타임 안전성 테스트
    renderWithProviders(
      <ClientNavigationSetter portalType={undefined as any} />
    );

    expect(mockSetCurrentPortalType).toHaveBeenCalledWith(undefined);
    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(1);
  });

  it('모든 PortalType enum 값을 처리할 수 있다', () => {
    const portalTypes = Object.values(PortalType);
    
    portalTypes.forEach((portalType, index) => {
      const { unmount } = renderWithProviders(
        <ClientNavigationSetter portalType={portalType} />
      );

      expect(mockSetCurrentPortalType).toHaveBeenCalledWith(portalType);
      
      unmount();
    });

    expect(mockSetCurrentPortalType).toHaveBeenCalledTimes(portalTypes.length);
  });
}); 