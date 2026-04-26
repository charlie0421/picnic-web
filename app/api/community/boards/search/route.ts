import { NextRequest, NextResponse } from 'next/server'
import { searchBoards } from '@/lib/data-fetching/server/community-service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const items = await searchBoards(q, { limit: 20 })
  return NextResponse.json({ items: items.map(b => ({ boardId: b.boardId, name: b.name, description: b.description })) })
}


