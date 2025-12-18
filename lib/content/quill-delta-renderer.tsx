'use client'

import React, { useState, useCallback } from 'react'

type DeltaOp = { insert?: string | { image?: string }; attributes?: Record<string, any> }
type Delta = { ops: DeltaOp[] } | DeltaOp[] | any

function renderText(text: string, attrs?: Record<string, any>) {
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

  let parsed: any = value
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
  if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed && !('ops' in (parsed as any))) {
    const maybeText = (parsed as any).text
    if (typeof maybeText === 'string') {
      parsed = [{ insert: maybeText }]
    } else {
      // 다국어 JSON 형식 처리: { "en": "text", "ko": "텍스트" }
      // 언어 코드로 보이는 키(2-5자)가 있고 값이 문자열인 경우
      const keys = Object.keys(parsed as object)
      const langKey = keys.find(k => k.length >= 2 && k.length <= 5 && typeof (parsed as any)[k] === 'string')
      if (langKey) {
        // 브라우저 언어 또는 첫 번째 키 사용
        const browserLang = typeof window !== 'undefined' ? window.navigator.language?.split('-')[0] : 'en'
        const langText = (parsed as any)[browserLang] || (parsed as any)[langKey] || ''
        if (langText) {
          parsed = [{ insert: langText }]
        }
      }
    }
  }

  const rawOps: any[] = Array.isArray(parsed)
    ? (parsed as any[])
    : (typeof parsed === 'object' && parsed && 'ops' in (parsed as any))
      ? (parsed as any).ops
      : []

  // 일부 데이터는 { text: "..." } 형태를 사용하므로 insert로 정규화
  const ops: DeltaOp[] = rawOps.map((op: any) => {
    if (op && typeof op === 'object') {
      if (typeof op.insert === 'string') return op as DeltaOp
      if (typeof op.text === 'string') return { insert: op.text, attributes: op.attributes }
      if (op.insert && typeof op.insert === 'object' && op.insert.image) return op as DeltaOp
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
    } else if (op.insert && typeof op.insert === 'object' && (op.insert as any).image) {
      flushLine()
      const src = (op.insert as any).image
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
        parsed.forEach((op: any) => {
          if (typeof op?.insert === 'string') text += op.insert
          else if (typeof op?.text === 'string') text += op.text
        })
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).ops)) {
        ;(parsed as any).ops.forEach((op: any) => {
          if (typeof op?.insert === 'string') text += op.insert
          else if (typeof op?.text === 'string') text += op.text
        })
      } else if (parsed && typeof parsed === 'object' && typeof (parsed as any).text === 'string') {
        text = (parsed as any).text
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


