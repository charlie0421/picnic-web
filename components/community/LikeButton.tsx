'use client'
import React, { useTransition } from 'react'
import { likePost } from '@/app/actions/community'
import { withRequireAuth } from '@/components/auth/withAuthGuard'
import { useNotification } from '@/contexts/NotificationContext'
import { useTranslations } from '@/hooks/useTranslations'

interface Props {
  postId: string
  lang: string
  liked?: boolean
  likeCount?: number
}

function LikeButtonBase({ postId, lang, liked, likeCount }: Props) {
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()
  const { t } = useTranslations()

  return (
    <button
      type='button'
      onClick={() => startTransition(async () => {
        const res = await likePost(postId, lang)
        if (res?.ok) {
          addNotification({ type: 'success', title: t('community.like.title'), message: t('community.like.ok') })
        } else {
          addNotification({ type: 'error', title: t('community.like.fail.title'), message: t('community.common.retryLater') })
        }
      })}
      disabled={isPending}
      className={`px-3 py-1.5 rounded border text-sm disabled:opacity-60 ${liked ? 'bg-pink-50 border-pink-300 text-pink-700' : 'text-gray-800 bg-white hover:bg-gray-50'}`}
    >
      {isPending ? t('community.common.processing') : (liked ? t('community.like.button.unlike') : t('community.like.button.like'))}{typeof likeCount === 'number' ? ` (${likeCount})` : ''}
    </button>
  )
}

export const LikeButton = withRequireAuth(LikeButtonBase)

export default LikeButton


