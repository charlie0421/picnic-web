import React from 'react'
import BoardCard from './BoardCard'

interface BoardItem {
  boardId: string
  name: string
  description?: string | null
  artist?: { id: number; name: string; image: string | null } | null
}

export default function BoardList({ items, lang }: { items: BoardItem[]; lang: string }) {
  return (
    <ul className='space-y-4'>
      {items.map((b) => (
        <BoardCard key={b.boardId} boardId={b.boardId} name={b.name} description={b.description} lang={lang} artist={b.artist} />
      ))}
    </ul>
  )
}


