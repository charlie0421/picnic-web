import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { getBoardPosts, getBoardMeta, getUserBookmarkedBoardIds } from '@/lib/data-fetching/server/community-service'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import PostList from '@/components/community/PostList'
import BoardBookmarkButton from '@/components/community/BoardBookmarkButton'
import WriteButton from '@/components/community/WriteButton'
import { getTranslations } from '@/lib/i18n/server'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ lang: string; boardId: string }> }): Promise<Metadata> {
  const { lang: langParam, boardId } = await params
  const lang = String(langParam || 'ko')
  const isrOptions = createISRMetadata(60)
  const t = await getTranslations(lang as any)
  return {
    ...createPageMetadata(`${t('community.meta.boardTitle')} - ${boardId}`, t('community.meta.boardDescription'), {
      alternates: { canonical: `${SITE_URL}/${lang}/community/boards/${boardId}` },
    }),
    ...isrOptions,
  }
}

export default async function BoardFeedPage({ params, searchParams }: { params: Promise<{ lang: string; boardId: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { lang: langParam, boardId } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)
  const sp = (await searchParams) || {}
  const page = Number(sp.page || 1)

  const [meta, { posts, hasNext }, bookmarkedBoardIds] = await Promise.all([
    getBoardMeta(boardId),
    getBoardPosts(boardId, { page, limit: 20 }),
    getUserBookmarkedBoardIds(),
  ])
  const isBookmarked = bookmarkedBoardIds.includes(String(boardId))

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <div className='flex items-start justify-between'>
        <div>
          <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; {t('community.board.backToList')}</a>
          <div className='mt-1 flex items-center gap-2'>
            {meta?.artist?.image ? (
              <OptimizedImage src={meta.artist.image} alt={meta.artist.name} width={80} height={80} className='w-8 h-8 rounded object-cover' />
            ) : (
              <div className='w-8 h-8 rounded bg-gray-200' />
            )}
            <div>
              <h1 className='text-xl font-semibold text-gray-900'>{meta?.name ?? boardId}</h1>
              {meta?.artist ? (
                <div className='text-sm text-gray-600'>{meta.artist.groupName ? `${meta.artist.groupName} · ` : ''}{meta.artist.name}</div>
              ) : null}
            </div>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <BoardBookmarkButton boardId={boardId} lang={lang} initialBookmarked={isBookmarked} />
          <WriteButton href={`/${lang}/community/boards/${boardId}/write`} />
        </div>
      </div>
      {posts.length === 0 ? (
        <div className='border border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50'>
          <div className='mx-auto mb-3 w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center'>
            <span className='text-primary-600 text-xl'>✍️</span>
          </div>
          <p className='text-gray-800 font-medium mb-1'>{t('community.board.empty.title')}</p>
          <p className='text-gray-600 text-sm mb-4'>{t('community.board.empty.desc')}</p>
          <WriteButton href={`/${lang}/community/boards/${boardId}/write`} variant='primary' />
        </div>
      ) : (
        <PostList items={posts} lang={lang} showArtist={false} />
      )}
      <div className='flex gap-2 justify-center pt-4'>
        {page > 1 && (
          <a className='px-3 py-1 border border-gray-300 rounded text-gray-900 hover:bg-gray-50' href={`/${lang}/community/boards/${boardId}?page=${page - 1}`}>
            {t('community.common.prev')}
          </a>
        )}
        {hasNext && (
          <a className='px-3 py-1 border border-gray-300 rounded text-gray-900 hover:bg-gray-50' href={`/${lang}/community/boards/${boardId}?page=${page + 1}`}>
            {t('community.common.next')}
          </a>
        )}
      </div>
    </div>
  )
}


