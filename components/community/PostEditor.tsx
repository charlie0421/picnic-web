"use client"
import React, { useRef, useState, useTransition } from 'react'
import { createPost } from '@/app/actions/community'
import QuillBasicEditor from './QuillBasicEditor'
import { useTranslations } from '@/hooks/useTranslations'

export default function PostEditor({ lang, boardId }: { lang: string; boardId: string }) {
  const { t, tHtml } = useTranslations()
  const [title, setTitle] = useState('')
  const [value, setValue] = useState<any>(null)
  const [files, setFiles] = useState<File[]>([])
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUploadAndGetUrls(localFiles: File[]): Promise<{ name: string; url: string; type?: string; size?: number }[]> {
    const out: { name: string; url: string; type?: string; size?: number }[] = []
    for (const f of localFiles) {
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name, contentType: f.type })
      })
      if (!presignRes.ok) continue
      const { url, fields, publicUrl } = await presignRes.json()

      const formData = new FormData()
      Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v)))
      formData.append('Content-Type', f.type || 'application/octet-stream')
      formData.append('file', f)

      const uploadRes = await fetch(url, { method: 'POST', body: formData })
      if (uploadRes.ok) {
        out.push({ name: f.name, url: publicUrl, type: f.type, size: f.size })
      }
    }
    return out
  }

  return (
    <div className='relative space-y-3'>
      {isPending && (
        <div className='absolute inset-0 z-10 bg-white/60 backdrop-blur-sm' role='status' aria-live='polite'>
          <div className='absolute inset-0 flex items-center justify-center gap-3'>
            <div className='w-24 h-24 rounded-lg bg-primary-200 animate-pulse-light' />
            <span className='text-sm text-primary-700'>{t('community.postEditor.submitting')}</span>
          </div>
        </div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('community.postEditor.titlePlaceholder')}
        className='w-full border rounded px-3 py-2'
        disabled={isPending}
      />
      <div className='border rounded'>
        <QuillBasicEditor value={value} onChange={setValue} minHeight={600} />
      </div>
      <div className='flex items-center gap-2'>
        <input ref={fileInputRef} type='file' multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className='hidden' disabled={isPending} />
        <button type='button' className='px-3 py-2 border rounded text-sm disabled:opacity-50' onClick={() => fileInputRef.current?.click()} disabled={isPending}>{t('community.postEditor.attachFile')}</button>
        {files.length > 0 && <span className='text-sm text-gray-600'>{tHtml('community.postEditor.filesSelected', { count: String(files.length) })}</span>}
      </div>
      <div className='flex gap-2'>
        <button
          type='button'
          disabled={isPending || !title.trim()}
          className={`px-4 py-2 rounded text-white disabled:opacity-50 ${isPending ? 'bg-primary-500 animate-pulse-light' : 'bg-primary-600'}`}
          onClick={() => {
            startTransition(async () => {
              const attachments = await handleUploadAndGetUrls(files)
              const res = await createPost({ title, deltaJson: value, boardId, attachments }, lang)
              if (res?.ok) {
                window.location.href = `/${lang}/community/boards/${boardId}`
              }
            })
          }}
        >
          {isPending ? t('community.postEditor.submitting') : t('community.postEditor.submit')}
        </button>
      </div>
    </div>
  )
}


