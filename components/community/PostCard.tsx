"use client"
 
import React from 'react'
import { useTranslations } from '@/hooks/useTranslations'

interface Props {
  id: string
  title: string
  contentPreview?: string | null
  replyCount: number
  viewCount: number
  lang: string
}

export default function PostCard({ id, title, contentPreview, replyCount, viewCount, lang }: Props) {
  const { tHtml } = useTranslations()
  return (
    <li className='border border-gray-200 rounded-md p-4 hover:bg-gray-50 bg-white'>
      <a href={`/${lang}/community/${id}`} className='block'>
        <h2 className='text-lg font-medium line-clamp-1 text-gray-900'>{title}</h2>
        {contentPreview ? (
          <p className='text-sm text-gray-700 line-clamp-2 mt-1'>{contentPreview}</p>
        ) : null}
        <div className='text-xs text-gray-600 mt-2'>{tHtml('community.postCard.commentsCount', { count: String(replyCount) })} · {tHtml('community.postCard.viewsCount', { count: String(viewCount) })}</div>
      </a>
    </li>
  )
}


