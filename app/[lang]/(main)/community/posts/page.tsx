import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { getCommunityFeed } from '@/lib/data-fetching/server/community-service'
import PostList from '@/components/community/PostList'
import WriteButton from '@/components/community/WriteButton'
import AdBanner from '@/components/client/ads/AdBanner'
import { getTranslations } from '@/lib/i18n/server'

export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)
  const isrOptions = createISRMetadata(60)

  return {
    ...createPageMetadata(t('community.feed.metaTitle'), t('community.feed.metaDescription'), {
      alternates: { canonical: `${SITE_URL}/${lang}/community/posts` },
    }),
    ...isrOptions,
  }
}

export default async function CommunityAllPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams?: Promise<{ page?: string }>
}) {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)
  const sp = (await searchParams) || {}
  const pageRaw = Number(sp.page || 1)
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
  const { posts, hasNext } = await getCommunityFeed({ page, limit: 20 })

  return (
    <div className='container mx-auto space-y-6 px-4 py-8 text-gray-900'>
      <section className='relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-sub-500 to-point-500 px-6 py-10 text-white shadow-2xl'>
        <div className='absolute inset-0 opacity-30'>
          <div className='h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_60%)]' />
        </div>
        <div className='relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between'>
          <div className='space-y-3'>
            <p className='text-xs font-semibold uppercase tracking-[0.2em] text-white/80'>{t('community.meta.title')}</p>
            <h1 className='text-3xl font-semibold tracking-tight'>{t('community.feed.title')}</h1>
            <p className='max-w-2xl text-sm text-white/80'>{t('community.feed.description')}</p>
          </div>
          <div className='flex flex-col gap-3 sm:flex-row md:self-auto'>
            <a
              href={`/${lang}/community`}
              className='inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/10 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-900/10 transition hover:translate-y-[-2px] hover:bg-white/20'
            >
              {t('community.feed.backToCommunity')}
              <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M5 12h14' />
                <path d='M12 5l7 7-7 7' />
              </svg>
            </a>
            <WriteButton href={`/${lang}/community/new`} variant='primary' className='inline-flex items-center justify-center' />
          </div>
        </div>
      </section>

      <section className='rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-primary-900/5'>
        {posts.length === 0 ? (
          <div className='flex flex-col items-center gap-3 text-center'>
            <div className='flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl'>📝</div>
            <p className='text-base font-semibold text-gray-900'>{t('community.feed.empty.title')}</p>
            <p className='text-sm text-gray-500'>{t('community.feed.empty.description')}</p>
            <WriteButton href={`/${lang}/community/new`} variant='primary' />
          </div>
        ) : (
          <PostList items={posts} lang={lang} />
        )}
      </section>

      {/* AdSense 배너 광고 */}
      <AdBanner className='my-4' />

      <div className='flex justify-center gap-2 pt-2'>
        {page > 1 && (
          <a
            className='rounded border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-900 transition hover:bg-gray-50'
            href={`/${lang}/community/posts?page=${page - 1}`}
          >
            {t('community.common.prev')}
          </a>
        )}
        {hasNext && (
          <a
            className='rounded border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-900 transition hover:bg-gray-50'
            href={`/${lang}/community/posts?page=${page + 1}`}
          >
            {t('community.common.next')}
          </a>
        )}
      </div>
    </div>
  )
}


