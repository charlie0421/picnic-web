"use client"
import React, { useTransition, useState } from 'react'
import { toggleBoardBookmark } from '@/app/actions/community'
import { useTranslations } from '@/hooks/useTranslations'

export default function BoardBookmarkButton({ boardId, lang, initialBookmarked }: { boardId: string; lang: string; initialBookmarked?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [bookmarked, setBookmarked] = useState(!!initialBookmarked)
  const { t } = useTranslations()

  return (
    <button
      type="button"
      aria-label={bookmarked ? t('community.bookmark.label.remove') : t('community.bookmark.label.add')}
      className={`px-2 py-1 rounded border text-sm ${bookmarked ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-white border-gray-300 text-gray-700'}`}
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const prev = bookmarked
          setBookmarked(!prev)
          const res = await toggleBoardBookmark(boardId, lang)
          if (!res?.ok) {
            setBookmarked(prev)
          }
        })
      }}
    >
      {bookmarked ? '★' : '☆'}
    </button>
  )
}


