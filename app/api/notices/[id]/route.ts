import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const id = request.nextUrl.pathname.split('/').pop();

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .eq('id', Number(id))
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // PostgREST code for "No rows found"
        return NextResponse.json(
          { error: 'Notice not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Notice not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(`[/api/notices/[id]] error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notice' },
      { status: 500 }
    );
  }
} 