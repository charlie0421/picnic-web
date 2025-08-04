import { getTranslations } from '@/lib/i18n/server';
import { getUserPosts, getVoteHistory } from '@/lib/data-fetching/server/user-service';
import { Suspense } from 'react';
import PostsClient from './PostsClient';
import PostsSkeleton from '@/components/server/mypage/PostsSkeleton';

interface PostsPageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
  }>;
}

export default async function PostsPage(props: PostsPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  const { lang } = params;

  const t = await getTranslations(lang as any);
  const {
    posts,
    pagination,
    error: postsError,
  } = await getUserPosts({ page, limit });
  const { statistics, error: statsError } = await getVoteHistory({
    page: 1,
    limit: 10,
  });

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const initialError = postsError || statsError;

  return (
    <Suspense fallback={<PostsSkeleton />}>
      <PostsClient
        initialPosts={posts}
        initialPagination={{
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        }}
        initialError={initialError}
      />
    </Suspense>
  );
}
