'use client';

import React, { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { DialogProps } from './types';
import { useTimeBasedDisplay } from '@/hooks/useTimeBasedDisplay';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export interface TimeBasedDialogProps extends DialogProps {
  /** 강제로 다이얼로그를 표시할지 여부 (디버깅용) */
  forceShow?: boolean;
  /** 시간 정보를 표시할지 여부 */
  showTimeInfo?: boolean;
  /** 로딩 중 표시할 내용 */
  loadingContent?: React.ReactNode;
  /** 시간 범위 밖일 때 표시할 내용 */
  outsideTimeRangeContent?: React.ReactNode;
}

/**
 * 시간 기반 노출 기능을 가진 다이얼로그 컴포넌트
 * 
 * start_at과 stop_at 시간을 기준으로 서버 시간에 맞춰 다이얼로그를 자동으로 표시/숨김 처리합니다.
 */
export function TimeBasedDialog({
  timeBasedDisplay,
  forceShow = false,
  showTimeInfo = false,
  loadingContent,
  outsideTimeRangeContent,
  children,
  onClose,
  ...dialogProps
}: TimeBasedDialogProps) {
  const { t } = useLanguageStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const {
    timeStatus,
    currentTime,
    shouldDisplay,
    isLoading,
    remainingTime,
    timeUntilStart,
    refreshTime,
  } = useTimeBasedDisplay(timeBasedDisplay);

  // 다이얼로그 표시 상태 업데이트
  useEffect(() => {
    if (forceShow) {
      setIsDialogOpen(dialogProps.isOpen);
    } else {
      setIsDialogOpen(dialogProps.isOpen && shouldDisplay);
    }
  }, [dialogProps.isOpen, shouldDisplay, forceShow]);

  // 시간 기반 자동 닫기
  useEffect(() => {
    if (timeBasedDisplay && timeStatus === 'after' && isDialogOpen) {
      handleClose();
    }
  }, [timeStatus, isDialogOpen, timeBasedDisplay]);

  const handleClose = () => {
    setIsDialogOpen(false);
    onClose();
  };

  // 시간 정보 포맷팅
  const formatTimeRemaining = (time: { days: number; hours: number; minutes: number; seconds: number } | null) => {
    if (!time) return null;
    
    const { days, hours, minutes, seconds } = time;
    
    if (days > 0) {
      return `${days}일 ${hours}시간 ${minutes}분`;
    } else if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds}초`;
    } else {
      return `${seconds}초`;
    }
  };

  // 로딩 중일 때
  if (isLoading && timeBasedDisplay) {
    return (
      <Dialog
        {...dialogProps}
        isOpen={dialogProps.isOpen}
        onClose={handleClose}
        size="sm"
        className={cn("text-center", dialogProps.className)}
      >
        <Dialog.Content>
          {loadingContent || (
            <div className="flex flex-col items-center space-y-3 py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-gray-600">
                {t('dialog.time_loading') || '시간 정보를 확인하는 중...'}
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog>
    );
  }

  // 시간 범위 밖일 때 (forceShow가 false인 경우)
  if (!forceShow && timeBasedDisplay && !shouldDisplay) {
    if (outsideTimeRangeContent && dialogProps.isOpen) {
      return (
        <Dialog
          {...dialogProps}
          isOpen={dialogProps.isOpen}
          onClose={handleClose}
          size="sm"
          className={cn("text-center", dialogProps.className)}
        >
          <Dialog.Content>
            {outsideTimeRangeContent}
          </Dialog.Content>
        </Dialog>
      );
    }
    return null;
  }

  // 메인 다이얼로그 렌더링
  return (
    <Dialog
      {...dialogProps}
      isOpen={isDialogOpen}
      onClose={handleClose}
    >
      {/* 시간 정보 표시 */}
      {showTimeInfo && timeBasedDisplay && (
        <Dialog.Header className="border-b border-gray-200 pb-3 mb-4">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>현재 시간</span>
              <span>{currentTime.toLocaleString()}</span>
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
            
            {timeStatus === 'after' && (
              <div className="text-xs text-red-600 text-center">
                노출 기간이 종료되었습니다
              </div>
            )}
            
            <button
              onClick={refreshTime}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors self-end"
            >
              🔄 새로고침
            </button>
          </div>
        </Dialog.Header>
      )}
      
      {children}
    </Dialog>
  );
}

// 기본 시간 범위 밖 콘텐츠 컴포넌트들
export const DefaultOutsideTimeContent = {
  Before: ({ startAt }: { startAt?: string }) => {
    const { t } = useLanguageStore();
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">⏰</div>
        <h3 className="text-lg font-semibold mb-2">
          {t('dialog.not_yet_available') || '아직 이용할 수 없습니다'}
        </h3>
        <p className="text-sm text-gray-600">
          {startAt 
            ? `${new Date(startAt).toLocaleString()}부터 이용 가능합니다.`
            : '곧 이용 가능합니다.'
          }
        </p>
      </div>
    );
  },
  
  After: ({ stopAt }: { stopAt?: string }) => {
    const { t } = useLanguageStore();
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">🚫</div>
        <h3 className="text-lg font-semibold mb-2">
          {t('dialog.no_longer_available') || '더 이상 이용할 수 없습니다'}
        </h3>
        <p className="text-sm text-gray-600">
          {stopAt 
            ? `${new Date(stopAt).toLocaleString()}에 종료되었습니다.`
            : '이용 기간이 종료되었습니다.'
          }
        </p>
      </div>
    );
  }
}; 