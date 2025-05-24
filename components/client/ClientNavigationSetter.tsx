'use client';

import React, { useEffect } from 'react';
import { useNavigation } from '@/contexts/NavigationContext';
import { PortalType } from '@/utils/enums';

interface ClientNavigationSetterProps {
  portalType: PortalType;
}

/**
 * 클라이언트 사이드에서 네비게이션 컨텍스트를 설정하기 위한 유틸리티 컴포넌트
 * 
 * 서버 컴포넌트에서 포털 타입을 설정하기 위해 사용됩니다.
 */
export const ClientNavigationSetter: React.FC<ClientNavigationSetterProps> = ({ portalType }) => {
  const { setCurrentPortalType } = useNavigation();

  useEffect(() => {
    setCurrentPortalType(portalType);
  }, [portalType, setCurrentPortalType]);

  // 아무 것도 렌더링하지 않는 유틸리티 컴포넌트
  return null;
};