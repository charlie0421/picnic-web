// Board row type from Supabase query with artist join
export interface BoardQueryRow {
  id: string
  board_id: string
  name: unknown
  description: unknown
  is_official: boolean | null
  status: string
  artist_id: number | null
  order: number | null
  artist: {
    id: number
    name: unknown
    image: string | null
    artist_group: { id: number; name: unknown } | { id: number; name: unknown }[] | null
  } | {
    id: number
    name: unknown
    image: string | null
    artist_group: { id: number; name: unknown } | { id: number; name: unknown }[] | null
  }[] | null
}

export function extractLocalizedString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    return String(obj.ko ?? obj.en ?? '')
  }
  return ''
}

export function extractLocalizedStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    return (obj.ko ?? obj.en ?? null) as string | null
  }
  return null
}

export function mapBoardRowToSummary(b: BoardQueryRow): CommunityBoardSummary {
  const artistRaw = b.artist ? (Array.isArray(b.artist) ? b.artist[0] : b.artist) : null
  const groupRaw = artistRaw?.artist_group ? (Array.isArray(artistRaw.artist_group) ? artistRaw.artist_group[0] : artistRaw.artist_group) : null
  return {
    id: b.id,
    boardId: b.board_id ?? b.id,
    name: extractLocalizedString(b.name),
    description: extractLocalizedStringOrNull(b.description),
    isOfficial: b.is_official ?? null,
    artist: artistRaw ? {
      id: artistRaw.id,
      name: extractLocalizedString(artistRaw.name),
      image: artistRaw.image ?? null,
      groupName: groupRaw ? extractLocalizedString(groupRaw.name) : null,
    } : null,
  }
}

export interface CommunityArtistInfo {
  id: number
  name: string
  image: string | null
  groupName?: string | null
}

export interface CommunityPostSummary {
  id: string
  title: string
  contentPreview: string | null
  replyCount: number
  viewCount: number
  createdAt: string
  userId: string
  boardId?: string | null
  boardArtist?: CommunityArtistInfo | null
}

export interface CommunityAuthor {
  nickname: string | null
  avatarUrl: string | null
}

export interface CommunityPostDetail extends CommunityPostSummary {
  content: unknown
  attachments: string[] | null
  likeCount?: number
  likedByMe?: boolean
  isDeleted?: boolean
  isAnonymous?: boolean
  author?: CommunityAuthor | null
}

export interface CommunityComment {
  commentId: string
  content: unknown
  createdAt: string
  userId: string | null
  likes: number
  parentCommentId: string | null
  likedByMe?: boolean
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
  artist?: CommunityArtistInfo | null
}

export interface CommunityBoardMeta {
  boardId: string
  name: string
  description: string | null
  artist?: CommunityArtistInfo | null
}

export interface CommunityHotPostSummary extends CommunityPostSummary {
  boardName?: string | null
}
