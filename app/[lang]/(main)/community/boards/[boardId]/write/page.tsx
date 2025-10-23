import React from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getBoardMeta } from '@/lib/data-fetching/server/community-service'
import PostEditor from '@/components/community/PostEditor'
import { getTranslations } from '@/lib/i18n/server'

export default async function BoardWritePage({ params }: { params: Promise<{ lang: string; boardId: string }> }) {
  const { lang: langParam, boardId } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)
  const supabase = await createSupabaseServerClient()
  const { data: userResp } = await supabase.auth.getUser()
  const userId = userResp?.user?.id
  if (!userId) {
    redirect(`/${lang}/auth/login?next=/${lang}/community/boards/${boardId}/write`)
  }
  const meta = await getBoardMeta(boardId)
  return (
    <div className='container mx-auto px-4 py-6 space-y-4'>
      <h1 className='text-xl font-semibold'>{t('community.common.write')} · {meta?.name ?? boardId}</h1>
      <PostEditor lang={lang} boardId={boardId} />
    </div>
  )
}


