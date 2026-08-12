import { NextResponse, NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseServerClient, getServerUser, isWithdrawnUser } from '@/lib/supabase/server';
import { SupabaseAuthError } from '@/lib/supabase/error';
import { parseWalletSummary, totalAvailable } from '@/lib/wallet/parse';
import { mapVoteEdgeError } from '@/lib/wallet/vote-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 2147483647; // voting-v2 계약 상한 (int4)

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
      !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT
    ) {
      return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 });
    }
    // request_id가 있는데 형식이 틀리면 조용히 치환하지 않고 명시적으로 거부한다.
    if (request_id !== undefined && request_id !== null) {
      if (typeof request_id !== 'string' || !UUID_RE.test(request_id)) {
        return NextResponse.json({ error: 'Invalid request_id' }, { status: 400 });
      }
    }
    // 구 클라이언트 번들 호환: request_id 미전달 시 서버 생성 (멱등 미보장 — 오늘과 동일)
    let requestId: string;
    if (typeof request_id === 'string') {
      requestId = request_id;
    } else {
      console.warn('[/api/vote/submit] request_id missing — legacy client, idempotency not guaranteed');
      requestId = randomUUID();
    }

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

    // 잔액 사전검증: 서버 지갑 요약(star+bonus+cotton). 플래그 OFF 동안 cotton='0'.
    const { data: walletRaw, error: walletError } = await (supabase.rpc as any)('get_wallet_summary');
    if (walletError) {
      console.error('[/api/vote/submit] get_wallet_summary error:', walletError.message);
      return NextResponse.json({ error: 'WALLET_LOAD_FAILED' }, { status: 500 });
    }
    const wallet = parseWalletSummary(walletRaw);
    if (totalAvailable(wallet) < BigInt(amount)) {
      return NextResponse.json({ error: 'WALLET_INSUFFICIENT_BALANCE' }, { status: 400 });
    }

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
