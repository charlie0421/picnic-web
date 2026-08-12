import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUser, isWithdrawnUser } from '@/lib/supabase/server';
import { SupabaseAuthError } from '@/lib/supabase/error';
import { mapVoteEdgeError } from '@/lib/wallet/vote-error';
import { clientUpgradeMessage } from '@/lib/wallet/client-upgrade-message';
import { MAX_VOTE_AMOUNT } from '@/lib/wallet/limits';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) throw new SupabaseAuthError('Authentication required.');

    const isWithdrawn = await isWithdrawnUser(user.id);
    if (isWithdrawn) {
      return NextResponse.json({ error: 'A member who has unsubscribed.' }, { status: 403 });
    }

    const { vote_id, vote_item_id, amount, request_id } = await request.json();

    if (
      !Number.isInteger(vote_id) || !Number.isInteger(vote_item_id) ||
      !Number.isInteger(amount) || amount <= 0 || amount > MAX_VOTE_AMOUNT
    ) {
      return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 });
    }
    // request_id 는 필수다. 서버가 대신 생성하면 응답 유실 후 재시도가 매번 새 작업이 되어
    // 이중 차감이 발생한다. 누락·형식오류 모두 전환 응답으로 거부하고 클라이언트 갱신을 요구한다.
    if (typeof request_id !== 'string' || !UUID_RE.test(request_id)) {
      console.warn(
        '[/api/vote/submit] request_id missing or malformed — rejecting (client upgrade required)',
      );
      // 이 응답을 실제로 받는 쪽은 request_id 를 안 보내는 "구 번들"이다.
      // 구 번들은 `error` 문자열을 그대로 화면에 띄우므로 여기에 기계 코드를 넣으면
      // 사용자에게 토큰이 노출된다. 사람이 읽을 문장을 `error` 에 두고,
      // 신규 번들이 분기할 기계 코드는 `code` 로 따로 준다.
      return NextResponse.json(
        {
          error: clientUpgradeMessage(request.headers.get('accept-language')),
          code: 'VOTE_CLIENT_UPGRADE_REQUIRED',
        },
        { status: 400 },
      );
    }
    const requestId = request_id;

    const supabase = await createSupabaseServerClient();

    // JMA 투표 차단 (기존 정책 유지)
    const { data: voteDataResult, error: voteError } = await supabase
      .from('vote').select('partner').eq('id', vote_id).single();
    if (voteError) {
      throw new Error('투표 정보를 확인하는 중 오류가 발생했습니다.');
    }
    if (voteDataResult?.partner === 'jma') {
      return NextResponse.json({ error: 'JMA 투표는 웹에서 참여할 수 없습니다.' }, { status: 403 });
    }

    // 잔액 사전검증은 하지 않는다.
    //
    // 사전검증을 두면 멱등 재생이 깨진다: 잔액 5에서 5표를 request_id A 로 제출해 Edge 가 커밋했지만
    // 응답만 유실된 뒤 같은 A 로 재시도하면, 잔액이 이미 0이라 사전검증이 409 를 먼저 반환해
    // voting-v2 의 "같은 request_id 는 같은 결과" 재생에 도달하지 못한다.
    // 잔액 판정은 서버(voting-v2)가 원자적으로 수행하며 부족 시 409 WALLET_INSUFFICIENT_BALANCE 를
    // 반환하므로 사용자에게 보이는 결과는 동일하다. UI 는 /api/user/wallet 잔액으로 이미 입력을 제한한다.

    // voting-v2 신규 계약: 정확히 4개 키, amount 는 문자열. 배분은 서버 전결(코튼→보너스→스타).
    const { data, error } = await supabase.functions.invoke('voting-v2', {
      body: {
        vote_id,
        vote_item_id,
        amount: String(amount),
        request_id: requestId,
      },
    });

    if (error) {
      // FunctionsHttpError: error.context 가 Response — status/body 를 그대로 전달해
      // 409(잔액부족/멱등충돌)·403(기간)·400(payload) 구분을 클라이언트까지 보존한다.
      const context = (error as { context?: Response }).context;
      let body: unknown;
      try { body = context ? await context.json() : undefined; } catch { body = undefined; }
      const mapped = mapVoteEdgeError(context?.status, body);
      console.error('[/api/vote/submit] voting-v2 error:', mapped.status, mapped.error);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[/api/vote/submit] error:', error);
    const status = error instanceof SupabaseAuthError ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'GET 메서드는 지원되지 않습니다.' }, { status: 405 });
}
