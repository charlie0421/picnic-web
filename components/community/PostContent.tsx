import React from 'react'
import QuillDeltaRenderer from '@/lib/content/quill-delta-renderer'

export default function PostContent({ value }: { value: unknown }) {
  return <QuillDeltaRenderer value={value} />
}


