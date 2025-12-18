"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deletePost } from '@/app/actions/community'
import { useTranslations } from '@/hooks/useTranslations'
import { useConfirm, useAlert } from '@/components/ui/Dialog'

interface PostDeleteButtonProps {
  postId: string
  lang: string
}

export default function PostDeleteButton({ postId, lang }: PostDeleteButtonProps) {
  const { t } = useTranslations()
  const router = useRouter()
  const confirm = useConfirm()
  const alert = useAlert()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    const confirmed = await confirm({
      isOpen: true,
      onClose: () => {},
      type: 'warning',
      size: 'sm',
      title: t('community.delete.confirmTitle'),
      description: t('community.delete.confirmDesc'),
      confirmText: t('community.delete.confirm'),
      cancelText: t('community.common.cancel'),
      onConfirm: async () => {},
    })

    if (!confirmed) return

    setIsDeleting(true)
    try {
      const result = await deletePost(postId, lang)
      if (result?.ok) {
        await alert({
          isOpen: true,
          onClose: () => {},
          type: 'success',
          size: 'sm',
          title: t('community.delete.success'),
        })
        // 이전 페이지로 이동
        router.back()
      } else {
        await alert({
          isOpen: true,
          onClose: () => {},
          type: 'error',
          size: 'sm',
          title: t('community.delete.fail'),
          description: t('community.common.retryLater'),
        })
      }
    } catch (error) {
      await alert({
        isOpen: true,
        onClose: () => {},
        type: 'error',
        size: 'sm',
        title: t('community.delete.fail'),
        description: t('community.common.retryLater'),
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <button
      type='button'
      onClick={handleDelete}
      disabled={isDeleting}
      className='text-sm text-red-600 hover:text-red-700 disabled:opacity-50'
    >
      {isDeleting ? t('community.common.processing') : t('community.delete.button')}
    </button>
  )
}
