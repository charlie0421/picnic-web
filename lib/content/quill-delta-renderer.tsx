import React from 'react'

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

export function QuillDeltaRenderer({ value }: { value: unknown }) {
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
      blocks.push(<figure key={`img-${idx}`} className='my-3'><img src={src} alt='' className='max-w-full rounded' /></figure>)
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
  return <div className='prose max-w-none text-gray-900'>{blocks}</div>
}

export default QuillDeltaRenderer


