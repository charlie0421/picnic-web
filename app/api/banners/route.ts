import { NextResponse } from 'next/server';
import { getBanners } from '@/utils/api/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const banners = await getBanners();
    return NextResponse.json(banners);
  } catch (error) {
    console.error('[/api/banners] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch banners' },
      { status: 500 }
    );
  }
} 