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
    <section className='rounded-md border bg-white border-gray-200 p-4'>
      <div className='space-y-1'>
        <h2 className='text-base font-semibold text-gray-900'>{heading}</h2>
        <p className='text-xs text-gray-600'>{description}</p>
      </div>
      {posts.length === 0 ? (
        <p className='mt-3 text-sm text-gray-600'>{emptyLabel}</p>
      ) : (
        <ul className='mt-4 space-y-3'>
          {posts.map((post) => (
            <li key={post.id}>
              <a
                href={post.href}
                className='block rounded border border-transparent p-3 transition hover:border-gray-200 hover:bg-gray-50'
              >
                <div className='space-y-1'>
                  {post.boardName ? (
                    <div className='text-xs font-semibold text-primary-600'>#{post.boardName}</div>
                  ) : null}
                  <div className='text-sm font-semibold text-gray-900 line-clamp-2'>
                    {post.title?.trim() ? post.title : fallbackTitle}
                  </div>
                  <div className='text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1'>
                    <span>{post.viewLabel}</span>
                    <span>{post.replyLabel}</span>
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


