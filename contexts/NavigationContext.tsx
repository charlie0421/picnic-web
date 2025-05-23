'use client';

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
  useEffect,
} from 'react';
import { PortalType } from '../utils/enums';

interface NavigationState {
  currentScreen: ReactNode | null;
  currentPortalType: PortalType;
}

interface NavigationContextProps {
  navigationState: NavigationState;
  setCurrentScreen: (screen: ReactNode) => void;
  setCurrentPortalType: (type: PortalType) => void;
}

const NavigationContext = createContext<NavigationContextProps | undefined>(
  undefined,
);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentScreen: null,
    currentPortalType: PortalType.VOTE,
  });

  useEffect(() => {
    console.log('NavigationState 변경됨:', {
      portalType: navigationState.currentPortalType,
      hasScreen: !!navigationState.currentScreen,
    });
  }, [navigationState]);

  const setCurrentScreen = useCallback((screen: ReactNode) => {
    console.log('setCurrentScreen 호출됨');
    setNavigationState((prev) => ({ ...prev, currentScreen: screen }));
  }, []);

  const setCurrentPortalType = useCallback((type: PortalType) => {
    console.log('setCurrentPortalType 호출됨:', type);
    setNavigationState((prev) => ({ ...prev, currentPortalType: type }));
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        navigationState,
        setCurrentScreen,
        setCurrentPortalType,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
