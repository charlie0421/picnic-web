import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupabasePostgrestError } from '@/lib/supabase/error';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 필터링 및 페이지네이션 파라미터
    const status = searchParams.get('status');
    const area = searchParams.get('area');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = createPublicSupabaseServerClient();
    let query = supabase
      .from('vote')
      .select('*, vote_item(*)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) {
      // TODO: 상태에 따른 필터링 로직 추가 (예: ongoing, upcoming, completed)
    }
    if (area) {
      query = query.eq('area', area);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new SupabasePostgrestError(error.message, {
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    return NextResponse.json({
      data,
      count,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
    });

  } catch (error) {
    console.error('[/api/votes] error:', error);
    const status = error instanceof SupabasePostgrestError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status }
    );
  }
} 