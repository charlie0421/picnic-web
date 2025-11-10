"use client"
 
import React from 'react'
import BoardCard from './BoardCard'
import { getCdnImageUrl } from '@/utils/api/image'
import { useTranslations } from '@/hooks/useTranslations'

interface BoardItem {
  boardId: string
  name: string
  description?: string | null
  artist?: { id: number; name: string; image: string | null; groupName?: string | null } | null
}

function groupByArtist(items: BoardItem[]) {
  const groups = new Map<string, { key: string; title: string; image: string | null; items: BoardItem[] }>()
  for (const it of items) {
    const key = it.artist?.id ? `artist:${it.artist.id}` : (it.artist?.groupName ? `group:${it.artist.groupName}` : 'others')
    const title = it.artist?.name || it.artist?.groupName || 'others'
    if (!groups.has(key)) {
      groups.set(key, { key, title, image: it.artist?.image ?? null, items: [] })
    }
    groups.get(key)!.items.push(it)
  }
  return Array.from(groups.values())
}

export default function GroupedBoardList({ items, lang, bookmarkedBoardIds = [] }: { items: BoardItem[]; lang: string; bookmarkedBoardIds?: string[] }) {
  const { t } = useTranslations()
  const bookmarkedSet = new Set(bookmarkedBoardIds)
  const bookmarked = items.filter(b => bookmarkedSet.has(b.boardId))
  const rest = items.filter(b => !bookmarkedSet.has(b.boardId))
  const groups = groupByArtist(rest)

  return (
    <div className='space-y-8'>
      {bookmarked.length > 0 && (
        <section>
          <h2 className='text-lg font-semibold mb-3 text-gray-900'>{t('community.list.myBookmarkedBoards')}</h2>
          <ul className='space-y-4'>
            {bookmarked.map((b) => (
              <BoardCard key={b.boardId} boardId={b.boardId} name={b.name} description={b.description} lang={lang} artist={b.artist || undefined} initialBookmarked={true} />
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key}>
          <div className='flex items-center gap-2 mb-2'>
            {g.image ? (
              <img src={getCdnImageUrl(g.image, 80)} alt={g.title} className='w-8 h-8 rounded object-cover' />
            ) : (
              <div className='w-8 h-8 rounded bg-gray-200' />
            )}
            <h3 className='text-base font-medium text-gray-900'>{g.title === 'others' ? t('community.list.other') : g.title}</h3>
          </div>
          <ul className='space-y-4'>
            {g.items.map((b) => (
              <BoardCard key={b.boardId} boardId={b.boardId} name={b.name} description={b.description} lang={lang} artist={b.artist || undefined} initialBookmarked={bookmarkedSet.has(b.boardId)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}


