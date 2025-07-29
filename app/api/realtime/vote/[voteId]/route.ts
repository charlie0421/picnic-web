// app/api/realtime/vote/[voteId]/route.ts
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
        .channel(`vote-${numericVoteId}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vote',
            filter: `id=eq.${numericVoteId}`,
          },
          (payload) => {
            const transformedPayload = {
              ...payload,
              new: payload.new ? clientTransformers.transform(payload.new) : null,
              old: payload.old ? clientTransformers.transform(payload.old) : null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'vote', ...transformedPayload })}\n\n`)
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vote_item',
            filter: `vote_id=eq.${numericVoteId}`,
          },
          (payload) => {
            const transformedPayload = {
              ...payload,
              new: payload.new ? clientTransformers.transform(payload.new) : null,
              old: payload.old ? clientTransformers.transform(payload.old) : null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'vote_item', ...transformedPayload })}\n\n`)
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vote_pick',
            filter: `vote_id=eq.${numericVoteId}`,
          },
          (payload) => {
             const transformedPayload = {
              ...payload,
              new: payload.new ? clientTransformers.transform(payload.new) : null,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'vote_pick', ...transformedPayload })}\n\n`)
            );
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[SSE] Subscribed to vote ${numericVoteId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[SSE] Error subscribing to vote ${numericVoteId}: ${status}`);
            controller.close();
          }
        });

      request.signal.addEventListener('abort', () => {
        console.log(`[SSE] Client disconnected from vote ${numericVoteId}, unsubscribing.`);
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