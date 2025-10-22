import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { getBoardPosts } from '@/lib/data-fetching/server/community-service'
import PostList from '@/components/community/PostList'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ lang: string; boardId: string }> }): Promise<Metadata> {
  const { lang: langParam, boardId } = await params
  const lang = String(langParam || 'ko')
  const isrOptions = createISRMetadata(60)
  return {
    ...createPageMetadata(`커뮤니티 보드 - ${boardId}`, '해당 보드의 최신 게시글을 확인해보세요.', {
      alternates: { canonical: `${SITE_URL}/${lang}/community/boards/${boardId}` },
    }),
    ...isrOptions,
  }
}

export default async function BoardFeedPage({ params, searchParams }: { params: Promise<{ lang: string; boardId: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { lang: langParam, boardId } = await params
  const lang = String(langParam || 'ko')
  const sp = (await searchParams) || {}
  const page = Number(sp.page || 1)

  const { posts, hasNext } = await getBoardPosts(boardId, { page, limit: 20 })

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <a href={`/${lang}/community`} className='text-sm text-gray-600'>&larr; 보드 목록</a>
      <h1 className='text-xl font-semibold'>보드: {boardId}</h1>
      <PostList items={posts} lang={lang} />
      <div className='flex gap-2 justify-center pt-4'>
        {page > 1 && (
          <a className='px-3 py-1 border rounded' href={`/${lang}/community/boards/${boardId}?page=${page - 1}`}>
            이전
          </a>
        )}
        {hasNext && (
          <a className='px-3 py-1 border rounded' href={`/${lang}/community/boards/${boardId}?page=${page + 1}`}>
            다음
          </a>
        )}
      </div>
    </div>
  )
}


