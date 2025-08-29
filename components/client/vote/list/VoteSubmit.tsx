'use client';

import React, { useState, useEffect } from 'react';
import { VoteItem } from '@/types/interfaces';
import { useVoteStore } from '@/stores/voteStore';
import { getLocalizedString, getLocalizedJson, hasValidLocalizedString } from '@/utils/api/strings';

export interface VoteSubmitProps {
  voteItems?: Array<VoteItem & { artist?: any }>;
  selectedItemId?: string | number | null;
  onSelectedItemChange?: (itemId: string | number | null) => void;
  onSubmit?: (selectedItemId: string | number) => Promise<void>;
  isSubmitting?: boolean;
  disabled?: boolean;
  className?: string;
  submitButtonText?: string;
  validationMessage?: string;
  showVoteCount?: boolean;
  // 스토어 사용 여부 (기본값: true)
  useStore?: boolean;
}

export function VoteSubmit({
  voteItems: propVoteItems,
  selectedItemId: propSelectedItemId = null,
  onSelectedItemChange,
  onSubmit,
  isSubmitting: propIsSubmitting = false,
  disabled = false,
  className = '',
  submitButtonText = '투표하기',
  validationMessage = '투표할 항목을 선택해주세요.',
  showVoteCount = true,
  useStore = true
}: VoteSubmitProps) {
  // Zustand 스토어 상태
  const {
    currentVote,
    submission,
    selectVoteItem,
    startSubmission,
    completeSubmission,
    clearErrors
  } = useVoteStore();

  // 스토어 사용 여부에 따라 상태 결정
  const voteItems = useStore ? currentVote.voteItems : (propVoteItems || []);
  const selectedItemId = useStore ? submission.selectedItemId : propSelectedItemId;
  const isSubmitting = useStore ? submission.isSubmitting : propIsSubmitting;
  const submissionError = useStore ? submission.error : null;

  const [validationError, setValidationError] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // 스토어를 사용하지 않는 경우만 외부 props 동기화
    if (!useStore && propSelectedItemId !== selectedItemId) {
      // 외부에서 변경된 선택 항목 동기화 로직이 필요하다면 여기에 추가
    }
  }, [propSelectedItemId, selectedItemId, useStore]);

  // 스토어 에러 감지 및 로컬 에러 상태 업데이트
  useEffect(() => {
    if (submissionError) {
      setValidationError(submissionError);
    }
  }, [submissionError]);

  // 아이템 선택 핸들러
  const handleItemSelect = (itemId: string | number) => {
    if (disabled || isSubmitting) return;

    if (useStore) {
      const newSelectedId = selectedItemId === itemId ? null : itemId;
      selectVoteItem(newSelectedId);
      setValidationError('');
      clearErrors();
    } else {
      // 기존 로컬 상태 방식 (하위 호환성)
      const newSelectedId = selectedItemId === itemId ? null : itemId;
      onSelectedItemChange?.(newSelectedId);
      setValidationError('');
    }
  };

  // 폼 제출 핸들러
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (disabled || isSubmitting) return;

    // 검증
    if (!selectedItemId) {
      setValidationError(validationMessage);
      return;
    }

    setValidationError('');

    if (useStore) {
      // Zustand 스토어를 사용한 제출
      try {
        startSubmission();
        await onSubmit?.(selectedItemId);
        completeSubmission(true);
      } catch (error) {
        console.error('투표 제출 오류:', error);
        const errorMessage = error instanceof Error ? error.message : '투표 제출 중 오류가 발생했습니다. 다시 시도해주세요.';
        completeSubmission(false, errorMessage);
      }
    } else {
      // 기존 방식 (하위 호환성)
      try {
        await onSubmit?.(selectedItemId);
      } catch (error) {
        console.error('투표 제출 오류:', error);
        setValidationError('투표 제출 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  // 로딩 상태
  if (!isMounted) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-12 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  // 빈 상태
  if (voteItems.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-gray-500">투표할 수 있는 항목이 없습니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`p-6 ${className}`}>
      {/* 제목 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          투표할 항목을 선택해주세요
        </h3>
        <p className="text-sm text-gray-600">
          하나의 항목만 선택할 수 있습니다.
        </p>
      </div>

      {/* 투표 항목 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {voteItems.map((item) => {
          const isSelected = selectedItemId === item.id;
          const a = (item as any).artist;
          const artistName = a?.name || '아티스트';
          const artistGroup = a?.artistGroup?.name && hasValidLocalizedString(a.artistGroup.name)
            ? a.artistGroup.name
            : null;
          const imageUrl = a?.image || '/images/default-artist.png';
          const voteCount = item.vote_total || 0;

          return (
            <div
              key={item.id}
              className={`relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-lg'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              } ${disabled || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleItemSelect(item.id)}
            >
              {/* 선택 체크마크 */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}

              {/* 아티스트 이미지 */}
              <div className="w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                <img
                  src={imageUrl}
                  alt={getLocalizedJson(artistName)}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/images/default-artist.png';
                    target.onerror = null;
                  }}
                />
              </div>

              {/* 아티스트 정보 */}
              <div className="text-center">
                <h4 className="font-medium text-gray-900 truncate mb-1">
                  {getLocalizedJson(artistName)}
                </h4>
                {artistGroup && (
                  <p className="text-sm text-gray-600 truncate mb-2">
                    {getLocalizedJson(artistGroup)}
                  </p>
                )}
                {showVoteCount && (
                  <p className="text-sm font-bold text-primary">
                    {voteCount.toLocaleString()} 표
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 검증 오류 메시지 */}
      {validationError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{validationError}</p>
        </div>
      )}

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={disabled || isSubmitting || !selectedItemId}
        className="w-full py-3 px-6 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
      >
        {isSubmitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            제출 중...
          </>
        ) : (
          submitButtonText
        )}
      </button>

      {/* 도움말 텍스트 */}
      <p className="text-xs text-gray-500 text-center mt-3">
        투표는 한 번만 가능하며, 제출 후 변경할 수 없습니다.
      </p>
    </form>
  );
}

export default VoteSubmit; 