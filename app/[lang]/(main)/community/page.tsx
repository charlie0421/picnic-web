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
  const boardsSectionId = 'community-boards-overview'
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
    <div className='container mx-auto space-y-8 px-4 py-8 text-gray-900'>
      <section className='relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-500 to-point-500 px-6 py-10 text-white shadow-2xl'>
        <div className='absolute inset-0 opacity-30'>
          <div className='h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_60%)]' />
        </div>
        <div className='relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between'>
          <div className='space-y-3'>
            <p className='text-xs font-semibold uppercase tracking-[0.2em] text-white/80'>{t('community.meta.title')}</p>
            <h1 className='text-3xl font-semibold tracking-tight'>{t('community.list.heading')}</h1>
            <p className='max-w-2xl text-sm text-white/80'>{t('community.meta.description')}</p>
          </div>
          <a
            href={`/${lang}/community/new`}
            className='inline-flex items-center gap-2 self-start rounded-full bg-white/90 px-5 py-3 text-sm font-semibold text-primary-600 shadow-lg shadow-primary-900/20 transition hover:translate-y-[-2px] hover:bg-white md:self-auto'
          >
            {t('community.board.empty.cta')}
            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='M5 12h14' />
              <path d='M12 5l7 7-7 7' />
            </svg>
          </a>
        </div>
      </section>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-12'>
        <div className='space-y-6 lg:col-span-7 xl:col-span-8'>
          <HotPostList
            heading={t('community.list.hotPosts.heading')}
            description={t('community.list.hotPosts.description')}
            emptyLabel={t('community.list.hotPosts.empty')}
            fallbackTitle={t('community.list.hotPosts.untitled')}
            posts={hotPostItems}
          />
          <div className='rounded-3xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-primary-900/5'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-wide text-primary-500'>
                  {t('community.input.searchBoard.placeholder')}
                </p>
                <h2 className='text-lg font-semibold text-gray-900'>{t('community.list.heading')}</h2>
                <p className='text-sm text-gray-500'>{t('community.list.hotPosts.description')}</p>
              </div>
            </div>
            <BoardSearch lang={lang} className='mt-4' />
          </div>
        </div>
        <div className='space-y-6 lg:col-span-5 xl:col-span-4'>
          {favoritesOnly.boards && favoritesOnly.boards.length > 0 ? (
            <div className='rounded-3xl border border-white/20 bg-gradient-to-br from-primary-600/90 via-sub-400/70 to-point-500/80 p-6 text-white shadow-xl shadow-primary-900/20'>
              <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold'>{t('community.list.myArtistBoards')}</p>
                  <p className='text-xs text-white/80'>
                    {t('community.list.hotPosts.description')}
                  </p>
                </div>
                <a
                  href={`#${boardsSectionId}`}
                  className='inline-flex items-center gap-1 text-xs font-semibold text-white/90 underline-offset-2 hover:underline'
                >
                  {t('community.list.heading')}
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                    <path d='M5 12h14' />
                    <path d='M12 5l7 7-7 7' />
                  </svg>
                </a>
              </div>
              <div className='space-y-4'>
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
                    <div key={g.title} className='rounded-2xl bg-white/10 p-3'>
                      <div className='mb-2 flex items-center gap-3'>
                        {g.image ? (
                          <OptimizedImage src={g.image} alt={g.title} width={48} height={48} className='h-8 w-8 rounded-full object-cover' />
                        ) : (
                          <div className='h-8 w-8 rounded-full bg-white/30' />
                        )}
                        <div className='text-sm font-semibold'>{g.title}</div>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {g.items.map((b) => (
                          <a
                            key={b.boardId}
                            href={`/${lang}/community/boards/${b.boardId}`}
                            className='inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-600 transition hover:-translate-y-0.5'
                          >
                            #{b.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          ) : null}
          {bookmarkedBoards.length > 0 ? (
            <div className='rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-primary-900/10'>
              <div className='mb-3 flex items-center justify-between'>
                <div>
                  <p className='text-sm font-semibold text-gray-900'>{t('community.list.bookmarkedBoards')}</p>
                  <p className='text-xs text-gray-500'>{t('community.meta.description')}</p>
                </div>
                <a
                  href={`#${boardsSectionId}`}
                  className='text-xs font-semibold text-primary-600 underline-offset-2 hover:underline'
                >
                  {t('community.list.heading')}
                </a>
              </div>
              <div className='flex flex-wrap gap-2'>
                {bookmarkedBoards.map((b) => (
                  <a
                    key={b.boardId}
                    href={`/${lang}/community/boards/${b.boardId}`}
                    className='inline-flex items-center rounded-full border border-primary-100 bg-primary-50/70 px-3 py-1 text-xs font-semibold text-primary-600 transition hover:-translate-y-0.5'
                  >
                    #{b.name}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <section
        id={boardsSectionId}
        className='rounded-3xl border border-white/80 bg-white/80 p-6 shadow-xl shadow-primary-900/5'
      >
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold text-gray-900'>{t('community.list.heading')}</p>
            <p className='text-sm text-gray-500'>{t('community.meta.description')}</p>
          </div>
          <a
            href={`/${lang}/community`}
            className='inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50'
          >
            {t('community.list.heading')}
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='M5 12h14' />
              <path d='M12 5l7 7-7 7' />
            </svg>
          </a>
        </div>
        <GroupedBoardList
          items={boardsForList.map((b) => ({
            boardId: b.boardId,
            name: b.name,
            description: b.description,
            artist: b.artist || null,
          }))}
          lang={lang}
          bookmarkedBoardIds={bookmarkedBoardIds}
        />
      </section>
    </div>
  )
}


