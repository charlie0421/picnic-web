import { Vote } from '@/types/interfaces';

// 투표 데이터 변환 함수 (서버/클라이언트 공통)
export const formatVoteData = (voteData: any[]): Vote[] => {
  return voteData.map((vote: any) => ({
    ...vote,
    deletedAt: vote.deleted_at,
    startAt: vote.start_at,
    stopAt: vote.stop_at,
    createdAt: vote.created_at,
    updatedAt: vote.updated_at,
    mainImage: vote.main_image,
    resultImage: vote.result_image,
    waitImage: vote.wait_image,
    voteCategory: vote.vote_category,
    voteContent: vote.vote_content,
    voteSubCategory: vote.vote_sub_category,
    visibleAt: vote.visible_at,
    area: vote.area,
    voteItem: vote.vote_item
      ? vote.vote_item.map((item: any) => ({
          ...item,
          deletedAt: item.deleted_at,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          voteId: item.vote_id,
          artistId: item.artist_id,
          groupId: item.group_id,
          voteTotal: item.vote_total || 0,
          artist: item.artist
            ? {
                ...item.artist,
                image: item.artist.image,
              }
            : null,
        }))
      : [],
    reward: vote.vote_reward
      ? vote.vote_reward.map((vr: any) => vr.reward).filter(Boolean)
      : [],
    title: vote.title || '제목 없음',
  }));
};

// 투표 쿼리 빌더 (서버/클라이언트 공통)
export const buildVoteQuery = (supabase: any, status: string, area: string) => {
  const now = new Date().toISOString();
  
  let query = supabase
    .from('vote')
    .select(`
      *,
      vote_item!vote_id (
        id,
        vote_id,
        artist_id,
        group_id,
        vote_total,
        created_at,
        updated_at,
        deleted_at,
        artist (
          id,
          name,
          image,
          artist_group (
            id,
            name
          )
        )
      ),
      vote_reward (
        reward_id,
        reward:reward_id (*)
      )
    `)
    .is('deleted_at', null);

  // 상태별 필터링
  switch (status) {
    case 'UPCOMING':
      query = query.gt('start_at', now);
      break;
    case 'ONGOING':
      query = query.lte('start_at', now).gte('stop_at', now);
      break;
    case 'COMPLETED':
      query = query.lt('stop_at', now);
      break;
  }

  // 영역별 필터링
  query = query.eq('area', area);
  
  // 정렬
  query = query.order('start_at', { ascending: false });

  return query;
}; 