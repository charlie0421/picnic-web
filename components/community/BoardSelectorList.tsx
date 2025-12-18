"use client"

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import { useTranslations } from '@/hooks/useTranslations'

interface BoardItem {
  boardId: string
  name: string
  description?: string | null
  artist?: { id: number; name: string; image: string | null; groupName?: string | null } | null
}

interface BoardSelectorListProps {
  boards: BoardItem[]
  bookmarkedBoardIds: string[]
  lang: string
}

export default function BoardSelectorList({ boards, bookmarkedBoardIds, lang }: BoardSelectorListProps) {
  const { t } = useTranslations()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const bookmarkedSet = useMemo(() => new Set(bookmarkedBoardIds), [bookmarkedBoardIds])

  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boards
    const q = searchQuery.toLowerCase()
    return boards.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      b.artist?.name.toLowerCase().includes(q) ||
      b.artist?.groupName?.toLowerCase().includes(q)
    )
  }, [boards, searchQuery])

  const bookmarkedBoards = useMemo(
    () => filteredBoards.filter(b => bookmarkedSet.has(b.boardId)),
    [filteredBoards, bookmarkedSet]
  )

  const otherBoards = useMemo(
    () => filteredBoards.filter(b => !bookmarkedSet.has(b.boardId)),
    [filteredBoards, bookmarkedSet]
  )

  const handleSelectBoard = (boardId: string) => {
    router.push(`/${lang}/community/boards/${boardId}/write`)
  }

  return (
    <div className='space-y-6'>
      {/* 검색 입력 */}
      <div className='relative'>
        <div className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400'>
          <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <circle cx='11' cy='11' r='8' />
            <line x1='21' y1='21' x2='16.65' y2='16.65' />
          </svg>
        </div>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('community.input.searchBoard.placeholder')}
          className='w-full rounded-lg border border-gray-200 bg-white px-11 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-200'
        />
        {searchQuery && (
          <button
            type='button'
            onClick={() => setSearchQuery('')}
            className='absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'
          >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <line x1='18' y1='6' x2='6' y2='18' />
              <line x1='6' y1='6' x2='18' y2='18' />
            </svg>
          </button>
        )}
      </div>

      {/* 검색 결과 없음 */}
      {filteredBoards.length === 0 && (
        <div className='text-center py-8 text-gray-500'>
          {t('community.new.noSearchResults')}
        </div>
      )}

      {/* 북마크한 보드 */}
      {bookmarkedBoards.length > 0 && (
        <section>
          <h2 className='text-base font-semibold mb-3 text-gray-900'>{t('community.list.myBookmarkedBoards')}</h2>
          <ul className='space-y-2'>
            {bookmarkedBoards.map((board) => (
              <BoardSelectorItem
                key={board.boardId}
                board={board}
                onClick={() => handleSelectBoard(board.boardId)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* 기타 보드 */}
      {otherBoards.length > 0 && (
        <section>
          {bookmarkedBoards.length > 0 && (
            <h2 className='text-base font-semibold mb-3 text-gray-900'>{t('community.list.other')}</h2>
          )}
          <ul className='space-y-2'>
            {otherBoards.map((board) => (
              <BoardSelectorItem
                key={board.boardId}
                board={board}
                onClick={() => handleSelectBoard(board.boardId)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function BoardSelectorItem({ board, onClick }: { board: BoardItem; onClick: () => void }) {
  return (
    <li>
      <button
        type='button'
        onClick={onClick}
        className='w-full border border-gray-200 rounded-lg p-4 hover:bg-primary-50 hover:border-primary-200 bg-white text-left transition-colors'
      >
        <div className='flex items-center gap-3'>
          {board.artist?.image ? (
            <OptimizedImage
              src={board.artist.image}
              alt={board.artist?.name ?? board.name}
              width={80}
              height={80}
              className='w-10 h-10 rounded-md object-cover flex-shrink-0'
            />
          ) : (
            <div className='w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs flex-shrink-0'>IMG</div>
          )}
          <div className='min-w-0 flex-1'>
            <h3 className='text-base font-medium line-clamp-1 text-gray-900'>{board.name}</h3>
            {(board.artist?.name || board.artist?.groupName) && (
              <div className='text-sm text-gray-600 line-clamp-1'>
                {board.artist?.groupName ? `${board.artist.groupName} · ` : ''}{board.artist?.name || ''}
              </div>
            )}
          </div>
          <div className='text-gray-400'>
            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <polyline points='9 18 15 12 9 6' />
            </svg>
          </div>
        </div>
      </button>
    </li>
  )
}
