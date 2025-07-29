import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUser } from '@/lib/supabase/server';
import { SupabasePostgrestError, SupabaseAuthError } from '@/lib/supabase/error';

const DEFAULT_PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      throw new SupabaseAuthError('Authentication required.');
    }

    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(
      searchParams.get('limit') || `${DEFAULT_PAGE_SIZE}`,
      10
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('recharge_history')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

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
    console.error('[/api/user/recharge-history] error:', error);
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