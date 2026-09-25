import { NextResponse } from 'next/server';
import { getBanners } from '@/utils/api/queries';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET() {
  try {
    const banners = await getBanners();
    return NextResponse.json(banners, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    console.error('[/api/banners] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch banners' },
      { status: 500 }
    );
  }
}
