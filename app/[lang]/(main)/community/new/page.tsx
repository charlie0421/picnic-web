"use client"
import React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPost } from '@/app/actions/community'
import { useTranslations } from '@/hooks/useTranslations'

export default function CommunityNewPostPage({ params }: { params: { lang: string } }) {
  const router = useRouter()
  const lang = String(params?.lang || 'ko')
  const { t } = useTranslations()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <h1 className='text-xl font-semibold'>{t('community.common.write')}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            const ok = await createPost({ title, content }, lang)
            if (ok?.id) {
              router.replace(`/${lang}/community/${ok.id}`)
            }
          })
        }}
        className='space-y-4'
      >
        <input
          className='w-full border rounded px-3 py-2'
          placeholder={t('community.input.title.placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className='w-full border rounded px-3 py-2 min-h-[200px]'
          placeholder={t('community.input.content.placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <button
          type='submit'
          disabled={isPending}
          className='px-4 py-2 rounded bg-black text-white disabled:opacity-60'
        >
          {isPending ? t('community.button.submitting') : t('community.button.submit')}
        </button>
      </form>
    </div>
  )
}


