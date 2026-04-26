"use client"

import Image from 'next/image'
import { useEffect, useState } from 'react'

export type PosterItem = { src: string; alt?: string; slug?: string; variant?: number }

export default function PosterGrid({ posters }: { posters: PosterItem[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentIdx, setCurrentIdx] = useState<number>(-1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') setIsOpen(false)
      if (e.key === 'ArrowRight') setCurrentIdx((i) => (i + 1) % posters.length)
      if (e.key === 'ArrowLeft') setCurrentIdx((i) => (i - 1 + posters.length) % posters.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, posters.length])

  const openAt = (idx: number) => {
    setCurrentIdx(idx)
    setIsOpen(true)
  }

  const close = () => setIsOpen(false)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {posters.map((p, i) => (
          <button
            key={`${p.src}-${i}`}
            type="button"
            onClick={() => openAt(i)}
            className="group relative rounded-xl overflow-hidden border border-primary/10 shadow focus:outline-none focus:ring-2 focus:ring-point/40"
          >
            <div className="p-2">
              <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden">
                <Image src={p.src} alt={p.alt || p.slug || 'poster'} fill sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 200px" className="object-cover" />
              </div>
              <div className="sr-only">{p.alt || p.slug || 'poster'}</div>
            </div>
          </button>
        ))}
      </div>

      {isOpen && currentIdx >= 0 && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.currentTarget === e.target) close()
          }}
        >
          <div className="relative max-w-6xl w-full">
            <button
              type="button"
              aria-label="닫기"
              className="absolute -top-3 -right-3 z-[70] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-md border hover:bg-gray-50"
              onClick={close}
            >
              ×
            </button>
            <div className="relative w-full aspect-[3/4] md:aspect-[16/9] bg-white rounded-lg overflow-hidden">
              <Image
                src={posters[currentIdx].src}
                alt={posters[currentIdx].alt || posters[currentIdx].slug || 'poster'}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}


