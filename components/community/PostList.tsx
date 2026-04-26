import React from 'react'
import PostCard, { type PostCardArtist } from './PostCard'

export interface PostListItem {
  id: string
  title: string
  contentPreview?: string | null
  replyCount: number
  viewCount: number
  boardArtist?: PostCardArtist | null
}

interface PostListProps {
  items: PostListItem[]
  lang: string
  showArtist?: boolean
}

export default function PostList({ items, lang, showArtist = true }: PostListProps) {
  return (
    <ul className='space-y-4'>
      {items.map((p) => (
        <PostCard
          key={p.id}
          id={p.id}
          title={p.title}
          contentPreview={p.contentPreview}
          replyCount={p.replyCount}
          viewCount={p.viewCount}
          lang={lang}
          artist={p.boardArtist}
          showArtist={showArtist}
        />
      ))}
    </ul>
  )
}


