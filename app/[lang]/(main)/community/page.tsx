import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { getTranslations } from '@/lib/i18n/server'
import { getBoardsPrioritizedForUser, getUserBookmarkedArtistIds, getBoardsForUserFavoritesOnly, getUserBookmarkedBoardIds, getBoardsByIds, getHotCommunityPosts } from '@/lib/data-fetching/server/community-service'
import GroupedBoardList from '@/components/community/GroupedBoardList'
import BoardSearch from '@/components/community/BoardSearch'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import HotPostList from '@/components/community/HotPostList'

export const revalidate = 60

const localeMap: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja-JP',
}

function resolveLocale(lang: string) {
  const key = (lang || '').toLowerCase()
  return localeMap[key] ?? lang ?? 'en'
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const isrOptions = createISRMetadata(60)
  const t = await getTranslations(lang as any)

  return {
    ...createPageMetadata(
      t('community.meta.title'),
      t('community.meta.description'),
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
  const t = await getTranslations(lang as any)
  const [favArtistIds, favoritesOnly, prioritized, bookmarkedBoardIds, hotPosts] = await Promise.all([
    getUserBookmarkedArtistIds(),
    getBoardsForUserFavoritesOnly({ page: 1, limit: 50 }),
    getBoardsPrioritizedForUser({ page: 1, limit: 50 }),
    getUserBookmarkedBoardIds(),
    getHotCommunityPosts({ limit: 6, days: 30 }),
  ])
  // 하단 리스트에서는 즐겨찾는 아티스트의 보드를 제외하고 노출
  const favBoardIdSet = new Set((favoritesOnly.boards ?? []).map((b: any) => String(b.boardId)))
  // 하단에는 아티스트 보드 자체를 모두 제외
  const boardsForList = (prioritized.boards ?? []).filter((b: any) => !favBoardIdSet.has(String(b.boardId)) && !b.artist)
  // 북마크한 보드가 현재 목록에 없을 수 있으므로 별도로 조회
  const bookmarkedBoards = (await getBoardsByIds(bookmarkedBoardIds))
  const locale = resolveLocale(lang)
  const numberFormatter = new Intl.NumberFormat(locale)
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const hotPostItems = hotPosts.map((post) => {
    const createdDate = post.createdAt ? new Date(post.createdAt) : null
    const createdLabel = createdDate && !Number.isNaN(createdDate.getTime()) ? dateFormatter.format(createdDate) : undefined
    return {
      id: post.id,
      href: `/${lang}/community/${post.id}`,
      title: post.title,
      boardName: post.boardName,
      viewLabel: t('community.post.viewsCount', { count: numberFormatter.format(post.viewCount ?? 0) }),
      replyLabel: t('community.post.commentsCount', { count: numberFormatter.format(post.replyCount ?? 0) }),
      createdLabel,
    }
  })

  return (
    <div className='container mx-auto px-4 py-6 space-y-6 text-gray-900'>
      <h1 className='text-xl font-semibold text-gray-900'>{t('community.list.heading')}</h1>
      <HotPostList
        heading={t('community.list.hotPosts.heading')}
        description={t('community.list.hotPosts.description')}
        emptyLabel={t('community.list.hotPosts.empty')}
        fallbackTitle={t('community.list.hotPosts.untitled')}
        posts={hotPostItems}
      />
      <BoardSearch lang={lang} />
      {favoritesOnly.boards && favoritesOnly.boards.length > 0 ? (
        <div className='rounded-md border bg-white border-gray-200 p-3'>
          <div className='text-sm font-medium text-gray-800 mb-2'>{t('community.list.myArtistBoards')}</div>
          {(() => {
            const groups = new Map<string, { title: string; image: string | null; items: typeof favoritesOnly.boards }>()
            for (const it of favoritesOnly.boards) {
              const key = it.artist?.id ? `artist:${it.artist.id}` : (it.artist?.groupName ? `group:${it.artist.groupName}` : 'others')
              const title = it.artist?.name || it.artist?.groupName || t('community.list.other')
              const image = it.artist?.image ?? null
              if (!groups.has(key)) groups.set(key, { title, image, items: [] as any })
              groups.get(key)!.items.push(it)
            }
            return Array.from(groups.values()).map((g) => (
              <div key={g.title} className='mb-2'>
                <div className='flex items-center gap-2 mb-1'>
                  {g.image ? (
                    <OptimizedImage src={g.image} alt={g.title} width={80} height={80} className='w-5 h-5 rounded object-cover' />
                  ) : (
                    <div className='w-5 h-5 rounded bg-gray-200' />
                  )}
                  <div className='text-xs font-semibold text-gray-700'>{g.title}</div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  {g.items.map((b) => (
                    <a
                      key={b.boardId}
                      href={`/${lang}/community/boards/${b.boardId}`}
                      className='inline-flex items-center px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50'
                    >
                      #{b.name}
                    </a>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      ) : null}
      {bookmarkedBoards.length > 0 ? (
        <div className='rounded-md border bg-white border-gray-200 p-3'>
          <div className='text-sm font-medium text-gray-800 mb-2'>{t('community.list.bookmarkedBoards')}</div>
          <div className='flex flex-wrap gap-2'>
            {bookmarkedBoards.map((b) => (
              <a
                key={b.boardId}
                href={`/${lang}/community/boards/${b.boardId}`}
                className='inline-flex items-center px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50'
              >
                #{b.name}
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <GroupedBoardList items={boardsForList.map(b => ({ boardId: b.boardId, name: b.name, description: b.description, artist: b.artist || null }))} lang={lang} bookmarkedBoardIds={bookmarkedBoardIds} />
    </div>
  )
}


