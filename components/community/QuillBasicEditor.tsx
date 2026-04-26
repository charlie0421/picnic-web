"use client"
import React, { useEffect, useRef } from 'react'
import 'quill/dist/quill.snow.css'

type Delta = any

export default function QuillBasicEditor({ value, onChange, minHeight = 600 }: { value: Delta; onChange: (delta: Delta) => void; minHeight?: number }) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const quillRef = useRef<any>(null)

  useEffect(() => {
    let isMounted = true
    let textChangeHandler: (() => void) | null = null
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
        textChangeHandler = () => {
          if (!isMounted || !quillRef.current) return
          const delta = quillRef.current.getContents()
          onChange(delta)
        }
        quillRef.current.on('text-change', textChangeHandler)
      }
    })()
    return () => {
      isMounted = false
      // Detach the listener and drop the Quill instance so the editor DOM,
      // toolbar, and text-change subscribers are eligible for GC. Without
      // this, navigating away from the editor leaks the entire Quill
      // instance and can fire onChange after unmount (setState warnings).
      if (quillRef.current) {
        try {
          if (textChangeHandler) {
            quillRef.current.off('text-change', textChangeHandler)
          }
          // Quill has no .destroy(); clearing the host node and dropping
          // the ref is the documented teardown pattern.
          if (editorRef.current) editorRef.current.innerHTML = ''
        } catch {}
        quillRef.current = null
      }
    }
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


