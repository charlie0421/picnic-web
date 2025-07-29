import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUser } from '@/lib/supabase/server';
import { SupabaseAuthError, SupabasePostgrestError } from '@/lib/supabase/error';

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      throw new SupabaseAuthError('Authentication required.');
    }

    const { vote_id, vote_item_id, amount } = await request.json();

    if (!vote_id || !vote_item_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    // JMA 투표인지 확인
    const { data: voteDataResult, error: voteError } = await supabase
      .from('vote')
      .select('partner')
      .eq('id', vote_id)
      .single();

    if (voteError) {
      throw new Error('투표 정보를 확인하는 중 오류가 발생했습니다.');
    }

    if (voteDataResult?.partner === 'jma') {
      return NextResponse.json(
        { error: 'JMA 투표는 웹에서 참여할 수 없습니다.' },
        { status: 403 } // Forbidden
      );
    }
    
    // 1. 사용자 프로필에서 별사탕 잔액 조회
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('star_candy, star_candy_bonus')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      throw new Error('사용자 프로필을 찾을 수 없거나 잔액 조회에 실패했습니다.');
    }

    const totalAvailable = (userProfile.star_candy || 0) + (userProfile.star_candy_bonus || 0);
    if (totalAvailable < amount) {
      return NextResponse.json({ error: '별사탕이 부족합니다.' }, { status: 400 });
    }

    // 2. 보너스/일반 별사탕 사용량 계산
    const bonusUsage = Math.min(amount, userProfile.star_candy_bonus || 0);
    const normalUsage = amount - bonusUsage;

    const voteData = {
      vote_id: vote_id,
      vote_item_id: vote_item_id,
      amount: amount,
      user_id: user.id,
      star_candy_usage: normalUsage,
      star_candy_bonus_usage: bonusUsage,
    };

    // 'voting-v2' 엣지 함수를 호출하여 투표 처리
    const { data, error } = await supabase.functions.invoke('voting-v2', {
      body: voteData,
    });

    if (error) {
      // 엣지 함수 에러를 PostgrestError와 유사한 형태로 처리
      throw new SupabasePostgrestError(error.message, {
        details: 'Edge function execution failed',
        hint: 'Check the Supabase function logs for more details.',
        code: 'EDGE_FUNCTION_ERROR',
      });
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[/api/vote/submit] error:', error);
    let status = 500;
    if (error instanceof SupabaseAuthError) {
      status = 401;
    } else if (error instanceof SupabasePostgrestError) {
      status = 400;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status }
    );
  }
}

export async function GET(request: NextRequest) {
    return NextResponse.json(
        { error: "GET 메서드는 지원되지 않습니다." },
        { status: 405 }
    );
}
