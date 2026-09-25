import { NextResponse } from 'next/server';
import { getPopups } from '@/utils/api/queries';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET() {
  try {
    const popups = await getPopups();
    return NextResponse.json(popups, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    console.error('[/api/popups] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popups' },
      { status: 500 }
    );
  }
}
