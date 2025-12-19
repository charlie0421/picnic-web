'use client'

import React, { useState, useTransition } from 'react'
import QuillDeltaRenderer from '@/lib/content/quill-delta-renderer'
import { useTranslations } from '@/hooks/useTranslations'
import { useNotification } from '@/contexts/NotificationContext'
import { useAuth } from '@/lib/supabase/auth-provider'
import { redirectToLogin } from '@/utils/auth-redirect'
import { likeComment, reportComment, createComment } from '@/app/actions/community'

interface CommentItem {
  commentId: string
  content: unknown
  likes: number
  likedByMe?: boolean
  parentCommentId: string | null
  userId?: string | null
  createdAt?: string
}

// 다국어 콘텐츠에서 해당 언어 텍스트 추출
function extractLocalizedContent(content: unknown, lang: string): unknown {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return content
  }
  const obj = content as Record<string, unknown>
  if ('ops' in obj) return content
  if ('text' in obj) return content
  const keys = Object.keys(obj)
  const langKey = keys.find(k => k.length >= 2 && k.length <= 5 && typeof obj[k] === 'string')
  if (langKey) {
    return obj[lang] || obj[langKey] || ''
  }
  return content
}

interface CommentListProps {
  comments: CommentItem[]
  lang?: string
  postId: string
}

// 댓글 아이템 컴포넌트
function CommentItemComponent({
  comment,
  lang,
  postId,
  replies,
  onReplySuccess,
}: {
  comment: CommentItem
  lang: string
  postId: string
  replies: CommentItem[]
  onReplySuccess: () => void
}) {
  const { t } = useTranslations()
  const { addNotification } = useNotification()
  const { isAuthenticated } = useAuth()
  const [isPending, startTransition] = useTransition()
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [likeCount, setLikeCount] = useState(comment.likes)
  const [liked, setLiked] = useState(comment.likedByMe ?? false)

  const redirectUrl = `/${lang}/community/${postId}`

  const handleLike = () => {
    if (!isAuthenticated) {
      redirectToLogin(redirectUrl)
      return
    }
    startTransition(async () => {
      const res = await likeComment(comment.commentId, postId, lang)
      if (res?.ok) {
        setLiked(!liked)
        setLikeCount(prev => liked ? prev - 1 : prev + 1)
      } else {
        addNotification({ type: 'error', title: t('community.like.fail.title'), message: t('community.common.retryLater') })
      }
    })
  }

  const handleReply = () => {
    if (!isAuthenticated) {
      redirectToLogin(redirectUrl)
      return
    }
    if (!replyText.trim()) return
    startTransition(async () => {
      const res = await createComment(postId, replyText.trim(), lang, comment.commentId)
      if (res?.ok) {
        setReplyText('')
        setShowReplyForm(false)
        addNotification({ type: 'success', title: t('community.comment.title'), message: t('community.comment.ok') })
        onReplySuccess()
      } else {
        addNotification({ type: 'error', title: t('community.comment.fail.title'), message: t('community.common.retryLater') })
      }
    })
  }

  const handleReport = () => {
    if (!isAuthenticated) {
      redirectToLogin(redirectUrl)
      return
    }
    if (!reportReason.trim()) return
    startTransition(async () => {
      const res = await reportComment(comment.commentId, postId, reportReason.trim(), lang)
      if (res?.ok) {
        setReportReason('')
        setShowReportModal(false)
        addNotification({ type: 'success', title: t('community.report.title'), message: t('community.report.ok') })
      } else if (res?.error === 'already_reported') {
        addNotification({ type: 'info', title: t('community.report.title'), message: t('community.report.alreadyReported') })
        setShowReportModal(false)
      } else {
        addNotification({ type: 'error', title: t('community.report.fail.title'), message: t('community.common.retryLater') })
      }
    })
  }

  return (
    <li className='border border-gray-200 rounded-md p-3 bg-white'>
      <div className='text-sm text-gray-800'>
        <QuillDeltaRenderer value={extractLocalizedContent(comment.content, lang)} />
      </div>

      {/* 액션 버튼 */}
      <div className='flex items-center gap-3 mt-2 text-xs'>
        <button
          type='button'
          onClick={handleLike}
          disabled={isPending}
          className={`flex items-center gap-1 ${liked ? 'text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <span>{liked ? '❤️' : '🤍'}</span>
          <span>{likeCount}</span>
        </button>

        <button
          type='button'
          onClick={() => setShowReplyForm(!showReplyForm)}
          className='text-gray-500 hover:text-gray-700'
        >
          {t('community.comment.reply', '답글')}
        </button>

        <button
          type='button'
          onClick={() => setShowReportModal(true)}
          className='text-gray-400 hover:text-red-500'
        >
          {t('community.report.button', '신고')}
        </button>
      </div>

      {/* 대댓글 입력 폼 */}
      {showReplyForm && (
        <div className='mt-3 pl-4 border-l-2 border-gray-200'>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('community.comment.replyPlaceholder', '답글을 입력하세요')}
            className='w-full p-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-pink-400'
            rows={2}
          />
          <div className='flex gap-2 mt-2'>
            <button
              type='button'
              onClick={handleReply}
              disabled={isPending || !replyText.trim()}
              className='px-3 py-1 text-xs bg-pink-500 text-white rounded hover:bg-pink-600 disabled:opacity-50'
            >
              {isPending ? t('community.common.processing') : t('community.comment.submit')}
            </button>
            <button
              type='button'
              onClick={() => setShowReplyForm(false)}
              className='px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50'
            >
              {t('community.common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 대댓글 목록 */}
      {replies.length > 0 && (
        <ul className='mt-3 pl-4 border-l-2 border-gray-200 space-y-2'>
          {replies.map((reply) => (
            <li key={reply.commentId} className='bg-gray-50 rounded p-2'>
              <div className='text-sm text-gray-800'>
                <QuillDeltaRenderer value={extractLocalizedContent(reply.content, lang)} />
              </div>
              <div className='flex items-center gap-3 mt-1 text-xs text-gray-500'>
                <span>❤️ {reply.likes}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 신고 모달 */}
      {showReportModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50' onClick={() => setShowReportModal(false)}>
          <div className='bg-white rounded-lg p-4 w-80 max-w-[90vw]' onClick={(e) => e.stopPropagation()}>
            <h3 className='text-lg font-medium mb-3'>{t('community.report.title')}</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t('community.report.reasonPlaceholder')}
              className='w-full p-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-red-400'
              rows={3}
            />
            <div className='flex gap-2 mt-3'>
              <button
                type='button'
                onClick={handleReport}
                disabled={isPending || !reportReason.trim()}
                className='flex-1 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50'
              >
                {isPending ? t('community.common.processing') : t('community.report.submit')}
              </button>
              <button
                type='button'
                onClick={() => setShowReportModal(false)}
                className='flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50'
              >
                {t('community.common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

export default function CommentList({ comments, lang = 'ko', postId }: CommentListProps) {
  const { t } = useTranslations()
  const [, forceUpdate] = useState(0)

  // 부모 댓글과 대댓글 분리
  const parentComments = comments.filter(c => !c.parentCommentId)
  const repliesMap = new Map<string, CommentItem[]>()
  comments.filter(c => c.parentCommentId).forEach(c => {
    const parentId = c.parentCommentId!
    if (!repliesMap.has(parentId)) {
      repliesMap.set(parentId, [])
    }
    repliesMap.get(parentId)!.push(c)
  })

  const handleReplySuccess = () => {
    forceUpdate(n => n + 1)
  }

  if (!parentComments.length) return <p className='text-sm text-gray-700'>{t('community.commentList.noComments')}</p>

  return (
    <ul className='space-y-3'>
      {parentComments.map((c) => (
        <CommentItemComponent
          key={c.commentId}
          comment={c}
          lang={lang}
          postId={postId}
          replies={repliesMap.get(c.commentId) || []}
          onReplySuccess={handleReplySuccess}
        />
      ))}
    </ul>
  )
}
