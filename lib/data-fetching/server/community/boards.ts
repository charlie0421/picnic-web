import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  BoardQueryRow,
  CommunityArtistInfo,
  CommunityBoardMeta,
  CommunityBoardSummary,
  CommunityPostSummary,
  FeedResult,
} from './types'
import { mapBoardRowToSummary } from './types'

export async function getBoards({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<{ boards: CommunityBoardSummary[]; hasNext: boolean; nextPage: number | null; }> {
  const supabase = await createSupabaseServerClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabase
    .from('boards')
    .select('id,board_id,name,description,is_official,status,artist_id,order, artist:artist_id ( id, name, image, artist_group ( id, name ) )', { count: 'exact' })
    .eq('status', 'approved')
    .order('order', { ascending: true })
    .range(from, to)

  if (error) {
    console.error('[community] getBoards error:', error)
    return { boards: [], hasNext: false, nextPage: null }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)
  const boards: CommunityBoardSummary[] = (data ?? []).map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))

  return { boards, hasNext: page < totalPages, nextPage: page < totalPages ? page + 1 : null }
}

export async function getBoardPosts(boardId: string, { page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<FeedResult> {
  const supabase = await createSupabaseServerClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabase
    .from('posts')
    .select('post_id,id,title,content,reply_count,view_count,created_at,user_id,board_id')
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[community] getBoardPosts error:', error)
    return { posts: [], hasNext: false, nextPage: null }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)
  let boardArtist: CommunityArtistInfo | null = null
  try {
    const boards = await getBoardsByIds([boardId])
    boardArtist = boards[0]?.artist ?? null
  } catch (e) {
    console.warn('[community] getBoardPosts board fetch error:', e)
  }

  const posts: CommunityPostSummary[] = (data ?? []).map((p) => ({
    id: p.post_id ?? p.id,
    title: p.title,
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.insert ?? p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
    boardId: p.board_id ? String(p.board_id) : boardId,
    boardArtist,
  }))

  return { posts, hasNext: page < totalPages, nextPage: page < totalPages ? page + 1 : null }
}

export async function getBoardMeta(boardId: string): Promise<CommunityBoardMeta | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('boards')
    .select('board_id,name,description, artist:artist_id ( id, name, image, artist_group ( id, name ) )')
    .eq('board_id', boardId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[community] getBoardMeta error:', error)
    return null
  }

  const boardRow = data as unknown as BoardQueryRow
  const mapped = mapBoardRowToSummary(boardRow)
  return {
    boardId: mapped.boardId ?? boardId,
    name: mapped.name,
    description: mapped.description,
    artist: mapped.artist,
  }
}

export async function getUserBookmarkedArtistIds(): Promise<number[]> {
  const supabase = await createSupabaseServerClient()
  const { data: userResp } = await supabase.auth.getUser()
  const userId = userResp?.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('artist_user_bookmark')
    .select('artist_id')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (error) {
    console.warn('[community] getUserBookmarkedArtistIds error:', error)
    return []
  }
  return (data ?? [])
    .map((r) => r.artist_id)
    .filter((v): v is number => typeof v === 'number')
}

export async function getUserBookmarkedBoardIds(): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const { data: userResp } = await supabase.auth.getUser()
  const userId = userResp?.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('board_user_bookmark')
    .select('board_id')
    .eq('user_id', userId)

  if (error) {
    console.warn('[community] getUserBookmarkedBoardIds error:', error)
    return []
  }
  return (data ?? []).map((r) => String(r.board_id))
}

export async function searchBoards(query: string, { limit = 20 }: { limit?: number } = {}): Promise<CommunityBoardSummary[]> {
  const supabase = await createSupabaseServerClient()
  const q = (query || '').trim()
  if (!q) return []

  // 간단 ilike 검색: name/description/artist.name
  const { data, error } = await supabase
    .from('boards')
    .select('id,board_id,name,description,is_official,status,artist_id,order, artist:artist_id ( id, name, image, artist_group ( id, name ) )')
    .eq('status', 'approved')
    .is('deleted_at', null)
    // JSON 컬럼을 텍스트로 추출하여 검색 (PostgREST는 ::cast 미지원)
    .or([
      `name->>ko.ilike.*${q}*`,
      `name->>en.ilike.*${q}*`,
      `description->>ko.ilike.*${q}*`,
      `description->>en.ilike.*${q}*`,
    ].join(','))
    .limit(limit)

  if (error || !data) {
    if (error) console.error('[community] searchBoards error:', error)
    return []
  }

  return data.map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))
}

// 특정 board_id 목록으로 보드들을 조회
export async function getBoardsByIds(ids: string[]): Promise<CommunityBoardSummary[]> {
  const supabase = await createSupabaseServerClient()
  const uniqueIds = Array.from(new Set(ids.map((v) => String(v)).filter(Boolean)))
  if (uniqueIds.length === 0) return []

  const { data, error } = await supabase
    .from('boards')
    .select('id,board_id,name,description,is_official,status,artist_id,order, artist:artist_id ( id, name, image, artist_group ( id, name ) )')
    .eq('status', 'approved')
    .in('board_id', uniqueIds)

  if (error || !data) {
    if (error) console.error('[community] getBoardsByIds error:', error)
    return []
  }

  return (data ?? []).map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))
}

// 사용자의 즐겨찾는(북마크한) 아티스트의 게시판을 우선 노출
export async function getBoardsPrioritizedForUser({ page = 1, limit = 50 }: { page?: number; limit?: number }) {
  const supabase = await createSupabaseServerClient()

  // 사용자 식별
  const { data: userResp } = await supabase.auth.getUser()
  const userId = userResp?.user?.id

  // 기본 보드 목록(정렬 포함)
  const { data: boardsData, error } = await supabase
    .from('boards')
    .select('id,board_id,name,description,is_official,status,artist_id,order, artist:artist_id ( id, name, image, artist_group ( id, name ) )')
    .eq('status', 'approved')
    .order('order', { ascending: true })
    .range((page - 1) * limit, (page - 1) * limit + limit - 1)

  if (error || !boardsData) {
    if (error) console.error('[community] getBoardsPrioritizedForUser error:', error)
    // 실패 시 일반 보드 API로 폴백
    return getBoards({ page, limit })
  }

  if (!userId) {
    // 비로그인 사용자는 기존 정렬 그대로 반환
    const boards: CommunityBoardSummary[] = boardsData.map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))
    return { boards, hasNext: false, nextPage: null }
  }

  // 사용자가 북마크한 아티스트 조회
  const { data: favs, error: favErr } = await supabase
    .from('artist_user_bookmark')
    .select('artist_id')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (favErr) {
    console.warn('[community] artist_user_bookmark fetch error:', favErr)
  }

  const favSet = new Set<number>((favs ?? []).map((r) => r.artist_id).filter((v): v is number => typeof v === 'number'))

  // 보드 목록을 사용자의 아티스트 보드 먼저 오도록 재배열(기존 order 정렬은 유지)
  const myBoards = boardsData.filter((b) => typeof b.artist_id === 'number' && favSet.has(b.artist_id))
  const otherBoards = boardsData.filter((b) => !(typeof b.artist_id === 'number' && favSet.has(b.artist_id)))
  const arranged = [...myBoards, ...otherBoards]

  const boards: CommunityBoardSummary[] = arranged.map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))

  // 단순 페이징(상세 total 계산은 생략) — 기존 UX 동일
  return { boards, hasNext: false, nextPage: null }
}

// 내가 북마크한 아티스트의 게시판만 반환
export async function getBoardsForUserFavoritesOnly({ page = 1, limit = 50 }: { page?: number; limit?: number }) {
  const supabase = await createSupabaseServerClient()

  // 사용자 식별 및 즐겨찾기 아티스트 목록
  const favArtistIds = await getUserBookmarkedArtistIds()
  if (favArtistIds.length === 0) {
    return { boards: [] as CommunityBoardSummary[], hasNext: false, nextPage: null }
  }

  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error } = await supabase
    .from('boards')
    .select('id,board_id,name,description,is_official,status,artist_id,order, artist:artist_id ( id, name, image, artist_group ( id, name ) )')
    .eq('status', 'approved')
    .in('artist_id', favArtistIds)
    .order('order', { ascending: true })
    .range(from, to)

  if (error || !data) {
    if (error) console.error('[community] getBoardsForUserFavoritesOnly error:', error)
    return { boards: [] as CommunityBoardSummary[], hasNext: false, nextPage: null }
  }

  const boards: CommunityBoardSummary[] = data.map((b) => mapBoardRowToSummary(b as unknown as BoardQueryRow))

  return { boards, hasNext: false, nextPage: null }
}
