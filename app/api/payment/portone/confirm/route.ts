import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server';

// PortOne v2 브라우저 SDK confirmUrl 엔드포인트
// 브라우저 SDK가 결제 직전 서버 컨펌을 위해 호출.
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, reason: 'unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { paymentId, orderName, totalAmount, customData } = body;

    // Validate required fields
    if (!paymentId || !totalAmount) {
      return NextResponse.json(
        { ok: false, reason: 'missing_required_fields' },
        { status: 400 }
      );
    }

    // Validate that totalAmount is a positive number
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      return NextResponse.json(
        { ok: false, reason: 'invalid_amount' },
        { status: 400 }
      );
    }

    // Validate customData contains userId matching the authenticated user
    let parsedCustomData;
    try {
      parsedCustomData = typeof customData === 'string' ? JSON.parse(customData) : customData;
    } catch {
      return NextResponse.json(
        { ok: false, reason: 'invalid_custom_data' },
        { status: 400 }
      );
    }

    if (parsedCustomData?.userId && parsedCustomData.userId !== user.id) {
      return NextResponse.json(
        { ok: false, reason: 'user_mismatch' },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[PortOne Confirm] Error:', e);
    return NextResponse.json(
      { ok: false, reason: 'confirm_failed' },
      { status: 400 }
    );
  }
}
