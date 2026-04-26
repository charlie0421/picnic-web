import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  CommunityBoardSummary,
  CommunityComment,
  CommunityHotPostSummary,
  CommunityPostDetail,
  CommunityPostSummary,
  FeedResult,
} from './types'
import { getBoardsByIds } from './boards'

export async function getCommunityFeed({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<FeedResult> {
  const supabase = await createSupabaseServerClient()

  const from = (page - 1) * limit
  const to = from + limit - 1

  // posts 테이블 필드 참조: types/interfaces.ts 의 Posts 인터페이스
  const { data, error, count } = await supabase
    .from('posts')
    .select('post_id,id,title,content,reply_count,view_count,created_at,user_id,board_id', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[community] getCommunityFeed error:', error)
    return { posts: [], hasNext: false, nextPage: null }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)
  const rawPosts: CommunityPostSummary[] = (data ?? []).map((p) => ({
    id: p.post_id ?? p.id,
    title: p.title,
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
    boardId: p.board_id ? String(p.board_id) : null,
    boardArtist: null,
  }))

  const boardIds = Array.from(
    new Set(
      rawPosts
        .map((post) => post.boardId)
        .filter((id): id is string => typeof id === 'string' && !!id),
    ),
  )
  let boardMap = new Map<string, CommunityBoardSummary>()
  if (boardIds.length > 0) {
    try {
      const boards = await getBoardsByIds(boardIds)
      boardMap = new Map(boards.map((b) => [String(b.boardId), b]))
    } catch (e) {
      console.warn('[community] getCommunityFeed board fetch error:', e)
    }
  }

  const mapped: CommunityPostSummary[] = rawPosts.map((post) => ({
    ...post,
    boardArtist: post.boardId ? boardMap.get(post.boardId)?.artist ?? null : null,
  }))

  return {
    posts: mapped,
    hasNext: page < totalPages,
    nextPage: page < totalPages ? page + 1 : null,
  }
}

export async function getCommunityPost(postId: string): Promise<CommunityPostDetail | null> {
  const supabase = await createSupabaseServerClient()

  // 삭제된 게시물도 조회 (댓글은 유지되므로)
  // user_profiles 조인하여 작성자 정보 가져오기
  const { data, error } = await supabase
    .from('posts')
    .select('post_id,id,title,content,attachments,reply_count,view_count,created_at,user_id,deleted_at,is_anonymous,user_profiles!posts_user_id_fkey(nickname,avatar_url)')
    .eq('post_id', postId)
    .single()

  if (error || !data) {
    if (error) console.error('[community] getCommunityPost error:', error)
    return null
  }

  const isDeleted = !!data.deleted_at
  const userProfileData = data.user_profiles as unknown
  const userProfile = Array.isArray(userProfileData)
    ? (userProfileData[0] as { nickname: string | null; avatar_url: string | null } | undefined) ?? null
    : (userProfileData as { nickname: string | null; avatar_url: string | null } | null)

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
    isDeleted,
    isAnonymous: data.is_anonymous ?? false,
    author: userProfile ? {
      nickname: userProfile.nickname,
      avatarUrl: userProfile.avatar_url,
    } : null,
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

  type HotPostRow = Awaited<ReturnType<typeof fetchHotPosts>>[number]
  let primaryPosts: HotPostRow[] = []
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

  const boardIds = Array.from(new Set(primaryPosts.map((p) => p.board_id).filter((id): id is number => !!id).map((id) => String(id))))
  let boardMap = new Map<string, CommunityBoardSummary>()
  if (boardIds.length > 0) {
    try {
      const boards = await getBoardsByIds(boardIds)
      boardMap = new Map(boards.map((b) => [String(b.boardId), b]))
    } catch (e) {
      console.warn('[community] getHotCommunityPosts board fetch error:', e)
    }
  }

  return primaryPosts.slice(0, safeLimit).map((p) => ({
    id: p.post_id ?? p.id,
    title: p.title ?? '',
    contentPreview: Array.isArray(p.content) ? String(p.content?.[0]?.text ?? '') : null,
    replyCount: p.reply_count ?? 0,
    viewCount: p.view_count ?? 0,
    createdAt: p.created_at,
    userId: p.user_id,
    boardId: p.board_id ? String(p.board_id) : null,
    boardName: p.board_id ? boardMap.get(String(p.board_id))?.name ?? null : null,
    boardArtist: p.board_id ? boardMap.get(String(p.board_id))?.artist ?? null : null,
  }))
}

export async function getCommunityComments(postId: string): Promise<CommunityComment[]> {
  const supabase = await createSupabaseServerClient()

  const [{ data, error }, { data: userResp }] = await Promise.all([
    supabase
      .from('comments')
      .select('comment_id,content,created_at,user_id,likes,parent_comment_id')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.auth.getUser(),
  ])

  if (error) {
    console.error('[community] getCommunityComments error:', error)
    return []
  }

  const userId = userResp?.user?.id
  let likedCommentIds = new Set<string>()

  // 로그인 사용자인 경우 좋아요한 댓글 목록 조회
  if (userId && data && data.length > 0) {
    const commentIds = data.map((c) => c.comment_id)
    const { data: likes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', userId)
      .in('comment_id', commentIds)
    likedCommentIds = new Set((likes ?? []).map((l) => l.comment_id))
  }

  return (data ?? []).map((c) => ({
    commentId: c.comment_id,
    content: c.content,
    createdAt: c.created_at,
    userId: c.user_id,
    likes: c.likes ?? 0,
    parentCommentId: c.parent_comment_id,
    likedByMe: likedCommentIds.has(c.comment_id),
  }))
}
