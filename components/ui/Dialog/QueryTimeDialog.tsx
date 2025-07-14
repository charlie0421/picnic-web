'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Dialog } from './Dialog';
import { DialogProps } from './types';
import { 
  parseTimeBasedQuery, 
  checkTimeBasedDisplayWithServerTime,
  TimeDisplayStatus,
  formatTimeRemaining,
  calculateRemainingTime,
  calculateTimeUntilStart
} from '@/utils/time-based-display';
import { cn } from '@/lib/utils';

export interface QueryTimeDialogProps extends Omit<DialogProps, 'isOpen'> {
  /** 기본 열림 상태 (쿼리 조건을 만족할 때만 실제로 열림) */
  defaultOpen?: boolean;
  /** 로딩 중 표시할 내용 */
  loadingContent?: React.ReactNode;
  /** 시간 범위 밖일 때 표시할 내용 */
  outsideTimeContent?: React.ReactNode;
  /** 시간 정보를 표시할지 여부 */
  showTimeInfo?: boolean;
  /** 시간 체크 완료 시 호출되는 콜백 */
  onTimeCheck?: (shouldDisplay: boolean, status: TimeDisplayStatus) => void;
}

/**
 * 쿼리 기반 시간 체크 다이얼로그
 * 
 * URL 쿼리 파라미터 start_at, stop_at을 기준으로 서버 시간과 비교하여 노출 여부를 결정합니다.
 * 
 * 사용 예시:
 * - /page?start_at=2024-01-01T00:00:00Z&stop_at=2024-12-31T23:59:59Z
 * - /page?debug=true (항상 표시)
 * - /page?stop_at=2024-12-31T23:59:59Z (종료 시간만 설정)
 */
export function QueryTimeDialog({
  defaultOpen = false,
  loadingContent,
  outsideTimeContent,
  showTimeInfo = false,
  onTimeCheck,
  children,
  onClose,
  className,
  ...dialogProps
}: QueryTimeDialogProps) {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [shouldDisplay, setShouldDisplay] = useState(false);
  const [timeStatus, setTimeStatus] = useState<TimeDisplayStatus>('before');
  const [message, setMessage] = useState<string>();
  const [serverTime, setServerTime] = useState<Date>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 시간 체크 수행
  useEffect(() => {
    const checkTime = async () => {
      setIsLoading(true);
      
      const query = parseTimeBasedQuery(searchParams);
      const result = await checkTimeBasedDisplayWithServerTime(query);
      
      setShouldDisplay(result.shouldDisplay);
      setTimeStatus(result.status);
      setMessage(result.message);
      setServerTime(result.serverTime);
      setIsLoading(false);
      
      // 콜백 호출
      onTimeCheck?.(result.shouldDisplay, result.status);
    };

    checkTime();
  }, [searchParams, onTimeCheck]);

  // 다이얼로그 열림 상태 관리
  useEffect(() => {
    if (!isLoading) {
      setIsDialogOpen(defaultOpen && shouldDisplay);
    }
  }, [defaultOpen, shouldDisplay, isLoading]);

  const handleClose = () => {
    setIsDialogOpen(false);
    onClose?.();
  };

  // 로딩 중
  if (isLoading) {
    return (
      <Dialog
        {...dialogProps}
        isOpen={defaultOpen}
        onClose={handleClose}
        size="sm"
        className={cn("text-center", className)}
      >
        <Dialog.Content>
          {loadingContent || (
            <div className="flex flex-col items-center space-y-3 py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-gray-600">시간 정보를 확인하는 중...</p>
            </div>
          )}
        </Dialog.Content>
      </Dialog>
    );
  }

  // 시간 범위 밖
  if (!shouldDisplay) {
    if (outsideTimeContent && defaultOpen) {
      return (
        <Dialog
          {...dialogProps}
          isOpen={defaultOpen}
          onClose={handleClose}
          size="sm"
          className={cn("text-center", className)}
        >
          <Dialog.Content>
            {outsideTimeContent}
          </Dialog.Content>
        </Dialog>
      );
    }

    // 기본 시간 범위 밖 메시지
    if (defaultOpen && message) {
      return (
        <Dialog
          {...dialogProps}
          isOpen={defaultOpen}
          onClose={handleClose}
          size="sm"
          className={cn("text-center", className)}
        >
          <Dialog.Content>
            <div className="py-6">
              <div className="text-4xl mb-3">
                {timeStatus === 'before' ? '⏰' : '🚫'}
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {timeStatus === 'before' ? '아직 이용할 수 없습니다' : '더 이상 이용할 수 없습니다'}
              </h3>
              <p className="text-sm text-gray-600">{message}</p>
            </div>
          </Dialog.Content>
        </Dialog>
      );
    }

    return null;
  }

  // 시간 정보 렌더링
  const renderTimeInfo = () => {
    if (!showTimeInfo || !serverTime) return null;

    const query = parseTimeBasedQuery(searchParams);
    const remainingTime = query.stop_at ? calculateRemainingTime(query.stop_at, serverTime) : null;
    const timeUntilStart = query.start_at ? calculateTimeUntilStart(query.start_at, serverTime) : null;

    return (
      <Dialog.Header className="border-b border-gray-200 pb-3 mb-4">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>서버 시간</span>
            <span>{serverTime.toLocaleString()}</span>
          </div>
          
          {timeStatus === 'active' && remainingTime && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-600">종료까지</span>
              <span className="font-medium text-orange-600">
                {formatTimeRemaining(remainingTime)}
              </span>
            </div>
          )}
          
          {timeStatus === 'before' && timeUntilStart && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-600">시작까지</span>
              <span className="font-medium text-blue-600">
                {formatTimeRemaining(timeUntilStart)}
              </span>
            </div>
          )}
          
          {query.debug && (
            <div className="text-xs text-green-600 text-center">
              🐛 디버그 모드 활성화
            </div>
          )}
        </div>
      </Dialog.Header>
    );
  };

  // 메인 다이얼로그
  return (
    <Dialog
      {...dialogProps}
      isOpen={isDialogOpen}
      onClose={handleClose}
      className={className}
    >
      {renderTimeInfo()}
      {children}
    </Dialog>
  );
} 