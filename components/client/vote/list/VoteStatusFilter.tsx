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

/**
 * 앱 `vote_list_page.dart` `_statusColor` 의 실제 색.
 *
 * - 진행중 = `AppColors.secondary500` = `Environment.secondaryColor`
 *   = `picnic_app/config/prod.json` 의 `0xFF83FBC8`
 * - 종료 = `AppColors.grey400` = `0xFFA6A8AF` (`ui/style.dart`)
 * - 예정 = `0xFFFFB020` (하드코딩)
 * - Admin = `AppColors.statusError` = `0xFFFF4242` (`ui/style.dart`)
 */
const STATUS_DOT_COLOR: Record<VoteStatus, string> = {
  [VOTE_STATUS.ONGOING]: '#83FBC8',
  [VOTE_STATUS.COMPLETED]: '#A6A8AF',
  [VOTE_STATUS.UPCOMING]: '#FFB020',
  [VOTE_STATUS.ADMIN]: '#FF4242',
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
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const listboxId = useId();

    // 관리자 목록에만 Admin 항목을 덧붙인다. 비관리자가 URL 로 ?status=admin 을 넣어도
    // 서버(app/api/votes/route.ts, SSR)가 ongoing 으로 강등하므로 데이터는 보호된다.
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

    const closeAndRefocus = useCallback(() => {
      setIsOpen(false);
      triggerRef.current?.focus();
    }, []);

    const openAt = useCallback(
      (index: number) => {
        setActiveIndex(Math.max(0, Math.min(index, statuses.length - 1)));
        setIsOpen(true);
      },
      [statuses.length],
    );

    // 바깥 클릭으로 닫는다. Escape 는 목록 안에서 처리하므로 여기서는 다루지 않는다.
    useEffect(() => {
      if (!isOpen) return;

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
      };
    }, [isOpen]);

    // listbox 를 선언한 이상 열릴 때 포커스가 목록 안으로 들어가야 한다.
    useEffect(() => {
      if (!isOpen) return;
      optionRefs.current[activeIndex]?.focus();
    }, [isOpen, activeIndex]);

    const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % statuses.length);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + statuses.length) % statuses.length);
          break;
        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setActiveIndex(statuses.length - 1);
          break;
        case 'Escape':
        case 'Tab':
          // Tab 은 기본 이동을 막지 않고 목록만 닫는다.
          if (event.key === 'Escape') {
            event.preventDefault();
            closeAndRefocus();
          } else {
            setIsOpen(false);
          }
          break;
      }
    };

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const selectedIndex = Math.max(0, statuses.indexOf(selectedStatus));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openAt(isOpen ? selectedIndex : selectedIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openAt(statuses.length - 1);
      } else if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    };

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
          ref={triggerRef}
          type='button'
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              openAt(Math.max(0, statuses.indexOf(selectedStatus)));
            }
          }}
          onKeyDown={handleTriggerKeyDown}
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
            onKeyDown={handleListKeyDown}
            className='absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg'
          >
            {statuses.map((status, index) => {
              const selected = status === selectedStatus;
              return (
                <li key={status} role='none'>
                  <button
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type='button'
                    role='option'
                    aria-selected={selected}
                    // roving tabIndex — 목록 안에서는 화살표로 이동하고 Tab 은 목록을 벗어난다.
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => {
                      onStatusChange(status);
                      closeAndRefocus();
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
