'use client'
import React, { useState, useTransition } from 'react'
import { createComment } from '@/app/actions/community'
import { useNotification } from '@/contexts/NotificationContext'
import { useTranslations } from '@/hooks/useTranslations'
import { useAuth } from '@/lib/supabase/auth-provider'
import { useLoginRequired } from '@/components/ui/Dialog'
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard'

interface Props {
  postId: string
  lang: string
}

export default function CommentForm({ postId, lang }: Props) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()
  const { t } = useTranslations()
  const { isAuthenticated } = useAuth()
  const showLoginRequired = useLoginRequired()
  const redirectUrl = `/${lang}/community/${postId}`
  const ensureActiveMembership = useWithdrawalGuard()

  if (!isAuthenticated) {
    return (
      <div className='rounded-2xl border border-dashed border-gray-300 bg-white/70 px-4 py-6 text-center text-sm text-gray-600'>
        <p className='mb-3 text-gray-800'>{t('community.comment.firstPrompt')}</p>
        <button
          type='button'
          onClick={() => {
            showLoginRequired({
              redirectUrl,
            })
          }}
          className='inline-flex items-center justify-center rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-500'
        >
          {t('community.common.write')}
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!content.trim()) return
        if (await ensureActiveMembership()) {
          return
        }
        startTransition(async () => {
          const res = await createComment(postId, content, lang)
          if (res?.ok) {
            setContent('')
            addNotification({ type: 'success', title: t('community.comment.write'), message: t('community.common.ok') })
          } else {
            addNotification({ type: 'error', title: t('community.comment.writeFail'), message: t('community.common.retryLater') })
          }
        })
      }}
      className='space-y-2'
    >
      <textarea
        placeholder={t('community.input.comment.placeholder')}
        className='w-full border border-gray-300 rounded px-3 py-2 min-h-[100px] bg-white text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className='flex justify-end'>
        <button type='submit' disabled={isPending} className='px-3 py-1.5 rounded bg-black text-white disabled:opacity-60'>
          {isPending ? t('community.comment.writing') : t('community.comment.write')}
        </button>
      </div>
    </form>
  )
}
