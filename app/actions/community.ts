'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, withAuth } from '@/lib/supabase/server'

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

export async function createPost(
  payload: { title: string; content: string },
  lang: string,
) {
  return withAuth(async (userId) => {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('posts')
      .insert({
        title: payload.title,
        content: [{ type: 'text', text: payload.content }],
        user_id: userId,
        is_anonymous: false,
        is_temporary: false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[community] createPost error:', error)
      return { ok: false as const }
    }

    revalidatePath(`/${lang}/community`)
    return { ok: true as const, id: data.id }
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


