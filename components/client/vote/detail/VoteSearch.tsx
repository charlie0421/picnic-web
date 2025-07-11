'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';

export interface VoteSearchProps {
  onSearch: (query: string) => void;
  onFilterChange?: (filter: SearchFilter) => void;
  searchResults?: VoteItem[];
  totalItems?: number;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  filter?: SearchFilter;
  disabled?: boolean;
}

export type SearchFilter = 'all' | 'artist' | 'group';

export function VoteSearch({
  onSearch,
  onFilterChange,
  searchResults = [],
  totalItems = 0,
  isLoading = false,
  placeholder = '검색어를 입력하세요',
  className = '',
  filter,
  disabled = false,
}: VoteSearchProps) {
  const { currentLanguage, t } = useLanguageStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<SearchFilter>(filter || 'all');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // 디바운스 처리
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 검색 실행
  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const query = e.target.value;
    setSearchQuery(query);
  };

  const clearSearch = () => {
    if (disabled) return;
    setSearchQuery('');
    onSearch('');
  };

  const handleFilterChange = (filter: SearchFilter) => {
    if (disabled) return;
    setSelectedFilter(filter);
    onFilterChange?.(filter);
  };

  return (
    <div className={`relative ${className}`}>
      <div className='relative'>
        <input
          type='text'
          value={searchQuery}
          onChange={handleSearch}
          placeholder={placeholder}
          className={`w-full p-3 pl-12 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            disabled ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''
          }`}
          disabled={disabled}
        />
        <div className='absolute left-4 top-1/2 transform -translate-y-1/2'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className={`h-5 w-5 ${
              disabled ? 'text-gray-400' : 'text-gray-600'
            }`}
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
            />
          </svg>
        </div>
        {searchQuery && !disabled && (
          <button
            onClick={clearSearch}
            className='absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        )}
      </div>

      {isLoading && !disabled && (
        <div className='absolute right-4 top-1/2 transform -translate-y-1/2'>
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
} 