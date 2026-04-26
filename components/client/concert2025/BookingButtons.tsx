'use client'

import { useRequireAuth } from '@/hooks/useAuthGuard'

type BookingButtonsProps = {
  lang: string
  title: string
  firstFloorLabel: string
  secondFloorLabel: string
}

export default function BookingButtons({ lang, title, firstFloorLabel, secondFloorLabel }: BookingButtonsProps) {
  const { navigateWithAuth } = useRequireAuth()

  const firstHref = `/${lang}/mypage/qna/new?category=CONCERT202501`
  const secondHref = `/${lang}/mypage/qna/new?category=CONCERT202502`

  const onClickFirst = async () => {
    await navigateWithAuth(firstHref)
  }

  const onClickSecond = async () => {
    await navigateWithAuth(secondHref)
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm text-center">
      <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent" lang="ko">{title}</h2>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClickFirst}
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 px-4 py-3 font-semibold shadow"
        >
          {firstFloorLabel}
        </button>
        <button
          type="button"
          onClick={onClickSecond}
          className="inline-flex items-center justify-center rounded-lg border border-primary-600 text-primary-700 hover:bg-primary/10 px-4 py-3 font-semibold"
        >
          {secondFloorLabel}
        </button>
      </div>
    </div>
  )
}


