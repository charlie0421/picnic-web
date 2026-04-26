import React, { useMemo } from 'react'
import PostList, { type PostListItem } from './PostList'

interface HotPostListProps {
  heading: string
  description: string
  emptyLabel: string
  fallbackTitle: string
  posts: PostListItem[]
  lang: string
  showArtist?: boolean
}

export default function HotPostList({
  heading,
  description,
  emptyLabel,
  fallbackTitle,
  posts,
  lang,
  showArtist,
}: HotPostListProps) {
  const normalizedPosts = useMemo(
    () =>
      posts.map((post) => ({
        ...post,
        title: post.title?.trim() ? post.title : fallbackTitle,
      })),
    [posts, fallbackTitle],
  )

  return (
    <section className='rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-primary-900/5 backdrop-blur'>
      <div className='rounded-2xl bg-gradient-to-r from-primary-500 via-sub-400 to-point-400 px-4 py-3 text-white shadow-inner shadow-white/20'>
        <div className='flex items-center gap-2 text-sm font-semibold tracking-tight'>
          <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <path d='M12 3L14.09 8.26L20 9.27L15.5 13.14L16.73 19.02L12 16.13L7.27 19.02L8.5 13.14L4 9.27L9.91 8.26L12 3Z' />
          </svg>
          <span>{heading}</span>
        </div>
        <p className='text-xs text-white/80'>{description}</p>
      </div>
      {normalizedPosts.length === 0 ? (
        <div className='mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-600'>
          {emptyLabel}
        </div>
      ) : (
        <div className='mt-5'>
          <PostList items={normalizedPosts} lang={lang} showArtist={showArtist} />
        </div>
      )}
    </section>
  )
}


