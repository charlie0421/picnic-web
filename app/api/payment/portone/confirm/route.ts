import { NextRequest, NextResponse } from 'next/server';

// PortOne v2 브라우저 SDK confirmUrl 엔드포인트
// 브라우저 SDK가 결제 직전 서버 컨펌을 위해 호출.
export async function POST(request: NextRequest) {
  // 비즈니스 로직상, 서버에서 결제 가능 여부를 판단해 true/false를 반환할 수 있음
  try {
    // TODO: 필요 시 재고/금액/유저 상태 검증 로직 추가
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: 'confirm_failed' }, { status: 400 });
  }
}


