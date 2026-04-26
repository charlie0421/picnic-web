"use client"
import React from 'react'

type Shape = 'square' | 'circle'

export default function PulseOverlay({
  visible,
  label,
  shape = 'square',
  size = 96,
  blur = true,
  className,
}: {
  visible: boolean
  label?: string
  shape?: Shape
  size?: number
  blur?: boolean
  className?: string
}) {
  if (!visible) return null
  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
  }
  return (
    <div className={`absolute inset-0 z-10 ${blur ? 'bg-white/60 backdrop-blur-sm' : ''} ${className || ''}`} role="status" aria-live="polite">
      <div className='absolute inset-0 flex items-center justify-center gap-3'>
        <div
          className={`animate-pulse ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'} bg-primary-200`}
          style={boxStyle}
        />
        {label ? <span className='text-sm text-primary-700'>{label}</span> : null}
      </div>
    </div>
  )
}


