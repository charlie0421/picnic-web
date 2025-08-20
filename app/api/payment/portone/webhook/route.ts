import { NextRequest, NextResponse } from 'next/server';

// PortOne 서버 웹훅 수신 엔드포인트 (서명 검증/처리는 verify 라우트에서 수행)
export async function POST(request: NextRequest) {
  try {
    // 일단 200 OK로 응답하여 재시도 방지, 실제 검증은 /verify에서 수행
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


