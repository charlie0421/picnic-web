"use client"
import React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPost } from '@/app/actions/community'

export default function CommunityNewPostPage({ params }: { params: { lang: string } }) {
  const router = useRouter()
  const lang = String(params?.lang || 'ko')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <h1 className='text-xl font-semibold'>글쓰기</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            const ok = await createPost({ title, content }, lang)
            if (ok?.id) {
              router.replace(`/${lang}/community/${ok.id}`)
            }
          })
        }}
        className='space-y-4'
      >
        <input
          className='w-full border rounded px-3 py-2'
          placeholder='제목'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className='w-full border rounded px-3 py-2 min-h-[200px]'
          placeholder='내용'
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <button
          type='submit'
          disabled={isPending}
          className='px-4 py-2 rounded bg-black text-white disabled:opacity-60'
        >
          {isPending ? '작성 중...' : '작성하기'}
        </button>
      </form>
    </div>
  )
}


