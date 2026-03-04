import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server';

export const getVoteHistory = cache(async ({ page = 1, limit = 10 }: { page: number; limit: number; }) => {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        voteHistory: [],
        pagination: {
          page,
          limit,
          totalCount: 0,
          totalPages: 0,
          hasNext: false,
        },
        statistics: {
          totalStarCandyUsed: 0,
          totalSupportedArtists: 0,
        },
        error: 'Authentication required',
      };
    }

    const offset = (page - 1) * limit;
    const supabase = await createServerSupabaseClient();

    // Parallelize queries
    const [voteHistoryResult, totalCountResult, totalStarCandyResult, uniqueArtistsResult] = await Promise.all([
      supabase
        .from('vote_pick')
        .select(`
          id, vote_id, vote_item_id, amount, created_at,
          vote:vote_id (id, title, start_at, stop_at, main_image, area, vote_category),
          vote_item:vote_item_id (id, artist_id, group_id, artist (id, name, image, artist_group (id, name)))
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from('vote_pick')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('vote_pick')
        .select('amount')
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('vote_pick')
        .select('vote_item_id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
    ]);

    const { data: voteHistory, error: voteHistoryError } = voteHistoryResult;
    if (voteHistoryError) throw voteHistoryError;

    const totalCount = totalCountResult.count || 0;

    const totalStarCandyUsed = totalStarCandyResult.data?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

    const uniqueArtistVoteItemIds = new Set(uniqueArtistsResult.data?.map(item => item.vote_item_id).filter(Boolean));
    let totalSupportedArtists = 0;
    if (uniqueArtistVoteItemIds.size > 0) {
      const { data: artistIds, error: artistIdError } = await supabase
        .from('vote_item')
        .select('artist_id')
        .in('id', Array.from(uniqueArtistVoteItemIds));
      if (!artistIdError) {
        totalSupportedArtists = new Set(artistIds?.map(item => item.artist_id)).size;
      }
    }

    const safeMultiLangText = (text: any) => {
      if (!text) return '';
      if (typeof text === 'string') return text;
      if (typeof text === 'object' && text !== null) {
        if (text.en || text.ko) return text;
        return JSON.stringify(text);
      }
      return String(text);
    };

    const transformedHistory = voteHistory?.map(item => {
      const voteData = Array.isArray(item.vote) ? item.vote[0] : item.vote;
      const voteItemData = Array.isArray(item.vote_item) ? item.vote_item[0] : item.vote_item;
      let artistData: any = voteItemData ? (Array.isArray(voteItemData.artist) ? voteItemData.artist[0] : voteItemData.artist) : null;
      let artistGroupData: any = artistData ? (Array.isArray(artistData.artist_group) ? artistData.artist_group[0] : artistData.artist_group) : null;

      return {
        id: item.id,
        voteId: item.vote_id,
        voteItemId: item.vote_item_id,
        amount: item.amount,
        createdAt: item.created_at,
        vote: voteData ? {
          id: voteData.id,
          title: safeMultiLangText(voteData.title),
          startAt: voteData.start_at,
          stopAt: voteData.stop_at,
          mainImage: voteData.main_image,
          area: voteData.area || '',
          voteCategory: safeMultiLangText(voteData.vote_category)
        } : null,
        voteItem: voteItemData ? {
          id: voteItemData.id,
          artistId: voteItemData.artist_id,
          groupId: voteItemData.group_id,
          artist: artistData ? {
            id: artistData.id,
            name: safeMultiLangText(artistData.name),
            image: artistData.image,
            artistGroup: artistGroupData ? {
              id: artistGroupData.id,
              name: safeMultiLangText(artistGroupData.name)
            } : null
          } : null
        } : null
      };
    }) || [];

    return {
      voteHistory: transformedHistory,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: offset + limit < totalCount,
      },
      statistics: {
        totalStarCandyUsed,
        totalSupportedArtists,
      },
      error: null,
    };

  } catch (error) {
    console.error('getVoteHistory error:', error);
    return {
      voteHistory: [],
      pagination: {
        page,
        limit,
        totalCount: 0,
        totalPages: 0,
        hasNext: false,
      },
      statistics: {
        totalStarCandyUsed: 0,
        totalSupportedArtists: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch vote history',
    };
  }
});
