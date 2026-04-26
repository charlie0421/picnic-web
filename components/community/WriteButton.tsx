'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/hooks/useTranslations'
import { useRequireAuth } from '@/hooks/useAuthGuard'
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard'

interface WriteButtonProps {
  href: string
  className?: string
  variant?: 'default' | 'primary'
}

export default function WriteButton({ href, className = '', variant = 'default' }: WriteButtonProps) {
  const { t } = useTranslations()
  const router = useRouter()
  const { withAuth } = useRequireAuth()
  const ensureActiveMembership = useWithdrawalGuard()
  
  const baseClasses = variant === 'primary' 
    ? 'inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-white hover:bg-primary/90'
    : 'px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 hover:bg-gray-50'

  return (
    <button
      type='button'
      onClick={async () => {
        if (await ensureActiveMembership()) {
          return
        }
        await withAuth(async () => {
          router.push(href)
        }, href)
      }}
      className={`${baseClasses} ${className}`}
    >
      {t('community.common.write')}
    </button>
  )
}

