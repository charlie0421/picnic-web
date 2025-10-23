"use client"
import React, { useEffect, useRef } from 'react'
import 'quill/dist/quill.snow.css'

type Delta = any

export default function QuillBasicEditor({ value, onChange, minHeight = 600 }: { value: Delta; onChange: (delta: Delta) => void; minHeight?: number }) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const quillRef = useRef<any>(null)

  useEffect(() => {
    let isMounted = true
    ;(async () => {
      const Quill = (await import('quill')).default
      if (!isMounted || !editorRef.current) return
      if (!quillRef.current) {
        quillRef.current = new Quill(editorRef.current, {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ header: [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['link', 'image'],
              ['clean'],
            ],
          },
        })
        if (value) {
          try { quillRef.current.setContents(value) } catch {}
        }
        try {
          const el = editorRef.current.querySelector('.ql-editor') as HTMLElement | null
          if (el) {
            el.style.minHeight = `${minHeight}px`
          }
        } catch {}
        quillRef.current.on('text-change', () => {
          const delta = quillRef.current.getContents()
          onChange(delta)
        })
      }
    })()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (quillRef.current && value) {
      try {
        const current = quillRef.current.getContents()
        if (JSON.stringify(current) !== JSON.stringify(value)) {
          quillRef.current.setContents(value)
        }
      } catch {}
    }
  }, [value])

  return <div ref={editorRef} style={{ minHeight: `${minHeight}px` }} />
}


