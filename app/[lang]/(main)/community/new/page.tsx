"use client"
import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from '@/hooks/useTranslations'

export default function CommunityNewPostPage() {
  const router = useRouter()
  const { lang: langParam } = useParams<{ lang: string }>()
  const lang = String(langParam || 'ko')
  const { t } = useTranslations()

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <h1 className='text-xl font-semibold text-gray-900'>{t('community.common.write')}</h1>
      <p className='text-sm text-gray-600'>{t('community.list.heading')}</p>
      <div>
        <button
          type='button'
          onClick={() => router.replace(`/${lang}/community`)}
          className='px-4 py-2 rounded bg-black text-white hover:bg-gray-800'
        >
          {t('community.board.backToList')}
        </button>
      </div>
    </div>
  )
}


