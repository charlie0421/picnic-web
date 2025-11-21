"use client"
import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useTranslations } from '@/hooks/useTranslations'

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}

interface BoardSearchProps {
  lang: string
  className?: string
}

export default function BoardSearch({ lang, className }: BoardSearchProps) {
  const { t } = useTranslations()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [items, setItems] = useState<{ boardId: string; name: string; description?: string | null }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!dq.trim()) {
        setItems([])
        setOpen(false)
        return
      }
      setLoading(true)
      const res = await fetch(`/api/community/boards/search?q=${encodeURIComponent(dq)}`)
      if (!res.ok) return
      const data = await res.json()
      if (!cancelled) {
        setItems(data?.items ?? [])
        setOpen(true)
      }
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [dq])

  return (
    <div className={clsx('relative', className)}>
      <div className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400'>
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
          <circle cx='11' cy='11' r='8' />
          <line x1='21' y1='21' x2='16.65' y2='16.65' />
        </svg>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('community.input.searchBoard.placeholder')}
        className='w-full rounded-full border border-gray-100 bg-white/90 px-11 py-3 pr-14 text-sm text-gray-900 shadow-lg ring-1 ring-black/5 placeholder:text-gray-400 focus:border-primary-300 focus:outline-none focus:ring-primary-200'
        aria-label={t('community.input.searchBoard.placeholder')}
      />
      {/* loading indicator */}
      <div className='absolute right-4 top-1/2 -translate-y-1/2 text-primary-400'>
        {loading ? (
          <div className='h-5 w-5 animate-spin rounded-full border-2 border-primary-300 border-t-transparent' />
        ) : null}
      </div>
      {open && items.length > 0 && (
        <div className='absolute left-0 right-0 z-20 mt-3 max-h-72 overflow-auto rounded-2xl border border-gray-50 bg-white/95 p-2 shadow-2xl shadow-primary-900/10 backdrop-blur'>
          <ul className='space-y-1'>
            {items.map((it) => (
              <li key={it.boardId}>
                <a
                  className='block rounded-xl px-3 py-2 text-left transition hover:bg-primary-50/80'
                  href={`/${lang}/community/boards/${it.boardId}`}
                >
                  <div className='text-sm font-semibold text-gray-900'>{it.name}</div>
                  {it.description ? <div className='text-xs text-gray-600 line-clamp-1'>{it.description}</div> : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}


