"use client"
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/hooks/useTranslations'

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}

export default function BoardSearch({ lang }: { lang: string }) {
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
    <div className='relative'>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('community.input.searchBoard.placeholder')}
        className='w-full border rounded px-3 py-2 pr-9'
        aria-label={t('community.input.searchBoard.placeholder')}
      />
      {/* loading indicator */}
      <div className='absolute right-2 top-1/2 -translate-y-1/2'>
        {loading ? <div className='w-4 h-4 rounded-full bg-primary-300 animate-pulse-light' /> : null}
      </div>
      {open && items.length > 0 && (
        <div className='absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-72 overflow-auto'>
          <ul className='max-h-64 overflow-auto'>
            {items.map((it) => (
              <li key={it.boardId}>
                <a className='block px-3 py-2 hover:bg-gray-50' href={`/${lang}/community/boards/${it.boardId}`}>
                  <div className='text-sm font-medium text-gray-900'>{it.name}</div>
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


