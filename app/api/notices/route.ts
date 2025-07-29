import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, created_at, is_pinned')
      .eq('status', 'published')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/notices] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notices' },
      { status: 500 }
    );
  }
} 