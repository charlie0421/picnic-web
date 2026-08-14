'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';
import { VOTE_STATUS, VoteStatus } from '@/stores/voteFilterStore';
import { useAuth } from '@/hooks/useAuth';

interface VoteStatusFilterProps {
  selectedStatus: VoteStatus;
  onStatusChange: (status: VoteStatus) => void;
}

// 앱 `vote_list_page.dart` `_statusColor` 와 같은 색. 진행중=민트, 종료=회색,
// 예정=앰버, Admin=레드.
const STATUS_DOT_COLOR: Record<VoteStatus, string> = {
  [VOTE_STATUS.ONGOING]: '#3ECFB2',
  [VOTE_STATUS.COMPLETED]: '#9CA3AF',
  [VOTE_STATUS.UPCOMING]: '#FFB020',
  [VOTE_STATUS.ADMIN]: '#EF4444',
};

// 앱 `_buildStatusDropdown` 의 나열 순서 (진행중 → 종료 → 예정 → Admin).
const STATUS_ORDER: readonly VoteStatus[] = [
  VOTE_STATUS.ONGOING,
  VOTE_STATUS.COMPLETED,
  VOTE_STATUS.UPCOMING,
];

const FALLBACK_TEXTS: Record<VoteStatus, string> = {
  [VOTE_STATUS.ONGOING]: 'Ongoing',
  [VOTE_STATUS.COMPLETED]: 'Completed',
  [VOTE_STATUS.UPCOMING]: 'Upcoming',
  [VOTE_STATUS.ADMIN]: '(Admin)',
};

const TRANSLATION_KEYS: Record<VoteStatus, string> = {
  [VOTE_STATUS.ONGOING]: 'label_tabbar_vote_active',
  [VOTE_STATUS.COMPLETED]: 'label_tabbar_vote_end',
  [VOTE_STATUS.UPCOMING]: 'label_tabbar_vote_upcoming',
  [VOTE_STATUS.ADMIN]: '',
};

/**
 * 상태 필터 드롭다운.
 *
 * 앱 `_buildStatusDropdown` 과 같은 형태 — 알약 버튼에 상태별 컬러 점을 찍고,
 * 펼치면 같은 형식의 목록이 나온다. Admin 항목은 앱과 동일하게 관리자에게만 보이고
 * 라벨도 앱처럼 번역을 거치지 않는 `(Admin)` 고정이다.
 */
const VoteStatusFilter = React.memo(
  ({ selectedStatus, onStatusChange }: VoteStatusFilterProps) => {
    const { t } = useLanguageStore();
    const isTranslationReady = useTranslationReady();
    const { userProfile } = useAuth();
    const isAdmin =
      userProfile?.is_admin === true || userProfile?.is_super_admin === true;

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const statuses = isAdmin ? [...STATUS_ORDER, VOTE_STATUS.ADMIN] : STATUS_ORDER;

    const getLabel = useCallback(
      (status: VoteStatus) => {
        const key = TRANSLATION_KEYS[status];
        if (!key || !isTranslationReady) {
          return FALLBACK_TEXTS[status];
        }
        return t(key) || FALLBACK_TEXTS[status];
      },
      [isTranslationReady, t],
    );

    // 바깥 클릭·Escape 로 닫는다.
    useEffect(() => {
      if (!isOpen) return;

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsOpen(false);
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen]);

    // 관리자 권한이 사라졌는데 admin 필터가 선택돼 있으면 진행중으로 되돌린다.
    useEffect(() => {
      if (!isAdmin && selectedStatus === VOTE_STATUS.ADMIN) {
        onStatusChange(VOTE_STATUS.ONGOING);
      }
    }, [isAdmin, selectedStatus, onStatusChange]);

    const renderRow = (status: VoteStatus, selected: boolean) => (
      <>
        <span
          aria-hidden='true'
          className='h-2 w-2 shrink-0 rounded-full'
          style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
        />
        <span className={selected ? 'font-bold' : 'font-medium'}>
          {getLabel(status)}
        </span>
      </>
    );

    return (
      <div ref={containerRef} className='relative'>
        <button
          type='button'
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup='listbox'
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label={getLabel(selectedStatus)}
          className='flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500'
        >
          {renderRow(selectedStatus, true)}
          <svg
            aria-hidden='true'
            viewBox='0 0 20 20'
            className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`}
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'
          >
            <path d='M6 12l4-4 4 4' strokeLinecap='round' strokeLinejoin='round' />
          </svg>
        </button>

        {isOpen && (
          <ul
            id={listboxId}
            role='listbox'
            aria-label={getLabel(selectedStatus)}
            className='absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg'
          >
            {statuses.map((status) => {
              const selected = status === selectedStatus;
              return (
                <li key={status} role='none'>
                  <button
                    type='button'
                    role='option'
                    aria-selected={selected}
                    onClick={() => {
                      onStatusChange(status);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs sm:text-sm text-gray-900 transition-colors hover:bg-gray-50 ${selected ? 'bg-gray-50' : ''}`}
                  >
                    {renderRow(status, selected)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  },
);

VoteStatusFilter.displayName = 'VoteStatusFilter';

export default VoteStatusFilter;
