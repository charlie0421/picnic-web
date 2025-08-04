import { createSupabaseServerClient, createPublicSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
    const params = await paramsPromise;
    if (!params || typeof params.id !== 'string') {
      return NextResponse.json({ error: 'Vote ID must be provided as a string.' }, { status: 400 });
    }
    const voteId = parseInt(params.id, 10);
    if (isNaN(voteId)) {
      return NextResponse.json({ error: 'Invalid vote ID format.' }, { status: 400 });
    }

    try {
      const publicSupabase = createPublicSupabaseClient();

      // 1. 투표 기본 정보 및 아이템 정보 가져오기 (Public Client)
      const { data: vote, error: voteError } = await publicSupabase
        .from('vote')
        .select('*, vote_item(*, artist(*, artist_group(*)))')
        .eq('id', voteId)
        .single();

      if (voteError || !vote) {
        console.error(`API Error fetching vote for id ${voteId}:`, voteError);
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }
      
      // 2. 보상 정보 가져오기 (Public Client)
      const { data: rewards, error: rewardsError } = await publicSupabase
        .from('vote_reward')
        .select('reward(*)')
        .eq('vote_id', voteId);

      if (rewardsError) {
        // 보상 정보는 필수 아니므로 에러만 로깅
        console.error(`API Error fetching rewards for vote id ${voteId}:`, rewardsError);
      }
      
      // 3. 사용자 정보 및 투표 기록 가져오기 (Server Client for Auth)
      let user = null;
      let userVotes: { vote_item_id: number; vote_count: number }[] = [];

      try {
        const supabase = await createSupabaseServerClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        user = authUser;

        if (user) {
          const { data, error: userVotesError } = await supabase
            .from('user_vote_history')
            .select('vote_item_id, vote_count')
            .eq('user_id', user.id)
            .eq('vote_id', voteId);
  
          if (userVotesError) {
            console.error(`API Error fetching user vote history for user ${user.id}:`, userVotesError);
          } else {
            userVotes = data || [];
          }
        }
      } catch (e) {
        // 쿠키가 없거나 유효하지 않은 경우 에러가 발생할 수 있음
        // 이 경우 사용자는 로그인하지 않은 상태로 간주
        console.warn('사용자 인증 정보 확인 중 에러 발생 (로그인하지 않은 사용자로 처리)');
      }

      const responsePayload = {
        vote,
        rewards: rewards ? rewards.map(r => r.reward) : [],
        user,
        userVotes,
      };
      
      return NextResponse.json(responsePayload);

    } catch (error) {
      console.error('API Route general error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
} 