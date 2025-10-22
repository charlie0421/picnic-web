'use client'
import React, { useTransition } from 'react'
import { likePost } from '@/app/actions/community'
import { withRequireAuth } from '@/components/auth/withAuthGuard'
import { useNotification } from '@/contexts/NotificationContext'

interface Props {
  postId: string
  lang: string
  liked?: boolean
  likeCount?: number
}

function LikeButtonBase({ postId, lang, liked, likeCount }: Props) {
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()

  return (
    <button
      type='button'
      onClick={() => startTransition(async () => {
        const res = await likePost(postId, lang)
        if (res?.ok) {
          addNotification({ type: 'success', title: '좋아요', message: '처리되었습니다.' })
        } else {
          addNotification({ type: 'error', title: '좋아요 실패', message: '잠시 후 다시 시도해주세요.' })
        }
      })}
      disabled={isPending}
      className={`px-3 py-1.5 rounded border text-sm disabled:opacity-60 ${liked ? 'bg-pink-50 border-pink-300 text-pink-700' : 'text-gray-800 bg-white hover:bg-gray-50'}`}
    >
      {isPending ? '처리 중...' : (liked ? '좋아요 취소' : '좋아요')}{typeof likeCount === 'number' ? ` (${likeCount})` : ''}
    </button>
  )
}

export const LikeButton = withRequireAuth(LikeButtonBase)

export default LikeButton


