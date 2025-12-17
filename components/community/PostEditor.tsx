"use client"
import React, { useRef, useState, useTransition } from 'react'
import { createPost } from '@/app/actions/community'
import QuillBasicEditor from './QuillBasicEditor'
import { useTranslations } from '@/hooks/useTranslations'
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard'
import { useDialog, useWithdrawnUserDialog } from '@/components/ui/Dialog'
import PulseOverlay from '@/components/ui/PulseOverlay'

export default function PostEditor({ lang, boardId }: { lang: string; boardId: string }) {
  const { t, tHtml } = useTranslations()
  const [title, setTitle] = useState('')
  const [value, setValue] = useState<any>(null)
  const [files, setFiles] = useState<File[]>([])
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ensureActiveMembership = useWithdrawalGuard()
  const { showDialog } = useDialog()
  const showWithdrawnUserDialog = useWithdrawnUserDialog()

  const isDisabled = isPending || isSubmitting

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
      <PulseOverlay visible={isDisabled} label={t('community.postEditor.submitting')} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('community.postEditor.titlePlaceholder')}
        className='w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder:text-gray-500'
        disabled={isDisabled}
      />
      <div className='border border-gray-300 rounded'>
        <QuillBasicEditor value={value} onChange={setValue} minHeight={600} />
      </div>
      <div className='flex items-center gap-2'>
        <input ref={fileInputRef} type='file' multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className='hidden' disabled={isDisabled} />
        <button type='button' className='px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white hover:bg-gray-50 disabled:opacity-50' onClick={() => fileInputRef.current?.click()} disabled={isDisabled}>{t('community.postEditor.attachFile')}</button>
        {files.length > 0 && <span className='text-sm text-gray-600'>{tHtml('community.postEditor.filesSelected', { count: String(files.length) })}</span>}
      </div>
      <div className='flex gap-2'>
        <button
          type='button'
          disabled={isDisabled || !title.trim()}
          className={`px-4 py-2 rounded text-white disabled:opacity-50 ${isDisabled ? 'bg-primary-500 animate-pulse-light' : 'bg-primary-600'}`}
          onClick={async () => {
            if (isSubmitting) return
            setIsSubmitting(true)

            const blocked = await ensureActiveMembership()
            if (blocked) {
              setIsSubmitting(false)
              return
            }

            startTransition(async () => {
              try {
                const attachments = await handleUploadAndGetUrls(files)
                const res = await createPost({ title, deltaJson: value, boardId, attachments }, lang)
                if (res?.ok) {
                  window.location.href = `/${lang}/community/boards/${boardId}`
                } else if ('error' in res && res?.error === 'A member who has unsubscribed.') {
                  await showWithdrawnUserDialog()
                  setIsSubmitting(false)
                } else {
                  showDialog({
                    type: 'error',
                    size: 'sm',
                    title: t('community.postEditor.submitFail') || t('error.title'),
                    description: t('community.common.retryLater'),
                  })
                  setIsSubmitting(false)
                }
              } catch {
                setIsSubmitting(false)
              }
            })
          }}
        >
          {isDisabled ? t('community.postEditor.submitting') : t('community.postEditor.submit')}
        </button>
      </div>
    </div>
  )
}


