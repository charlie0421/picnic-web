import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface CommunityPostSummary {
  id: string
  title: string
  contentPreview: string | null
  replyCount: number
  viewCount: number
  createdAt: string
  userId: string
}

export interface CommunityPostDetail extends CommunityPostSummary {
  content: unknown
  attachments: string[] | null
  likeCount?: number
  likedByMe?: boolean
}

export interface CommunityComment {
  commentId: string
  content: unknown
  createdAt: string
  userId: string | null
  likes: number
  parentCommentId: string | null
}

export interface FeedResult {
  posts: CommunityPostSummary[]
  hasNext: boolean
  nextPage: number | null
}

export interface CommunityBoardSummary {
  id: string
  boardId: string
  name: string
  description: string | null
  isOfficial: boolean | null
  artist?: { id: number; name: string; image: string | null; groupName?: string | null } | null
}

export interface CommunityBoardMeta {
  boardId: string
  name: string
  description: string | null
  artist?: { id: number; name: string; image: string | null; groupName?: string | null } | null
}

export interface CommunityHotPostSummary extends CommunityPostSummary {
  boardId: string | null
  boardName?: string | null
}

export async function getCommunityFeed({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<FeedResult> {
  const supabase = await createSupabaseServerClient()

  const from = (page - 1) * limit
  const to = from + limit - 1

  // posts 테이블 필드 참조: types/interfaces.ts 의 Posts 인터페이스
  const { data, error, count } = await supabase
    .from('posts')
    .select('post_id,id,title,content,reply_count,view_count,created_at,user_id', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[community] getCommunityFeed error:', error)
    return { posts: [], hasNext: false, nextPage: null }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)
  const mapped: CommunityPostSummary[] = (data ?? []).map((p: any) => ({
    id: p.post_id ?? p.id,
    title: p.title,
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
  }))

  return {
    posts: mapped,
    hasNext: page < totalPages,
    nextPage: page < totalPages ? page + 1 : null,
  }
}

export async function getCommunityPost(postId: string): Promise<CommunityPostDetail | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('posts')
    .select('post_id,id,title,content,attachments,reply_count,view_count,created_at,user_id')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    if (error) console.error('[community] getCommunityPost error:', error)
    return null
  }

  // 좋아요 카운트 및 내 좋아요 여부
  let likeCount: number | undefined = undefined
  let likedByMe: boolean | undefined = undefined
  try {
    const [{ count }, { data: userResp }] = await Promise.all([
      supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', data.post_id ?? data.id),
      supabase.auth.getUser(),
    ])
    likeCount = count ?? 0
    const userId = userResp?.user?.id
    if (userId) {
      const { data: existing } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('post_id', data.post_id ?? data.id)
        .eq('user_id', userId)
        .maybeSingle()
      likedByMe = !!existing
    }
  } catch (e) {
    // 안전 무시
  }

  return {
    id: data.post_id ?? data.id,
    title: data.title,
    contentPreview: Array.isArray(data.content) ? String(data.content?.[0]?.text ?? '') : null,
    replyCount: data.reply_count ?? 0,
    viewCount: data.view_count ?? 0,
    createdAt: data.created_at,
    userId: data.user_id,
    content: data.content,
    attachments: data.attachments ?? null,
    likeCount,
    likedByMe,
  }
}

export async function getHotCommunityPosts({ limit = 5, days = 7 }: { limit?: number; days?: number } = {}): Promise<CommunityHotPostSummary[]> {
  const supabase = await createSupabaseServerClient()
  const safeLimit = Math.max(1, Math.min(limit ?? 5, 20))
  const sinceIso = typeof days === 'number' && days > 0
    ? (() => {
        const since = new Date()
        since.setDate(since.getDate() - days)
        return since.toISOString()
      })()
    : undefined

  const fetchHotPosts = async (since?: string) => {
    let query = supabase
      .from('posts')
      .select('post_id,id,title,content,reply_count,view_count,created_at,user_id,board_id')
      .is('deleted_at', null)
      .order('view_count', { ascending: false })
      .limit(safeLimit)
    if (since) {
      query = query.gte('created_at', since)
    }
    const { data, error } = await query
    if (error) {
      console.error('[community] getHotCommunityPosts error:', error)
    }
    return data ?? []
  }

  let primaryPosts: any[] = []
  if (sinceIso) {
    primaryPosts = await fetchHotPosts(sinceIso)
  }
  if (!sinceIso || primaryPosts.length < safeLimit) {
    const fallbackPosts = await fetchHotPosts()
    const seen = new Set(primaryPosts.map((p) => String(p.post_id ?? p.id)))
    for (const post of fallbackPosts) {
      const id = String(post.post_id ?? post.id)
      if (!seen.has(id)) {
        primaryPosts.push(post)
        seen.add(id)
      }
      if (primaryPosts.length >= safeLimit) break
    }
  }

  if (primaryPosts.length === 0) {
    return []
  }

  const boardIds = Array.from(new Set(primaryPosts.map((p: any) => p.board_id).filter((id: any) => !!id).map((id: any) => String(id))))
  let boardNameMap = new Map<string, string>()
  if (boardIds.length > 0) {
    try {
      const boards = await getBoardsByIds(boardIds)
      boardNameMap = new Map(boards.map((b) => [String(b.boardId), b.name]))
    } catch (e) {
      console.warn('[community] getHotCommunityPosts board fetch error:', e)
    }
  }

  return primaryPosts.slice(0, safeLimit).map((p: any) => ({
    id: p.post_id ?? p.id,
    title: p.title ?? '',
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
    boardId: p.board_id ? String(p.board_id) : null,
    boardName: p.board_id ? boardNameMap.get(String(p.board_id)) ?? null : null,
  }))
}

export async function getCommunityComments(postId: string): Promise<CommunityComment[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('comments')
    .select('comment_id,content,created_at,user_id,likes,parent_comment_id')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[community] getCommunityComments error:', error)
    return []
  }

  return (data ?? []).map((c: any) => ({
    commentId: c.comment_id,
    content: c.content,
    createdAt: c.created_at,
    userId: c.user_id,
    likes: c.likes ?? 0,
    parentCommentId: c.parent_comment_id,
  }))
}

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
  const boards: CommunityBoardSummary[] = (data ?? []).map((b: any) => {
    const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
    const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
    return {
      id: b.id,
      boardId: b.board_id ?? b.id,
      name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
      description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
      isOfficial: b.is_official ?? null,
      artist: artistRaw ? {
        id: artistRaw.id,
        name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
        image: artistRaw.image ?? null,
        groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
      } : null,
    }
  })

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
  const posts: CommunityPostSummary[] = (data ?? []).map((p: any) => ({
    id: p.post_id ?? p.id,
    title: p.title,
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.insert ?? p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
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

  const artistRaw = data.artist ? (Array.isArray(data.artist) ? data.artist[0] : data.artist) : null
  const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
  return {
    boardId: data.board_id ?? boardId,
    name: typeof data.name === 'string' ? data.name : (data.name?.ko ?? data.name?.en ?? ''),
    description: typeof data.description === 'string' ? data.description : (data.description?.ko ?? data.description?.en ?? null),
    artist: artistRaw ? {
      id: artistRaw.id,
      name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
      image: artistRaw.image ?? null,
      groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
    } : null,
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
    .map((r: any) => r.artist_id)
    .filter((v: any) => typeof v === 'number')
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
  return (data ?? []).map((r: any) => String(r.board_id))
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

  return data.map((b: any) => {
    const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
    const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
    return {
      id: b.id,
      boardId: b.board_id ?? b.id,
      name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
      description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
      isOfficial: b.is_official ?? null,
      artist: artistRaw ? {
        id: artistRaw.id,
        name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
        image: artistRaw.image ?? null,
        groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
      } : null,
    }
  })
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

  return (data ?? []).map((b: any) => {
    const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
    const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
    return {
      id: b.id,
      boardId: b.board_id ?? b.id,
      name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
      description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
      isOfficial: b.is_official ?? null,
      artist: artistRaw ? {
        id: artistRaw.id,
        name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
        image: artistRaw.image ?? null,
        groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
      } : null,
    }
  })
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
    const boards: CommunityBoardSummary[] = boardsData.map((b: any) => {
      const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
      const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
      return {
        id: b.id,
        boardId: b.board_id ?? b.id,
        name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
        description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
        isOfficial: b.is_official ?? null,
        artist: artistRaw ? {
          id: artistRaw.id,
          name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
          image: artistRaw.image ?? null,
          groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
        } : null,
      }
    })
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

  const favSet = new Set<number>((favs ?? []).map((r: any) => r.artist_id).filter((v: any) => typeof v === 'number'))

  // 보드 목록을 사용자의 아티스트 보드 먼저 오도록 재배열(기존 order 정렬은 유지)
  const myBoards = boardsData.filter((b: any) => favSet.has(b.artist_id))
  const otherBoards = boardsData.filter((b: any) => !favSet.has(b.artist_id))
  const arranged = [...myBoards, ...otherBoards]

  const boards: CommunityBoardSummary[] = arranged.map((b: any) => {
    const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
    const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
    return {
      id: b.id,
      boardId: b.board_id ?? b.id,
      name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
      description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
      isOfficial: b.is_official ?? null,
      artist: artistRaw ? {
        id: artistRaw.id,
        name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
        image: artistRaw.image ?? null,
        groupName: groupRaw ? (typeof groupRaw.name === 'string' ? groupRaw.name : (groupRaw.name?.ko ?? groupRaw.name?.en ?? '')) : null,
      } : null,
    }
  })

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

  const boards: CommunityBoardSummary[] = data.map((b: any) => {
    const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
    return {
      id: b.id,
      boardId: b.board_id ?? b.id,
      name: typeof b.name === 'string' ? b.name : (b.name?.ko ?? b.name?.en ?? ''),
      description: typeof b.description === 'string' ? b.description : (b.description?.ko ?? b.description?.en ?? null),
      isOfficial: b.is_official ?? null,
      artist: artistRaw ? {
        id: artistRaw.id,
        name: typeof artistRaw.name === 'string' ? artistRaw.name : (artistRaw.name?.ko ?? artistRaw.name?.en ?? ''),
        image: artistRaw.image ?? null,
      } : null,
    }
  })

  return { boards, hasNext: false, nextPage: null }
}


