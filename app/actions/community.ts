'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, withAuth, withAuthAndWithdrawalCheck, WithdrawnUserError } from '@/lib/supabase/server'
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
  try {
    return await withAuthAndWithdrawalCheck(async (userId) => {
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
  } catch (error) {
    if (error instanceof WithdrawnUserError) {
      return { ok: false as const, error: 'A member who has unsubscribed.' }
    }
    throw error
  }
}

export async function deletePost(postId: string, lang: string) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()

    // 게시물 작성자 확인
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('user_id, board_id')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !post) {
      console.error('[community] deletePost fetch error:', fetchError)
      return { ok: false, error: 'post_not_found' }
    }

    // 본인 게시물인지 확인
    if (post.user_id !== userId) {
      return { ok: false, error: 'not_owner' }
    }

    // 소프트 딜리트 (deleted_at 업데이트)
    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('post_id', postId)
      .eq('user_id', userId)

    if (error) {
      console.error('[community] deletePost error:', error)
      return { ok: false, error: 'delete_failed' }
    }

    revalidatePath(`/${lang}/community`)
    revalidatePath(`/${lang}/community/${postId}`)
    if (post.board_id) {
      revalidatePath(`/${lang}/community/boards/${post.board_id}`)
    }
    return { ok: true }
  })
}

export async function createComment(
  postId: string,
  content: string,
  lang: string,
  parentCommentId?: string,
) {
  try {
    return await withAuthAndWithdrawalCheck(async (userId) => {
      const supabase = await createSupabaseServerClient()
      const { error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          content: { type: 'text', text: content },
          user_id: userId,
          parent_comment_id: parentCommentId || null,
        })

      if (error) {
        console.error('[community] createComment error:', error)
        return { ok: false }
      }

      revalidatePath(`/${lang}/community`)
      revalidatePath(`/${lang}/community/${postId}`)
      return { ok: true }
    })
  } catch (error) {
    if (error instanceof WithdrawnUserError) {
      return { ok: false, error: 'A member who has unsubscribed.' }
    }
    throw error
  }
}

export async function likeComment(commentId: string, postId: string, lang: string) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()

    // 토글 방식: 존재 여부 확인 후 insert/delete
    const { data: existing, error: checkError } = await supabase
      .from('comment_likes')
      .select('comment_like_id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      console.error('[community] likeComment check error:', checkError)
      return { ok: false }
    }

    if (existing) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId)
      if (error) {
        console.error('[community] likeComment delete error:', error)
        return { ok: false }
      }
    } else {
      const { error } = await supabase
        .from('comment_likes')
        .insert({ comment_id: commentId, user_id: userId })
      if (error) {
        console.error('[community] likeComment insert error:', error)
        return { ok: false }
      }
    }

    revalidatePath(`/${lang}/community/${postId}`)
    return { ok: true }
  })
}

export async function reportComment(commentId: string, postId: string, reason: string, lang: string) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()

    // 중복 신고 확인
    const { data: existing, error: checkError } = await supabase
      .from('comment_reports')
      .select('comment_report_id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      console.error('[community] reportComment check error:', checkError)
      return { ok: false, error: 'check_failed' }
    }

    if (existing) {
      return { ok: false, error: 'already_reported' }
    }

    const { error } = await supabase
      .from('comment_reports')
      .insert({
        comment_id: commentId,
        user_id: userId,
        reason,
      })

    if (error) {
      console.error('[community] reportComment error:', error)
      return { ok: false, error: 'report_failed' }
    }

    revalidatePath(`/${lang}/community/${postId}`)
    return { ok: true }
  })
}


