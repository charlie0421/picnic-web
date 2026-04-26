'use client';

import React from 'react';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { getArtistName } from './goong-hap-constants';

interface ArtistSearchSectionProps {
  artistQuery: string;
  setArtistQuery: (query: string) => void;
  artistResults: Array<{ id: number; name: any; image?: string | null }>;
  myArtists: Array<{ id: number; name: any; image?: string | null }>;
  selectedArtistId: number | null;
  setSelectedArtistId: (id: number) => void;
  t: (key: string, fallback?: string) => string;
  currentLocale: string;
}

export default function ArtistSearchSection({
  artistQuery,
  setArtistQuery,
  artistResults,
  myArtists,
  selectedArtistId,
  setSelectedArtistId,
  t,
  currentLocale,
}: ArtistSearchSectionProps) {
  return (
    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
      {/* Section header */}
      <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
        <div className='flex items-center gap-2'>
          <span className='text-lg'>🎤</span>
          <h2 className='text-white font-bold'>{t('goonghap_select_artist', '아티스트 선택')}</h2>
        </div>
      </div>

      <div className='p-5'>
        {/* Search input */}
        <div className='relative'>
          <input
            type='text'
            value={artistQuery}
            onChange={(e) => setArtistQuery(e.target.value)}
            className='w-full border-2 border-purple-200 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all bg-white/50'
            placeholder={t('goonghap_search_artist', '아티스트 이름으로 검색')}
          />
          <span className='absolute left-3 top-1/2 -translate-y-1/2 text-purple-400'>🔍</span>
        </div>

        {/* Selected artist display */}
        {selectedArtistId && (() => {
          const selectedArtist = [...myArtists, ...artistResults].find(a => a.id === selectedArtistId);
          if (!selectedArtist) return null;
          const name = getArtistName(selectedArtist.name, currentLocale);
          return (
            <div className='mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300'>
              <p className='text-xs text-purple-600 font-medium mb-2'>{t('goonghap_selected', '선택됨')}</p>
              <div className='flex items-center gap-3'>
                <div className='w-12 h-12 rounded-full overflow-hidden ring-2 ring-purple-400 ring-offset-2'>
                  {selectedArtist.image ? (
                    <OptimizedImage
                      src={selectedArtist.image}
                      alt={name}
                      width={48}
                      height={48}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <div className='w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-purple-600 font-bold'>
                      {name.charAt(0)}
                    </div>
                  )}
                </div>
                <span className='font-bold text-gray-900'>{name}</span>
              </div>
            </div>
          );
        })()}

        {/* My artists */}
        {myArtists.length > 0 && (
          <div className='mt-4'>
            <p className='text-sm font-medium text-purple-600 mb-3 flex items-center gap-1'>
              <span>⭐</span> {t('goonghap_my_artists', '나의 아티스트')}
            </p>
            <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
              {myArtists.map((a) => {
                const name = getArtistName(a.name, currentLocale);
                const isSelected = selectedArtistId === a.id;
                return (
                  <button
                    key={a.id}
                    type='button'
                    onClick={() => setSelectedArtistId(a.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                        : 'bg-white hover:bg-purple-50 border border-purple-100 hover:border-purple-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ${isSelected ? 'ring-2 ring-white' : ''}`}>
                      {a.image ? (
                        <OptimizedImage
                          src={a.image}
                          alt={name}
                          width={32}
                          height={32}
                          className='w-full h-full object-cover'
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-600'}`}>
                          {name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-700'}`}>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search results */}
        {artistResults.length > 0 && (
          <div className='mt-4'>
            <p className='text-sm font-medium text-gray-500 mb-2'>{t('goonghap_search_results', '검색 결과')}</p>
            <div className='max-h-56 overflow-auto rounded-xl border border-purple-100 divide-y divide-purple-50'>
              {artistResults.map((a) => {
                const name = getArtistName(a.name, currentLocale);
                const isSelected = selectedArtistId === a.id;
                return (
                  <button
                    key={a.id}
                    type='button'
                    onClick={() => setSelectedArtistId(a.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-purple-100 to-pink-100'
                        : 'bg-white hover:bg-purple-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ${isSelected ? 'ring-2 ring-purple-400' : ''}`}>
                      {a.image ? (
                        <OptimizedImage
                          src={a.image}
                          alt={name}
                          width={40}
                          height={40}
                          className='w-full h-full object-cover'
                        />
                      ) : (
                        <div className='w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-purple-600 text-sm font-bold'>
                          {name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>{name}</span>
                    {isSelected && <span className='ml-auto text-purple-500'>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
