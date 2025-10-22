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

  return {
    ...createPageMetadata(
      post ? `${post.title} - 커뮤니티` : '커뮤니티',
      post?.contentPreview ?? '피크닠 커뮤니티 게시글',
      {
        alternates: {
          canonical: `${SITE_URL}/${lang}/community/${postId}`,
        },
        openGraph: {
          title: post ? `${post.title} - 커뮤니티` : '커뮤니티',
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
  const post = await getCommunityPost(postId)

  if (!post) {
    return (
      <div className='container mx-auto px-4 py-6'>
        <p>게시글을 찾을 수 없습니다.</p>
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
              post.contentPreview || '피크닠 커뮤니티 게시글',
              undefined,
              post.createdAt,
              undefined,
              `${SITE_URL}/${lang}/community/${postId}`,
            ),
          ),
        }}
      />
      <a href={`/${lang}/community`} className='text-sm text-gray-700'>&larr; 목록으로</a>
      <article className='space-y-3'>
        <h1 className='text-xl font-semibold'>{post.title}</h1>
        <PostContent value={post.content} />
        <div className='text-xs text-gray-600'>댓글 {post.replyCount} · 조회 {post.viewCount}</div>
        <div className='pt-2'>
          <LikeButton postId={post.id} lang={lang} liked={!!post.likedByMe} likeCount={post.likeCount} />
        </div>
      </article>

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>댓글</h2>
        <CommentList comments={comments} />
        <CommentForm postId={post.id} lang={lang} />
      </section>
    </div>
  )
}


