import { NextResponse } from 'next/server';
import { getPopups } from '@/utils/api/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const popups = await getPopups();
    return NextResponse.json(popups);
  } catch (error) {
    console.error('[/api/popups] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popups' },
      { status: 500 }
    );
  }
} 