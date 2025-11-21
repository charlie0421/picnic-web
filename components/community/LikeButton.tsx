'use client'
import React, { useTransition } from 'react'
import { likePost } from '@/app/actions/community'
import { useNotification } from '@/contexts/NotificationContext'
import { useTranslations } from '@/hooks/useTranslations'
import { useAuth } from '@/lib/supabase/auth-provider'
import { redirectToLogin } from '@/utils/auth-redirect'

interface Props {
  postId: string
  lang: string
  liked?: boolean
  likeCount?: number
}

export default function LikeButton({ postId, lang, liked, likeCount }: Props) {
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()
  const { t } = useTranslations()
  const { isAuthenticated } = useAuth()
  const redirectUrl = `/${lang}/community/${postId}`

  return (
    <button
      type='button'
      onClick={() => {
        if (!isAuthenticated) {
          redirectToLogin(redirectUrl)
          return
        }
        startTransition(async () => {
          const res = await likePost(postId, lang)
          if (res?.ok) {
            addNotification({ type: 'success', title: t('community.like.title'), message: t('community.like.ok') })
          } else {
            addNotification({ type: 'error', title: t('community.like.fail.title'), message: t('community.common.retryLater') })
          }
        })
      }}
      disabled={isPending}
      className={`px-3 py-1.5 rounded border text-sm disabled:opacity-60 ${liked ? 'bg-pink-50 border-pink-300 text-pink-700' : 'text-gray-800 bg-white border-gray-300 hover:bg-gray-50'}`}
    >
      {isPending ? t('community.common.processing') : (liked ? t('community.like.button.unlike') : t('community.like.button.like'))}{typeof likeCount === 'number' ? ` (${likeCount})` : ''}
    </button>
  )
}
