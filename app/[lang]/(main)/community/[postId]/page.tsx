import React from 'react'
import { Metadata } from 'next'
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils'
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils'
import { SITE_URL } from '@/app/[lang]/constants/static-pages'
import { createMediaSchema } from '@/app/[lang]/utils/seo-utils'
import { getCommunityComments, getCommunityPost } from '@/lib/data-fetching/server/community-service'
import LikeButton from '@/components/community/LikeButton'
import CommentForm from '@/components/community/CommentForm'
import CommentList from '@/components/community/CommentList'
import PostContent from '@/components/community/PostContent'
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

  const comments = await getCommunityComments(postId)

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
      <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; {t('community.post.backToList')}</a>
      {/* 목록으로 */}
      {/* 위 텍스트 자체는 아이콘+텍스트 조합으로 치환 */}
      <article className='space-y-3'>
        <h1 className='text-xl font-semibold'>{post.title}</h1>
        <PostContent value={post.content} />
        <div className='text-xs text-gray-600'>{t('community.post.commentsCount', { count: String(post.replyCount) })} · {t('community.post.viewsCount', { count: String(post.viewCount) })}</div>
        <div className='pt-2'>
          <LikeButton postId={post.id} lang={lang} liked={!!post.likedByMe} likeCount={post.likeCount} />
        </div>
      </article>

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>{t('community.post.repliesHeading')}</h2>
        <CommentList comments={comments} />
        <CommentForm postId={post.id} lang={lang} />
      </section>
    </div>
  )
}


