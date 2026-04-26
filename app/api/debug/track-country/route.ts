import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// 이 라우트는 서버에서 현재 인증 사용자 컨텍스트로 Supabase Edge Function(track-country)을 호출해
// 국가코드가 DB(user_profiles, user_country_events)에 반영되는지 검증합니다.

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      return NextResponse.json({ ok: false, error: sessionError.message }, { status: 401 })
    }
    if (!session?.access_token) {
      return NextResponse.json({ ok: false, error: 'no session' }, { status: 401 })
    }

    // 소스는 임의로 debug로 표기
    const { data: fnRes, error: fnErr } = await supabase.functions.invoke('track-country', {
      body: { source: 'debug' },
    })

    if (fnErr) {
      return NextResponse.json({ ok: false, error: fnErr.message }, { status: 500 })
    }

    // 사용자 정보 다시 조회하여 최신 country_code 확인
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id

    let profile: any = null
    if (userId) {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, country_code, updated_at')
        .eq('id', userId)
        .maybeSingle()
      profile = data
    }

    return NextResponse.json({ ok: true, functionResult: fnRes, profile })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}


