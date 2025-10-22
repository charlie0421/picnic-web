'use client'
import React, { useState, useTransition } from 'react'
import { createComment } from '@/app/actions/community'
import { withRequireAuth } from '@/components/auth/withAuthGuard'
import { useNotification } from '@/contexts/NotificationContext'

interface Props {
  postId: string
  lang: string
}

function CommentFormBase({ postId, lang }: Props) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const { addNotification } = useNotification()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!content.trim()) return
        startTransition(async () => {
          const res = await createComment(postId, content, lang)
          if (res?.ok) {
            setContent('')
            addNotification({ type: 'success', title: '댓글 작성', message: '등록되었습니다.' })
          } else {
            addNotification({ type: 'error', title: '댓글 실패', message: '잠시 후 다시 시도해주세요.' })
          }
        })
      }}
      className='space-y-2'
    >
      <textarea
        placeholder='댓글을 입력하세요'
        className='w-full border border-gray-300 rounded px-3 py-2 min-h-[100px] bg-white text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className='flex justify-end'>
        <button type='submit' disabled={isPending} className='px-3 py-1.5 rounded bg-black text-white disabled:opacity-60'>
          {isPending ? '작성 중...' : '댓글 작성'}
        </button>
      </div>
    </form>
  )
}

export const CommentForm = withRequireAuth(CommentFormBase)

export default CommentForm


