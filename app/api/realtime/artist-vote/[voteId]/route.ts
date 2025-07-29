// app/api/realtime/artist-vote/[voteId]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clientTransformers } from '@/lib/supabase/transforms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const voteId = request.nextUrl.pathname.split('/').pop();

  if (!voteId || isNaN(Number(voteId))) {
    return NextResponse.json({ error: 'Invalid voteId' }, { status: 400 });
  }

  const numericVoteId = Number(voteId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start: async (controller) => {
      const supabase = await createSupabaseServerClient();
      const channel = supabase
        .channel(`artist-vote-${numericVoteId}-changes`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'artist_vote',
            filter: `id=eq.${numericVoteId}`,
          },
          (payload) => {
            const transformedPayload = {
              ...payload,
              new: payload.new ? clientTransformers.transform(payload.new) : null,
              old: payload.old ? clientTransformers.transform(payload.old) : null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'artist_vote', ...transformedPayload })}\n\n`)
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'artist_vote_item',
            filter: `artist_vote_id=eq.${numericVoteId}`,
          },
          (payload) => {
            const transformedPayload = {
              ...payload,
              new: payload.new ? clientTransformers.transform(payload.new) : null,
              old: payload.old ? clientTransformers.transform(payload.old) : null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'artist_vote_item', ...transformedPayload })}\n\n`)
            );
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[SSE] Subscribed to artist vote ${numericVoteId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[SSE] Error subscribing to artist vote ${numericVoteId}: ${status}`);
            controller.close();
          }
        });

      request.signal.addEventListener('abort', () => {
        console.log(`[SSE] Client disconnected from artist vote ${numericVoteId}, unsubscribing.`);
        supabase.removeChannel(channel);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
} 