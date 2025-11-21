import React from 'react'

interface HotPostItem {
  id: string
  href: string
  title: string | null
  boardName?: string | null
  viewLabel: string
  replyLabel: string
  createdLabel?: string
}

interface HotPostListProps {
  heading: string
  description: string
  emptyLabel: string
  fallbackTitle: string
  posts: HotPostItem[]
}

export default function HotPostList({ heading, description, emptyLabel, fallbackTitle, posts }: HotPostListProps) {
  return (
    <section className='rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-primary-900/5 backdrop-blur'>
      <div className='rounded-2xl bg-gradient-to-r from-primary-500 to-pink-400 px-4 py-3 text-white shadow-inner shadow-white/20'>
        <div className='flex items-center gap-2 text-sm font-semibold tracking-tight'>
          <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <path d='M12 3L14.09 8.26L20 9.27L15.5 13.14L16.73 19.02L12 16.13L7.27 19.02L8.5 13.14L4 9.27L9.91 8.26L12 3Z' />
          </svg>
          <span>{heading}</span>
        </div>
        <p className='text-xs text-white/80'>{description}</p>
      </div>
      {posts.length === 0 ? (
        <div className='mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-600'>
          {emptyLabel}
        </div>
      ) : (
        <ul className='mt-5 space-y-3'>
          {posts.map((post) => (
            <li key={post.id}>
              <a
                href={post.href}
                className='group relative block overflow-hidden rounded-2xl border border-transparent bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/5 transition duration-200 hover:-translate-y-0.5 hover:border-primary-100 hover:shadow-xl'
              >
                <div className='absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary-200 to-pink-200 opacity-0 transition group-hover:opacity-100' />
                <div className='space-y-1 pl-1'>
                  {post.boardName ? (
                    <div className='text-xs font-semibold uppercase tracking-wide text-primary-500'>#{post.boardName}</div>
                  ) : null}
                  <div className='text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-primary-600'>
                    {post.title?.trim() ? post.title : fallbackTitle}
                  </div>
                  <div className='flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500'>
                    <span className='flex items-center gap-1'>
                      <span>{post.viewLabel}</span>
                    </span>
                    <span className='flex items-center gap-1'>{post.replyLabel}</span>
                    {post.createdLabel ? <span>{post.createdLabel}</span> : null}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}


