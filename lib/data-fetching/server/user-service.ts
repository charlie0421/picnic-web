import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server';

export { getVoteHistory } from './user-service-vote-history';

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
