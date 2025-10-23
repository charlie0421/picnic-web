'use client'
import React, { useState, useTransition } from 'react'
import { createComment } from '@/app/actions/community'
import { withRequireAuth } from '@/components/auth/withAuthGuard'
import { useNotification } from '@/contexts/NotificationContext'
import { useTranslations } from '@/hooks/useTranslations'

interface Props {
  postId: string
  lang: string
}

function CommentFormBase({ postId, lang }: Props) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()
  const { t } = useTranslations()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!content.trim()) return
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

export const CommentForm = withRequireAuth(CommentFormBase)

export default CommentForm


