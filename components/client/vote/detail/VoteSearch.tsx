'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';

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
  const { currentLanguage } = useLanguageStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
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
    setShowSuggestions(query.length > 0);
  };

  const clearSearch = () => {
    if (disabled) return;
    setSearchQuery('');
    setShowSuggestions(false);
    onSearch('');
  };

  const handleFilterChange = (filter: SearchFilter) => {
    if (disabled) return;
    setSelectedFilter(filter);
    onFilterChange?.(filter);
  };

  const highlightMatch = (text: string) => {
    if (!searchQuery || !text) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? (
        <span key={i} className='bg-yellow-200'>
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  const getFilteredResults = useCallback(() => {
    if (!searchResults) return [];

    return searchResults.filter((item) => {
      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'artist' && item.artist && !item.artist.artistGroup) return true;
      if (selectedFilter === 'group' && item.artist?.artistGroup) return true;
      return false;
    });
  }, [searchResults, selectedFilter]);

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

      {showSuggestions && searchQuery && !disabled && (
        <div className='absolute z-10 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto'>
          {getFilteredResults().length > 0 ? (
            getFilteredResults().map((item) => {
              const artistName = item.artist?.name 
                ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
                : `항목 ${item.id}`;
              const groupName = item.artist?.artistGroup?.name
                ? getLocalizedString(item.artist.artistGroup.name, currentLanguage)
                : undefined;
              
              return (
                <div
                  key={item.id}
                  className='p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0'
                >
                  <div className='flex items-center'>
                    <div className='flex-1'>
                      <p className='font-medium'>
                        {highlightMatch(artistName)}
                      </p>
                      {groupName && (
                        <p className='text-sm text-gray-600'>
                          {highlightMatch(groupName)}
                        </p>
                      )}
                    </div>
                    <div className='text-sm text-gray-500'>
                      {(item.vote_total || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className='p-3 text-center text-gray-500'>
              검색 결과가 없습니다
            </div>
          )}
        </div>
      )}

      {searchQuery && !disabled && (
        <div className='mt-2 text-sm text-gray-500'>
          전체 {totalItems}개 중 {getFilteredResults().length}개 검색됨
        </div>
      )}
    </div>
  );
} 