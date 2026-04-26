import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('qna_categories')
      .select('code,label,question_template,active,order_number')
      .eq('active', true)
      .order('order_number', { ascending: true });

    if (error) {
      console.error('Failed to fetch qna_categories:', error);
      return NextResponse.json({ success: false, error: 'failed_to_fetch_categories' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error('Unexpected error in categories GET:', e);
    return NextResponse.json({ success: false, error: 'unexpected_error' }, { status: 500 });
  }
}


