import React from 'react'
import PostCard from './PostCard'

interface Item {
  id: string
  title: string
  contentPreview?: string | null
  replyCount: number
  viewCount: number
}

export default function PostList({ items, lang }: { items: Item[]; lang: string }) {
  return (
    <ul className='space-y-4'>
      {items.map((p) => (
        <PostCard key={p.id} id={p.id} title={p.title} contentPreview={p.contentPreview} replyCount={p.replyCount} viewCount={p.viewCount} lang={lang} />
      ))}
    </ul>
  )
}


