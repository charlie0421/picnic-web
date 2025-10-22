import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { getBoardsPrioritizedForUser, getUserBookmarkedArtistIds, getBoardsForUserFavoritesOnly } from '@/lib/data-fetching/server/community-service'
import BoardList from '@/components/community/BoardList'

export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const isrOptions = createISRMetadata(60)

  return {
    ...createPageMetadata(
      '커뮤니티 - 피크닠',
      '피크닠 커뮤니티의 최신 게시글을 확인해보세요.',
      {
        alternates: {
          canonical: `${SITE_URL}/${lang}/community`,
          languages: {
            'ko-KR': `${SITE_URL}/ko/community`,
            'en-US': `${SITE_URL}/en/community`,
          },
        },
      },
    ),
    ...isrOptions,
  }
}

export default async function CommunityBoardListPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const [favArtistIds, favoritesOnly, prioritized] = await Promise.all([
    getUserBookmarkedArtistIds(),
    getBoardsForUserFavoritesOnly({ page: 1, limit: 50 }),
    getBoardsPrioritizedForUser({ page: 1, limit: 50 }),
  ])
  const boards = (favoritesOnly.boards?.length ?? 0) > 0 ? favoritesOnly.boards : prioritized.boards

  return (
    <div className='container mx-auto px-4 py-6 space-y-6 text-gray-900'>
      <h1 className='text-xl font-semibold'>커뮤니티 보드</h1>
      {favArtistIds.length > 0 ? (
        <p className='text-sm text-gray-700'>내 북마크 아티스트: {favArtistIds.join(', ')}</p>
      ) : (
        <p className='text-sm text-gray-700'>북마크한 아티스트가 없습니다.</p>
      )}
      <BoardList items={boards.map(b => ({ boardId: b.boardId, name: b.name, description: b.description, artist: b.artist || null }))} lang={lang} />
    </div>
  )
}


