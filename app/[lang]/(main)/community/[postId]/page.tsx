import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { createMediaSchema } from '@/app/[lang]/utils/seo-utils'
import { getCommunityComments, getCommunityPost } from '@/lib/data-fetching/server/community-service'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import LikeButton from '@/components/community/LikeButton'
import CommentForm from '@/components/community/CommentForm'
import CommentList from '@/components/community/CommentList'
import PostContent from '@/components/community/PostContent'
import PostDeleteButton from '@/components/community/PostDeleteButton'
import AdBanner from '@/components/client/ads/AdBanner'
import { getTranslations } from '@/lib/i18n/server'

export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; postId: string }>
}): Promise<Metadata> {
  const { lang: langParam, postId } = await params
  const lang = String(langParam || 'ko')
  const isrOptions = createISRMetadata(120)
  const post = await getCommunityPost(postId)
  const t = await getTranslations(lang as any)

  return {
    ...createPageMetadata(
      post ? `${post.title} - ${t('community.meta.community')}` : t('community.meta.community'),
      post?.contentPreview ?? t('community.meta.postDescription'),
      {
        alternates: {
          canonical: `${SITE_URL}/${lang}/community/${postId}`,
        },
        openGraph: {
          title: post ? `${post.title} - ${t('community.meta.community')}` : t('community.meta.community'),
          description: post?.contentPreview ?? undefined,
          url: `${SITE_URL}/${lang}/community/${postId}`,
        },
      },
    ),
    ...isrOptions,
  }
}

export default async function CommunityPostDetailPage({
  params,
}: {
  params: Promise<{ lang: string; postId: string }>
}) {
  const { lang: langParam, postId } = await params
  const lang = String(langParam || 'ko')
  const t = await getTranslations(lang as any)
  const post = await getCommunityPost(postId)

  if (!post) {
    return (
      <div className='container mx-auto px-4 py-6'>
        <p>{t('community.post.notFound')}</p>
      </div>
    )
  }

  // 현재 사용자 ID 확인
  const supabase = await createSupabaseServerClient()
  const { data: userResp } = await supabase.auth.getUser()
  const currentUserId = userResp?.user?.id
  const isOwner = currentUserId && currentUserId === post.userId

  const comments = await getCommunityComments(postId)

  // 삭제된 게시물인 경우
  if (post.isDeleted) {
    return (
      <div className='container mx-auto px-4 py-6 space-y-6'>
        <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; {t('community.post.backToList')}</a>
        <article className='space-y-3'>
          <div className='bg-gray-100 border border-gray-200 rounded-lg p-6 text-center'>
            <h1 className='text-lg font-medium text-gray-500'>{t('community.deleted.title')}</h1>
            <p className='text-sm text-gray-400 mt-2'>{t('community.deleted.desc')}</p>
          </div>
        </article>

        {/* 댓글은 유지 */}
        <section className='space-y-3'>
          <h2 className='text-lg font-medium text-gray-900'>{t('community.post.repliesHeading')}</h2>
          <CommentList comments={comments} lang={lang} postId={postId} />
        </section>
      </div>
    )
  }

  return (
    <div className='container mx-auto px-4 py-6 space-y-6'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createMediaSchema(
              post.title,
              post.contentPreview || t('community.meta.postDescription'),
              undefined,
              post.createdAt,
              undefined,
              `${SITE_URL}/${lang}/community/${postId}`,
            ),
          ),
        }}
      />
      <div className='flex items-center justify-between'>
        <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; {t('community.post.backToList')}</a>
        {isOwner && (
          <PostDeleteButton postId={post.id} lang={lang} />
        )}
      </div>
      <article className='space-y-3'>
        <h1 className='text-xl font-semibold text-gray-900'>{post.title}</h1>
        <div className='flex items-center gap-2 text-sm text-gray-600'>
          {!post.isAnonymous && post.author?.avatarUrl ? (
            <img
              src={post.author.avatarUrl}
              alt={post.author.nickname || ''}
              className='w-6 h-6 rounded-full object-cover'
            />
          ) : (
            <div className='w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center'>
              <span className='text-xs text-gray-500'>?</span>
            </div>
          )}
          <span className='font-medium'>
            {post.isAnonymous ? t('community.post.anonymous', '익명') : (post.author?.nickname || t('community.post.unknownUser', '사용자'))}
          </span>
          <span>·</span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <PostContent value={post.content} />
        <div className='text-xs text-gray-600'>{t('community.post.commentsCount', { count: String(post.replyCount) })} · {t('community.post.viewsCount', { count: String(post.viewCount) })}</div>
        <div className='pt-2'>
          <LikeButton postId={post.id} lang={lang} liked={!!post.likedByMe} likeCount={post.likeCount} />
        </div>
      </article>

      {/* AdSense 배너 광고 */}
      <AdBanner className='my-4' />

      <section className='space-y-3'>
        <h2 className='text-lg font-medium text-gray-900'>{t('community.post.repliesHeading')}</h2>
        <CommentList comments={comments} lang={lang} postId={postId} />
        <CommentForm postId={post.id} lang={lang} />
      </section>
    </div>
  )
}


