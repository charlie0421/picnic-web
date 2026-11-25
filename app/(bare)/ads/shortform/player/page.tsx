'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { AntiAbuseError, mapAntiAbuseError } from '@/lib/anti-abuse/handler';
import { RateLimitedDialog } from '@/components/anti-abuse/RateLimitedDialog';
import { attributedDestination } from '@/lib/charts/campaign-destination';
import { usePlaybackMeasurement } from '@/hooks/charts/usePlaybackMeasurement';
import HlsVideo from '@/components/client/HlsVideo';

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
  const [rateLimitedChannel, setRateLimitedChannel] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();
  const [impression, setImpression] = useState<string|null>(null);
  const [permitted, setPermitted] = useState(false);
  const [allowAttribution, setAllowAttribution] = useState(false);
  const trustedCheckoutOrigins = process.env.NEXT_PUBLIC_KPOP_CHECKOUT_ORIGINS ?? '';
  const marker = '00000000-0000-4000-8000-000000000000';
  const supportsAttribution = !!ad?.cta_url && attributedDestination(ad.cta_url,trustedCheckoutOrigins,marker) !== ad.cta_url;
  usePlaybackMeasurement(videoRef, impression, permitted);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { setPermitted(false); setAllowAttribution(false); } });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

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
      if (!res.ok) {
        // anti-abuse 429 매핑 — RateLimitedDialog 노출 후 페이지 종료
        const body = await res.json().catch(() => null);
        const aa = mapAntiAbuseError({ status: res.status, details: body });
        if (aa instanceof AntiAbuseError) {
          setRateLimitedChannel(aa.channel);
          return;
        }
        throw new Error('issue failed');
      }
      const json = await res.json();
      setPermitted(false);
      setAllowAttribution(false);
      setImpression(typeof json.impression_id === 'string' ? json.impression_id : null);
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

  const onClickMore = async () => {
    if (!ad?.cta_url) return;
    setMoreOpened(true);
    const destination = ad.cta_url;
    if (!allowAttribution || !supportsAttribution || !impression) {
      window.open(destination, '_blank', 'noopener,noreferrer');
      return;
    }
    const target = window.open('about:blank', '_blank');
    if (!target) return;
    target.opener = null;
    // The original destination is always available if measurement fails.
    let next = destination;
    try {
      const auth = await getAuthToken();
      if (auth) {
        const response = await fetch(new URL('/rest/v1/rpc/issue_kpop_campaign_click',process.env.NEXT_PUBLIC_SUPABASE_URL),{
          method:'POST',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(2500),
          headers:{'Content-Type':'application/json',Authorization:auth,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||''},
          body:JSON.stringify({p_impression:impression}),
        });
        if (response.ok) {
          const token:unknown = await response.json();
          if(typeof token==='string') next=attributedDestination(destination,trustedCheckoutOrigins,token);
        }
      }
    } catch { /* Checkout remains available when attribution is offline. */ }
    if (!target.closed) target.location.replace(next);
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      {rateLimitedChannel && (
        <RateLimitedDialog
          isOpen
          channel={rateLimitedChannel}
          onClose={() => {
            setRateLimitedChannel(null);
            router.back();
          }}
        />
      )}
      <h3>숏폼 광고 플레이어</h3>
      {!ad ? (
        <div>{issuing ? '광고 불러오는 중...' : '광고가 없습니다.'}</div>
      ) : (
        <div>
          <HlsVideo
            ref={videoRef}
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
            src={ad.video_url}
            controls
            controlsList='nodownload noplaybackrate'
            preload='metadata'
          />
          {impression && <label style={{display:'block',marginTop:12,fontSize:14}}>
            <input type="checkbox" checked={permitted} onChange={e=>setPermitted(e.target.checked)} /> 이 광고의 재생 시간 측정에 동의합니다 (선택).
            <small style={{display:'block'}}>PICNIC은 화면에 표시된 재생 구간을 팬덤·캠페인 통계에 사용합니다. 시청 보상은 선택과 관계없이 받을 수 있습니다.</small>
          </label>}
          {impression && supportsAttribution && <label style={{display:'block',marginTop:8,fontSize:14}}>
            <input type="checkbox" checked={allowAttribution} onChange={e=>setAllowAttribution(e.target.checked)} /> 이 광고와 주문 연결에 동의합니다 (선택).
            <small style={{display:'block'}}>광고주의 결제 페이지에 이 광고의 연결 코드를 전달합니다. PICNIC은 확인된 주문을 캠페인 통계에 사용합니다.</small>
          </label>}
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



