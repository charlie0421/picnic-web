'use client';

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';

export type HlsVideoProps = Omit<
  React.VideoHTMLAttributes<HTMLVideoElement>,
  'ref'
> & {
  src: string;
};

/**
 * HLS 지원 비디오 컴포넌트.
 *
 * - .m3u8 URL → Chrome/Firefox는 HLS.js, Safari는 네이티브 HLS
 * - .mp4 등 기타 URL → 기본 <video> 동작
 *
 * 기존 <video> 태그와 동일한 props를 받으며,
 * ref로 HTMLVideoElement에 직접 접근 가능합니다.
 */
const HlsVideo = forwardRef<HTMLVideoElement, HlsVideoProps>(
  function HlsVideo({ src, ...videoProps }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !src) return;

      const isHls = src.endsWith('.m3u8');

      // HLS가 아니면 기본 src 설정
      if (!isHls) {
        video.src = src;
        return;
      }

      // Safari 등 네이티브 HLS 지원 브라우저
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        return;
      }

      // Chrome/Firefox → HLS.js
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('[HlsVideo] Fatal error:', data.type, data.details);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else {
              hls.destroy();
            }
          }
        });
        return () => {
          hls.destroy();
        };
      }

      // HLS.js도 네이티브도 불가 → 그래도 src 설정 (재생 불가일 수 있음)
      video.src = src;
    }, [src]);

    return <video ref={videoRef} {...videoProps} />;
  },
);

export default HlsVideo;
