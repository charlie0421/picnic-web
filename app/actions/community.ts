'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, withAuth } from '@/lib/supabase/server'
import { getBoardMeta } from '@/lib/data-fetching/server/community-service'

export async function likePost(postId: string, lang: string) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()

    // 토글 방식 구현: 존재 여부 확인 후 insert/delete
    const { data: existing, error: checkError } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      console.error('[community] likePost check error:', checkError)
      return { ok: false }
    }

    if (existing) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
      if (error) {
        console.error('[community] likePost delete error:', error)
        return { ok: false }
      }
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId })
      if (error) {
        console.error('[community] likePost insert error:', error)
        return { ok: false }
      }
    }

    revalidatePath(`/${lang}/community`)
    revalidatePath(`/${lang}/community/${postId}`)
    return { ok: true }
  })
}

export async function toggleBoardBookmark(boardId: string, lang: string) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()

    const { data: existing, error: checkError } = await supabase
      .from('board_user_bookmark')
      .select('board_id')
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      console.error('[community] toggleBoardBookmark check error:', checkError)
      return { ok: false }
    }

    if (existing) {
      const { error } = await supabase
        .from('board_user_bookmark')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', userId)
      if (error) {
        console.error('[community] toggleBoardBookmark delete error:', error)
        return { ok: false }
      }
    } else {
      const { error } = await supabase
        .from('board_user_bookmark')
        .insert({ board_id: boardId, user_id: userId })
      if (error) {
        console.error('[community] toggleBoardBookmark insert error:', error)
        return { ok: false }
      }
    }

    revalidatePath(`/${lang}/community`)
    revalidatePath(`/${lang}/community/boards/${boardId}`)
    return { ok: true }
  })
}

export async function createPost(
  payload: { title: string; deltaJson: unknown; isAnonymous?: boolean; boardId: string; attachments?: { name: string; url: string; type?: string; size?: number }[] },
  lang: string,
) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()
    // 게시글 생성
    const { data, error } = await supabase
      .from('posts')
      .insert({
        title: payload.title,
        content: payload.deltaJson,
        user_id: userId,
        is_anonymous: !!payload.isAnonymous,
        is_temporary: false,
        board_id: payload.boardId,
      })
      .select('id,post_id')
      .single()

    if (error) {
      console.error('[community] createPost error:', error)
      return { ok: false as const }
    }

    const postId = data.post_id ?? data.id

    // 첨부 저장 (있을 경우)
    if (payload.attachments && payload.attachments.length > 0) {
      const attachments = payload.attachments.map((f) => ({
        post_id: postId,
        file_name: f.name,
        file_path: f.url,
        file_type: f.type ?? 'unknown',
        file_size: f.size ?? null,
      }))
      const { error: attErr } = await supabase.from('post_attachments').insert(attachments)
      if (attErr) {
        console.error('[community] createPost attachments error:', attErr)
        // 첨부 저장 실패는 치명적이지 않게 처리
      }
    }

    revalidatePath(`/${lang}/community`)
    revalidatePath(`/${lang}/community/boards/${payload.boardId}`)
    return { ok: true as const, id: postId }
  })
}

export async function createComment(
  postId: string,
  content: string,
  lang: string,
) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        content: { type: 'text', text: content },
        user_id: userId,
      })

    if (error) {
      console.error('[community] createComment error:', error)
      return { ok: false }
    }

    revalidatePath(`/${lang}/community`)
    revalidatePath(`/${lang}/community/${postId}`)
    return { ok: true }
  })
}


