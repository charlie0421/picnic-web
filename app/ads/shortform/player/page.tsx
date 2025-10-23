'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type IssuedAd = {
  id: string;
  title: string;
  video_url: string;
  cta_url?: string | null;
  rewards: { view: number; more: number };
};

export default function ShortformAdPlayerPage() {
  const supabase = createBrowserSupabaseClient();
  const [ad, setAd] = useState<IssuedAd | null>(null);
  const [tokens, setTokens] = useState<{ view_token: string; more_token: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [callingView, setCallingView] = useState(false);
  const [callingMore, setCallingMore] = useState(false);
  const [moreOpened, setMoreOpened] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const getAuthToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? `Bearer ${token}` : null;
  }, [supabase]);

  const invokeIssue = useCallback(async () => {
    setIssuing(true);
    try {
      const auth = await getAuthToken();
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ad-shortform-issue`;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (auth) headers.set('Authorization', auth);
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) throw new Error('issue failed');
      const json = await res.json();
      setAd(json.ad);
      setTokens(json.tokens);
    } catch (e) {
      console.error('[issue] error', e);
    } finally {
      setIssuing(false);
    }
  }, [getAuthToken]);

  const callView = useCallback(async () => {
    if (!tokens?.view_token || callingView) return;
    setCallingView(true);
    try {
      const auth = await getAuthToken();
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/callback-ad-shortform-view`;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (auth) headers.set('Authorization', auth);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ token: tokens.view_token }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'view failed');
    } catch (e) {
      console.error('[view] error', e);
    } finally {
      setCallingView(false);
    }
  }, [tokens?.view_token, getAuthToken, callingView]);

  const callMore = useCallback(async () => {
    if (!tokens?.more_token || callingMore) return;
    setCallingMore(true);
    try {
      const auth = await getAuthToken();
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/callback-ad-shortform-more`;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (auth) headers.set('Authorization', auth);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ token: tokens.more_token }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'more failed');
    } catch (e) {
      console.error('[more] error', e);
    } finally {
      setCallingMore(false);
    }
  }, [tokens?.more_token, getAuthToken, callingMore]);

  // 페이지 진입 시 광고 발급
  useEffect(() => {
    invokeIssue();
  }, [invokeIssue]);

  // video 재생 완료 처리 (ended)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      // 끝까지 시청 시 보상 처리
      void callView();
    };
    v.addEventListener('ended', onEnded);
    return () => v.removeEventListener('ended', onEnded);
  }, [callView]);

  // 더보기 이동 후 복귀 감지 (탭 가시성/포커스)
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && moreOpened) {
        // 사용자가 돌아왔을 때 보상 호출
        void callMore();
        setMoreOpened(false);
      }
    };
    const onFocus = () => {
      if (moreOpened) {
        void callMore();
        setMoreOpened(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [callMore, moreOpened]);

  const onClickMore = () => {
    if (!ad?.cta_url) return;
    setMoreOpened(true);
    window.open(ad.cta_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h3>숏폼 광고 플레이어</h3>
      {!ad ? (
        <div>{issuing ? '광고 불러오는 중...' : '광고가 없습니다.'}</div>
      ) : (
        <div>
          <video
            ref={videoRef}
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
            src={ad.video_url}
            controls
            controlsList='nodownload noplaybackrate'
            preload='metadata'
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              type='button'
              onClick={callView}
              disabled={!tokens || callingView}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
            >
              시청 완료 보상 받기 {ad.rewards.view ? `(+${ad.rewards.view})` : ''}
            </button>

            <button
              type='button'
              onClick={onClickMore}
              disabled={!ad.cta_url}
              style={{ padding: '8px 12px', border: '1px solid #1677ff', color: '#1677ff', borderRadius: 6 }}
            >
              더보기 이동 {ad.rewards.more ? `(+${ad.rewards.more})` : ''}
            </button>

            <button
              type='button'
              onClick={callMore}
              disabled={!tokens || callingMore}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
            >
              복귀 보상 받기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



