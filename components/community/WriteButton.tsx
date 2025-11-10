'use client'

import React from 'react'
import NavigationLink from '@/components/client/NavigationLink'
import { useTranslations } from '@/hooks/useTranslations'

interface WriteButtonProps {
  href: string
  className?: string
  variant?: 'default' | 'primary'
}

export default function WriteButton({ href, className = '', variant = 'default' }: WriteButtonProps) {
  const { t } = useTranslations()
  
  const baseClasses = variant === 'primary' 
    ? 'inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-white hover:bg-primary/90'
    : 'px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 hover:bg-gray-50'

  return (
    <NavigationLink href={href} should_login={true} className={`${baseClasses} ${className}`}>
      {t('community.common.write')}
    </NavigationLink>
  )
}

