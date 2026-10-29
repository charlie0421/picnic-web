import 'server-only';

import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type SitemapVote = Pick<Database['public']['Tables']['vote']['Row'], 'id' | 'updated_at' | 'created_at'>;

/** Read only the public vote metadata needed to build sitemap URLs. */
export async function getSitemapVotes(): Promise<SitemapVote[]> {
  const client = createPublicSupabaseServerClient();
  const visibleAt = new Date().toISOString();
  const votes: SitemapVote[] = [];
  let lastId: number | undefined;

  while (true) {
    let query = client.from('vote')
      .select('id,updated_at,created_at')
      .is('deleted_at', null)
      .lte('visible_at', visibleAt)
      .order('id', { ascending: true })
      .limit(500);

    if (lastId !== undefined) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`getSitemapVotes: ${error.message}`);
    // A server row cap can return fewer than 500 rows even when more remain.
    if (!data?.length) return votes;

    votes.push(...data);
    lastId = data[data.length - 1].id;
  }
}
