import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'ko';

    const { data, error } = await supabase
      .from('faqs')
      .select('id, question, answer, category, created_at')
      .eq('status', 'published')
      .order('order', { ascending: true });

    if (error) {
      throw error;
    }

    // 언어에 맞게 question, answer를 변환하는 로직이 필요하다면 여기에 추가
    const localizedData = data.map(item => ({
        ...item,
        question: item.question?.[lang] || item.question?.['ko'],
        answer: item.answer?.[lang] || item.answer?.['ko'],
    }));

    return NextResponse.json(localizedData);
  } catch (error) {
    console.error('[/api/faqs] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch FAQs' },
      { status: 500 }
    );
  }
} 