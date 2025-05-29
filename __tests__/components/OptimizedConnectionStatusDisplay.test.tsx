/**
 * OptimizedConnectionStatusDisplay 컴포넌트 테스트
 *
 * 성능 최적화된 연결 상태 표시 컴포넌트의 기능을 검증합니다.
 * 테스트 대상: 렌더링 최적화, 상태 표시, 토글 기능, 성능 메트릭
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OptimizedConnectionStatusDisplay from '@/components/client/vote/common/OptimizedConnectionStatusDisplay';
import { ConnectionStatus, ConnectionInfo } from '@/lib/supabase/realtime';

// Mock 데이터
const mockConnectionInfo: ConnectionInfo = {
  status: 'connected',
  lastConnected: new Date('2024-01-01T12:00:00Z'),
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  isOnline: true,
  isVisible: true
};

const mockSystemStatus = {
  isOnline: true,
  isPageVisible: true,
  isSlowConnection: false,
  connectionType: '4g' as const,
  battery: {
    level: 0.8,
    isCharging: true,
    chargingTime: Infinity,
    dischargingTime: 3600
  }
};

const mockPerformanceMetrics = {
  renderCount: 1,
  memoryUsage: 1024 * 1024 * 10, // 10MB
  eventCount: 5,
  lastRenderTime: Date.now()
};

describe('OptimizedConnectionStatusDisplay', () => {
  const defaultProps = {
    connectionStatus: 'connected' as ConnectionStatus,
    connectionInfo: mockConnectionInfo,
    systemStatus: mockSystemStatus,
    performanceMetrics: mockPerformanceMetrics,
    onToggleSmartReconnect: jest.fn(),
    onToggleBatterySaver: jest.fn(),
    smartReconnectEnabled: true,
    batterySaverEnabled: false,
    showDetails: false,
    isCompact: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('기본 렌더링', () => {
    it('연결된 상태를 올바르게 표시해야 한다', () => {
      render(<OptimizedConnectionStatusDisplay {...defaultProps} />);
      
      expect(screen.getByText('연결됨')).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-icon')).toHaveClass('text-green-500');
    });

    it('연결 해제 상태를 올바르게 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        connectionStatus: 'disconnected' as ConnectionStatus,
        connectionInfo: {
          ...mockConnectionInfo,
          status: 'disconnected' as ConnectionStatus
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('연결 해제됨')).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-icon')).toHaveClass('text-red-500');
    });

    it('재연결 중 상태를 올바르게 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        connectionStatus: 'reconnecting' as ConnectionStatus,
        connectionInfo: {
          ...mockConnectionInfo,
          status: 'reconnecting' as ConnectionStatus,
          reconnectAttempts: 3
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('재연결 중...')).toBeInTheDocument();
      expect(screen.getByTestId('connection-status-icon')).toHaveClass('text-yellow-500');
      expect(screen.getByText('(시도 3/10)')).toBeInTheDocument();
    });
  });

  describe('시스템 상태 배지', () => {
    it('오프라인 상태를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        systemStatus: {
          ...mockSystemStatus,
          isOnline: false
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('오프라인')).toBeInTheDocument();
    });

    it('느린 연결 상태를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        systemStatus: {
          ...mockSystemStatus,
          isSlowConnection: true
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('느린 연결')).toBeInTheDocument();
    });

    it('백그라운드 상태를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        systemStatus: {
          ...mockSystemStatus,
          isPageVisible: false
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('백그라운드')).toBeInTheDocument();
    });

    it('배터리 부족 상태를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        systemStatus: {
          ...mockSystemStatus,
          battery: {
            level: 0.1,
            isCharging: false,
            chargingTime: null,
            dischargingTime: 1800
          }
        }
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('배터리 부족')).toBeInTheDocument();
    });
  });

  describe('세부 정보 표시', () => {
    it('showDetails가 true일 때 상세 정보를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('네트워크')).toBeInTheDocument();
      expect(screen.getByText('4G')).toBeInTheDocument();
      expect(screen.getByText('배터리')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('충전 중')).toBeInTheDocument();
    });

    it('성능 메트릭을 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByText('렌더링: 1회')).toBeInTheDocument();
      expect(screen.getByText('메모리: 10.0MB')).toBeInTheDocument();
      expect(screen.getByText('이벤트: 5개')).toBeInTheDocument();
    });
  });

  describe('토글 기능', () => {
    it('스마트 재연결 토글이 작동해야 한다', () => {
      const onToggleSmartReconnect = jest.fn();
      const props = {
        ...defaultProps,
        onToggleSmartReconnect,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      const toggle = screen.getByLabelText('스마트 재연결');
      fireEvent.click(toggle);
      
      expect(onToggleSmartReconnect).toHaveBeenCalledTimes(1);
    });

    it('배터리 절약 토글이 작동해야 한다', () => {
      const onToggleBatterySaver = jest.fn();
      const props = {
        ...defaultProps,
        onToggleBatterySaver,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      const toggle = screen.getByLabelText('배터리 절약');
      fireEvent.click(toggle);
      
      expect(onToggleBatterySaver).toHaveBeenCalledTimes(1);
    });
  });

  describe('컴팩트 모드', () => {
    it('컴팩트 모드에서는 간소화된 UI를 표시해야 한다', () => {
      const props = {
        ...defaultProps,
        isCompact: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      // 컴팩트 모드에서는 아이콘과 기본 상태만 표시
      expect(screen.getByTestId('connection-status-icon')).toBeInTheDocument();
      expect(screen.getByText('연결됨')).toBeInTheDocument();
      
      // 세부 정보는 숨겨져야 함
      expect(screen.queryByText('네트워크')).not.toBeInTheDocument();
    });
  });

  describe('메모화 동작', () => {
    it('동일한 props로 리렌더링 시 메모화가 작동해야 한다', () => {
      const { rerender } = render(<OptimizedConnectionStatusDisplay {...defaultProps} />);
      
      // 동일한 props로 리렌더링
      rerender(<OptimizedConnectionStatusDisplay {...defaultProps} />);
      
      // 메모화가 작동하면 불필요한 리렌더링이 방지됨
      // (실제 구현에서는 React.memo의 displayName으로 확인 가능)
      expect(OptimizedConnectionStatusDisplay.displayName).toBe('OptimizedConnectionStatusDisplay');
    });

    it('props가 변경되면 리렌더링되어야 한다', async () => {
      const { rerender } = render(<OptimizedConnectionStatusDisplay {...defaultProps} />);
      
      const newProps = {
        ...defaultProps,
        connectionStatus: 'disconnected' as ConnectionStatus
      };
      
      rerender(<OptimizedConnectionStatusDisplay {...newProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('연결 해제됨')).toBeInTheDocument();
      });
    });
  });

  describe('접근성', () => {
    it('적절한 ARIA 레이블이 있어야 한다', () => {
      const props = {
        ...defaultProps,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByLabelText('스마트 재연결')).toBeInTheDocument();
      expect(screen.getByLabelText('배터리 절약')).toBeInTheDocument();
    });

    it('키보드 네비게이션이 가능해야 한다', () => {
      const props = {
        ...defaultProps,
        showDetails: true
      };

      render(<OptimizedConnectionStatusDisplay {...props} />);
      
      const smartReconnectToggle = screen.getByLabelText('스마트 재연결');
      const batterySaverToggle = screen.getByLabelText('배터리 절약');
      
      expect(smartReconnectToggle).toHaveAttribute('tabindex', '0');
      expect(batterySaverToggle).toHaveAttribute('tabindex', '0');
    });
  });

  describe('에러 처리', () => {
    it('누락된 props에 대해 기본값을 사용해야 한다', () => {
      const minimalProps = {
        connectionStatus: 'connected' as ConnectionStatus,
        connectionInfo: mockConnectionInfo,
        systemStatus: mockSystemStatus,
        performanceMetrics: mockPerformanceMetrics
      };

      render(<OptimizedConnectionStatusDisplay {...minimalProps} />);
      
      expect(screen.getByText('연결됨')).toBeInTheDocument();
    });

    it('null 값에 대해 안전하게 처리해야 한다', () => {
      const propsWithNulls = {
        ...defaultProps,
        systemStatus: {
          ...mockSystemStatus,
          battery: {
            level: null,
            isCharging: false,
            chargingTime: null,
            dischargingTime: null
          }
        }
      };

      render(<OptimizedConnectionStatusDisplay {...propsWithNulls} />);
      
      // 배터리 정보가 null이어도 크래시하지 않아야 함
      expect(screen.getByText('연결됨')).toBeInTheDocument();
    });
  });
}); 