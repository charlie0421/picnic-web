import { redirect } from 'next/navigation'
import { DEFAULT_LANGUAGE } from '@/config/settings'

export default function ConcertRootRedirect() {
  // 정상 흐름에서는 닿지 않는다 — middleware 가 접두어 없는 /concert2025 을 선호 언어 주소로 먼저 보낸다
  // (lib/i18n/locale-routing.ts). middleware 를 거치지 않은 요청을 위한 안전망으로 남겨 둔다.
  redirect(`/${DEFAULT_LANGUAGE}/concert2025`)
}


