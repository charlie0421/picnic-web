'use client'

import React, { useState, useCallback } from 'react'

interface DeltaInsertImage {
  image?: string
}

interface DeltaAttributes {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  link?: string
  [key: string]: unknown
}

type DeltaOp = { insert?: string | DeltaInsertImage; text?: string; attributes?: DeltaAttributes }

function renderText(text: string, attrs?: DeltaAttributes) {
  let node: React.ReactNode = text
  if (!attrs) return node
  if (attrs.bold) node = <strong>{node}</strong>
  if (attrs.italic) node = <em>{node}</em>
  if (attrs.underline) node = <u>{node}</u>
  if (attrs.link) node = <a href={attrs.link} className='text-blue-600 underline' target='_blank' rel='noreferrer'>{node}</a>
  return node
}

// Lightbox 컴포넌트
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 닫기 버튼 - fixed로 화면 기준 위치 고정 */}
      <button
        className="fixed top-4 right-4 z-[10000] p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={src}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export function QuillDeltaRenderer({ value }: { value: unknown }) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const handleImageClick = useCallback((src: string) => {
    setLightboxImage(src)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxImage(null)
  }, [])

  if (value === null || value === undefined) return null

  let parsed: unknown = value
  if (typeof value === 'string') {
    const str = value.trim()
    try {
      // 문자열이 JSON 배열/객체처럼 보이면 파싱 시도
      if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
        parsed = JSON.parse(str)
      } else {
        // 일반 텍스트로 취급
        parsed = [{ insert: str }]
      }
    } catch {
      // 파싱 실패 시 일반 텍스트로 렌더링
      parsed = [{ insert: str }]
    }
  }

  // 객체형인데 ops가 없고 text만 있는 케이스 { type: 'text', text: '...' } → 배열로 정규화
  if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
    const parsedObj = parsed as Record<string, unknown>
    if (!('ops' in parsedObj)) {
      const maybeText = parsedObj.text
      if (typeof maybeText === 'string') {
        parsed = [{ insert: maybeText }]
      } else {
        // 다국어 JSON 형식 처리: { "en": "text", "ko": "텍스트" }
        const keys = Object.keys(parsedObj)
        const langKey = keys.find(k => k.length >= 2 && k.length <= 5 && typeof parsedObj[k] === 'string')
        if (langKey) {
          const browserLang = typeof window !== 'undefined' ? window.navigator.language?.split('-')[0] : 'en'
          const langText = (parsedObj[browserLang] as string) || (parsedObj[langKey] as string) || ''
          if (langText) {
            parsed = [{ insert: langText }]
          }
        }
      }
    }
  }

  const rawOps: unknown[] = Array.isArray(parsed)
    ? parsed
    : (typeof parsed === 'object' && parsed !== null && 'ops' in (parsed as Record<string, unknown>))
      ? (parsed as Record<string, unknown>).ops as unknown[]
      : []

  // 일부 데이터는 { text: "..." } 형태를 사용하므로 insert로 정규화
  const ops: DeltaOp[] = rawOps.map((op) => {
    if (op && typeof op === 'object') {
      const o = op as Record<string, unknown>
      if (typeof o.insert === 'string') return o as unknown as DeltaOp
      if (typeof o.text === 'string') return { insert: o.text, attributes: o.attributes as DeltaAttributes | undefined }
      if (o.insert && typeof o.insert === 'object' && (o.insert as Record<string, unknown>).image) return o as unknown as DeltaOp
    }
    return op as DeltaOp
  })

  const blocks: React.ReactNode[] = []
  let currentLine: React.ReactNode[] = []

  const flushLine = () => {
    if (currentLine.length) {
      blocks.push(<p key={`p-${blocks.length}`} className='whitespace-pre-wrap break-words text-gray-900'>{currentLine}</p>)
      currentLine = []
    }
  }

  ops.forEach((op, idx) => {
    if (op.insert && typeof op.insert === 'string') {
      const segments = op.insert.split('\n')
      segments.forEach((seg, i) => {
        if (seg.length) currentLine.push(<span key={`t-${idx}-${i}`}>{renderText(seg, op.attributes)}</span>)
        if (i < segments.length - 1) {
          // 줄바꿈 → 문단 플러시
          flushLine()
        }
      })
    } else if (op.insert && typeof op.insert === 'object' && (op.insert as DeltaInsertImage).image) {
      flushLine()
      const src = (op.insert as DeltaInsertImage).image!
      blocks.push(
        <figure key={`img-${idx}`} className='my-3'>
          <img
            src={src}
            alt=''
            className='max-w-full rounded cursor-pointer hover:opacity-90 transition-opacity'
            onClick={() => handleImageClick(src)}
          />
        </figure>
      )
    }
  })

  flushLine()
  if (!blocks.length) {
    // 최종 폴백: Delta에서 평문 추출하여 표시
    try {
      let text = ''
      if (typeof parsed === 'string') {
        text = parsed
      } else if (Array.isArray(parsed)) {
        parsed.forEach((op: unknown) => {
          const o = op as Record<string, unknown> | null
          if (typeof o?.insert === 'string') text += o.insert
          else if (typeof o?.text === 'string') text += o.text
        })
      } else if (parsed && typeof parsed === 'object') {
        const parsedObj = parsed as Record<string, unknown>
        if (Array.isArray(parsedObj.ops)) {
          (parsedObj.ops as unknown[]).forEach((op: unknown) => {
            const o = op as Record<string, unknown> | null
            if (typeof o?.insert === 'string') text += o.insert
            else if (typeof o?.text === 'string') text += o.text
          })
        } else if (typeof parsedObj.text === 'string') {
          text = parsedObj.text
        }
      }
      text = (text || '').trim()
      if (text.length) {
        return <div className='prose max-w-none text-gray-900'><p className='whitespace-pre-wrap break-words text-gray-900'>{text}</p></div>
      }
    } catch {}
  }

  return (
    <>
      <div className='prose max-w-none text-gray-900'>{blocks}</div>
      {lightboxImage && <ImageLightbox src={lightboxImage} onClose={closeLightbox} />}
    </>
  )
}

export default QuillDeltaRenderer


