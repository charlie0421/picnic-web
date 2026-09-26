import { NextResponse } from 'next/server';
import { getPopupsForRoute } from '@/utils/api/queries-content';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET() {
  try {
    const popups = await getPopupsForRoute();
    return NextResponse.json(popups, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    console.error('[/api/popups] error:', error);
    return NextResponse.json(
      [],
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
