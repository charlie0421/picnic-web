'use server';

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

export const getUserPosts = cache(async ({ page = 1, limit = 10 }: { page: number; limit: number; }) => {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        posts: [],
        pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        error: 'Authentication required',
      };
    }

    const offset = (page - 1) * limit;
    const supabase = await createServerSupabaseClient();

    const { count: totalCount, error: countError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (countError) throw countError;

    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('post_id, title, content, view_count, created_at, is_anonymous, boards (board_id, name)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (postsError) throw postsError;

    const postIds = posts?.map(p => p.post_id) || [];
    let commentCounts: { [key: string]: number } = {};
    if (postIds.length > 0) {
      const { data: commentData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .is('deleted_at', null);
      
      commentData?.forEach(comment => {
        commentCounts[comment.post_id] = (commentCounts[comment.post_id] || 0) + 1;
      });
    }

    const formattedPosts = posts?.map(post => {
      let boardName: string | null = null;
      if ((post as any).boards?.name) {
        const boardNameObj = (post as any).boards.name;
        boardName = typeof boardNameObj === 'object' 
            ? (boardNameObj.ko || boardNameObj.en || 'Unknown Board') 
            : String(boardNameObj);
      }

      return {
        id: post.post_id,
        title: post.title || '제목 없음',
        content: post.content || '',
        viewCount: post.view_count || 0,
        commentCount: commentCounts[post.post_id] || 0,
        createdAt: post.created_at,
        boardName: boardName || '',
        isAnonymous: post.is_anonymous || false
      };
    }) || [];

    const totalPages = Math.ceil((totalCount || 0) / limit);

    return {
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
      error: null,
    };

  } catch (error) {
    console.error('getUserPosts error:', error);
    return {
      posts: [],
      pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
      error: error instanceof Error ? error.message : 'Failed to fetch posts',
    };
  }
});

export const getUserComments = cache(async ({ page = 1, limit = 10, lang = 'ko' }: { page: number; limit: number; lang: string; }) => {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        comments: [],
        pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        statistics: { totalComments: 0, totalLikes: 0, totalBoards: 0, mostActiveBoard: null },
        error: 'Authentication required',
      };
    }

    const offset = (page - 1) * limit;
    const supabase = await createServerSupabaseClient();

    const { count: totalCount, error: countError } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (countError) throw countError;

    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('comment_id, content, created_at, likes, replies, parent_comment_id, is_hidden, locale, post_id, posts!inner(post_id, title, is_anonymous, board_id, boards(board_id, name))')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (commentsError) throw commentsError;

    const { data: statsData, error: statsError } = await supabase
      .from('comments')
      .select('likes, posts!inner(boards(board_id, name))')
      .eq('user_id', user.id)
      .is('deleted_at', null);

    let totalLikes = 0;
    const boardCounts: { [key: string]: number } = {};
    if (statsData && !statsError) {
      statsData.forEach((comment: any) => {
        totalLikes += comment.likes || 0;
        const boardNameObj = comment.posts?.boards?.name;
        let boardName: string | null = null;
        if (boardNameObj) {
          boardName = typeof boardNameObj === 'object' ? (boardNameObj[lang] || boardNameObj.ko || boardNameObj.en) : String(boardNameObj);
        }
        if (boardName) boardCounts[boardName] = (boardCounts[boardName] || 0) + 1;
      });
    }

    const transformedComments = (comments || []).map((comment: any) => {
      let contentText = '';
      if (comment.content) {
        if (typeof comment.content === 'string') contentText = comment.content;
        else if (Array.isArray(comment.content)) contentText = comment.content.map((op: any) => typeof op.insert === 'string' ? op.insert : '').join('').replace(/\\n+/g, ' ').trim();
        else if (typeof comment.content === 'object') contentText = JSON.stringify(comment.content);
      }
      const boardNameObj = comment.posts?.boards?.name;
      let boardName: string | null = null;
      if (boardNameObj) {
        boardName = typeof boardNameObj === 'object' ? (boardNameObj[lang] || boardNameObj.ko || boardNameObj.en) : String(boardNameObj);
      }
      return {
        id: comment.comment_id,
        content: contentText,
        createdAt: comment.created_at,
        postTitle: comment.posts?.title || 'No title',
        postId: comment.posts?.post_id || comment.post_id,
        boardName: boardName || '',
        isAnonymous: comment.posts?.is_anonymous || false,
        likeCount: comment.likes || 0,
        replyCount: comment.replies || 0,
        parentCommentId: comment.parent_comment_id,
        isHidden: comment.is_hidden || false,
        locale: comment.locale
      };
    });
    
    const totalPages = Math.ceil((totalCount || 0) / limit);
    return {
      comments: transformedComments,
      pagination: {
        page, limit, totalCount: totalCount || 0, totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
      statistics: {
        totalComments: totalCount || 0,
        totalLikes,
        totalBoards: Object.keys(boardCounts).length,
        mostActiveBoard: Object.keys(boardCounts).length > 0 ? Object.entries(boardCounts).sort(([,a], [,b]) => b - a)[0][0] : null,
      },
      error: null,
    };
  } catch (error) {
    console.error('getUserComments error:', error);
    return {
      comments: [],
      pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
      statistics: { totalComments: 0, totalLikes: 0, totalBoards: 0, mostActiveBoard: null },
      error: error instanceof Error ? error.message : 'Failed to fetch comments',
    };
  }
});

export const getRechargeHistory = cache(async ({ page = 1, limit = 10 }: { page: number; limit: number; }) => {
  try {
    const user = await getServerUser();
    if (!user) {
      return {
        history: [],
        pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        error: 'Authentication required',
      };
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const supabase = await createServerSupabaseClient();

    const { data, error, count } = await supabase
      .from('view_transaction_all')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    const history = (data || []).map(item => ({
      id: item.transaction_id || `temp-id-${Math.random()}`,
      receiptNumber: item.transaction_id || 'N/A',
      receiptUrl: undefined,
      amount: item.commission || 0,
      starCandyAmount: item.reward_amount || 0,
      bonusAmount: 0, // 뷰에 보너스 정보가 없음
      paymentMethod: item.platform || 'Unknown',
      paymentProvider: item.source || item.ad_network || 'Unknown',
      status: 'completed', // 뷰에 상태 정보가 없음
      currency: 'KRW', // 뷰에 통화 정보가 없음
      storeProductId: item.transaction_id || 'N/A',
      createdAt: item.created_at || new Date().toISOString(),
    }));

    return {
      history,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
      error: null,
    };
  } catch (error) {
    console.error('getRechargeHistory error:', error);
    return {
      history: [],
      pagination: { page, limit, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false },
      error: error instanceof Error ? error.message : 'Failed to fetch recharge history',
    };
  }
});