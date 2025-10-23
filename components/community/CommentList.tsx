import React from 'react'
import QuillDeltaRenderer from '@/lib/content/quill-delta-renderer'
import { useTranslations } from '@/hooks/useTranslations'

interface CommentItem {
  commentId: string
  content: unknown
  likes: number
}

export default function CommentList({ comments }: { comments: CommentItem[] }) {
  const { t } = useTranslations()
  if (!comments.length) return <p className='text-sm text-gray-700'>{t('community.commentList.noComments')}</p>
  return (
    <ul className='space-y-3'>
      {comments.map((c) => (
        <li key={c.commentId} className='border rounded-md p-3'>
          <div className='text-sm text-gray-800'>
            <QuillDeltaRenderer value={c.content} />
          </div>
          <div className='text-xs text-gray-600 mt-1'>{t('community.likeButton.like')} {c.likes}</div>
        </li>
      ))}
    </ul>
  )
}


