'use client';

import { useEffect, type RefObject } from 'react';
import { PlaybackClock } from '@/lib/charts/playback-clock';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function usePlaybackMeasurement(
    ref: RefObject<HTMLVideoElement | null>,
    impression: string | null,
    permitted: boolean,
) {
    useEffect(() => {
        const video = ref.current;
        if (!permitted || !video || !impression) return;
        const client = createBrowserSupabaseClient();
        const clock = new PlaybackClock();
        let lastSent = 0,
            attempts = 0,
            lastAttempt = -Infinity,
            pending = false,
            active = true;
        const controller = new AbortController();
        const submit = async () => {
            const amount = Math.floor(clock.total),
                now = performance.now();
            if (!active || pending || attempts >= 3 || amount <= lastSent || now - lastAttempt < 1000) return;
            pending = true;
            lastAttempt = now;
            try {
                const { data } = await client.auth.getSession();
                if (!active || !data.session) return;
                const r = await fetch(
                    new URL('/rest/v1/rpc/record_kpop_playback', process.env.NEXT_PUBLIC_SUPABASE_URL),
                    {
                        method: 'POST',
                        cache: 'no-store',
                        credentials: 'omit',
                        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]),
                        headers: {
                            'Content-Type': 'application/json',
                            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                            Authorization: 'Bearer ' + data.session.access_token,
                        },
                        body: JSON.stringify({ p_impression: impression, p_watched_ms: amount }),
                    },
                );
                if (r.ok) {
                    lastSent = amount;
                    attempts = 0;
                } else if (r.status >= 400 && r.status < 500 && r.status !== 429) {
                    attempts = 3;
                } else attempts++;
            } catch {
                attempts++;
            } finally {
                pending = false;
            }
        };
        const interrupt = () => {
            clock.interrupt();
            void submit();
        };
        const tick = () => {
            if (
                document.hidden ||
                video.paused ||
                video.seeking ||
                video.ended ||
                video.readyState < 2 ||
                video.playbackRate !== 1
            ) {
                interrupt();
                return;
            }
            clock.observe(video.currentTime * 1000, performance.now());
            if (clock.total - lastSent >= 5000) void submit();
        };
        video.addEventListener('timeupdate', tick);
        const stops = ['pause', 'seeking', 'waiting', 'stalled', 'ended', 'ratechange'];
        stops.forEach((name) => video.addEventListener(name, interrupt));
        document.addEventListener('visibilitychange', interrupt);
        return () => {
            active = false;
            controller.abort();
            video.removeEventListener('timeupdate', tick);
            stops.forEach((name) => video.removeEventListener(name, interrupt));
            document.removeEventListener('visibilitychange', interrupt);
        };
    }, [ref, impression, permitted]);
}
