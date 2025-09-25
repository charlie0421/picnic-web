'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

export type VideoSource = { src: string; type: string }
export type VideoGroupItem = { key: string; sources: VideoSource[]; poster?: string }

function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        obs.unobserve(el)
      }
    }, options)
    obs.observe(el)
    return () => obs.disconnect()
  }, [options])

  return { ref, inView }
}

const VideoCard: React.FC<{ item: VideoGroupItem }> = ({ item }) => {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '200px 0px' })

  return (
    <div ref={ref} className="rounded-xl overflow-hidden border bg-black">
      <div className="relative w-full aspect-video">
        {inView ? (
          <video
            className="absolute inset-0 h-full w-full"
            controls
            playsInline
            preload="metadata"
            poster={item.poster}
          >
            {item.sources.map((v) => (
              <source key={v.src} src={v.src} type={v.type} />
            ))}
            您的浏览器不支持视频播放。
          </video>
        ) : (
          item.poster ? (
            <Image src={item.poster} alt={item.key} fill sizes="100vw" className="object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-xs text-gray-400">加载中…</div>
          )
        )}
      </div>
    </div>
  )
}

const VideoSection: React.FC<{ groups: VideoGroupItem[] }> = ({ groups }) => {
  if (groups.length === 1) {
    return <VideoCard item={groups[0]} />
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {groups.map((g) => (
        <VideoCard key={g.key} item={g} />
      ))}
    </div>
  )
}

export default VideoSection


