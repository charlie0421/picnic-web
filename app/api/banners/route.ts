import { NextResponse } from 'next/server';
import { getBannersForRoute } from '@/utils/api/queries-content';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET() {
  try {
    const banners = await getBannersForRoute();
    return NextResponse.json(banners, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    console.error('[/api/banners] error:', error);
    return NextResponse.json(
      [],
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
