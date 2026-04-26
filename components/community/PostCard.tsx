"use client"

import React from 'react'
import { useTranslations } from '@/hooks/useTranslations'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

export interface PostCardArtist {
  id: number
  name: string
  image: string | null
  groupName?: string | null
}

interface Props {
  id: string
  title: string
  contentPreview?: string | null
  replyCount: number
  viewCount: number
  lang: string
  artist?: PostCardArtist | null
  showArtist?: boolean
}

export default function PostCard({ id, title, contentPreview, replyCount, viewCount, lang, artist, showArtist = true }: Props) {
  const { tHtml } = useTranslations()
  const artistFallbackLabel =
    artist?.name?.trim()?.charAt(0) ??
    artist?.groupName?.trim()?.charAt(0) ??
    'PIC'

  const content = (
    <div className='min-w-0 flex-1'>
      <h2 className='text-lg font-medium line-clamp-1 text-gray-900'>{title}</h2>
      {(artist?.name || artist?.groupName) ? (
        <p className='text-xs text-gray-500 line-clamp-1 mt-0.5'>
          {artist?.groupName ? `${artist.groupName} · ` : ''}
          {artist?.name ?? ''}
        </p>
      ) : null}
      {contentPreview ? (
        <p className='text-sm text-gray-700 line-clamp-2 mt-1'>{contentPreview}</p>
      ) : null}
      <div className='text-xs text-gray-600 mt-2'>
        {tHtml('community.postCard.commentsCount', { count: String(replyCount) })} ·{' '}
        {tHtml('community.postCard.viewsCount', { count: String(viewCount) })}
      </div>
    </div>
  )

  const shouldShowArtist = showArtist === true

  return (
    <li className='border border-gray-200 rounded-md p-4 hover:bg-gray-50 bg-white'>
      <a href={`/${lang}/community/${id}`} className='block'>
        {shouldShowArtist ? (
          <div className='flex items-start gap-4'>
            <div className='flex-shrink-0'>
              {artist?.image ? (
                <OptimizedImage
                  src={artist.image}
                  alt={`${artist?.name ?? 'artist'} profile`}
                  width={96}
                  height={96}
                  className='h-12 w-12 rounded-full object-cover border border-gray-100 shadow-sm'
                />
              ) : (
                <div className='h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500'>
                  {artistFallbackLabel}
                </div>
              )}
            </div>
            {content}
          </div>
        ) : (
          content
        )}
      </a>
    </li>
  )
}

