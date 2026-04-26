import React from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getBoards, getUserBookmarkedBoardIds } from '@/lib/data-fetching/server/community-service'
import { getTranslations } from '@/lib/i18n/server'
import BoardSelectorList from '@/components/community/BoardSelectorList'

export default async function CommunityNewPostPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: langParam } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)

  const supabase = await createSupabaseServerClient()
  const { data: userResp } = await supabase.auth.getUser()
  const userId = userResp?.user?.id
  if (!userId) {
    redirect(`/${lang}/auth/login?next=/${lang}/community/new`)
  }

  const [{ boards }, bookmarkedBoardIds] = await Promise.all([
    getBoards({ page: 1, limit: 100 }),
    getUserBookmarkedBoardIds(),
  ])

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <div>
        <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; {t('community.board.backToList')}</a>
        <h1 className='text-xl font-semibold text-gray-900 mt-2'>{t('community.new.selectBoard')}</h1>
        <p className='text-sm text-gray-600 mt-1'>{t('community.new.selectBoardDesc')}</p>
      </div>
      <BoardSelectorList
        boards={boards}
        bookmarkedBoardIds={bookmarkedBoardIds}
        lang={lang}
      />
    </div>
  )
}
