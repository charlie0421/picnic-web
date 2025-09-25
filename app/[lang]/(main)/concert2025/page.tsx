import { Metadata } from 'next'
import { getLanguageFromParams } from '@/utils/api/language'
import Image from 'next/image'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-static'
export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  // 언어 경로와 관계없이 중국어 메타로 고정 (요청사항: 중국어만 노출 가능)
  void getLanguageFromParams(await params)
  return {
    title: '耀首尔·5代艺人专场演出 | Picnic',
    description:
      '星耀首尔，艺人盛宴！三组以上韩国5代人气艺人，首次为中国粉丝呈现专属舞台。2025年10月11日，首尔蓝色广场，不见不散！',
  }
}

export default async function Concert2025Page({ params }: { params: Promise<{ lang: string }> }) {
  // 라인업 구조체 (slug는 폴더명으로 사용)
  type Artist = { id: number; name: string; slug: string }
  const lineup: Artist[] = [
    { id: 1, name: 'T-ARA 柳和荣（류화영）', slug: 'ryuhwayoung' },
    { id: 2, name: 'ifeye(이프아이)', slug: 'ifeye' },
    { id: 3, name: 'Gavy NJ（가비앤제이）', slug: 'gavynj' },
    { id: 4, name: 'EastShine（이스트샤인）', slug: 'eastshine' },
    { id: 5, name: 'iii（아이아이아이）', slug: 'iii' },
    { id: 6, name: 'Young Posse（영파씨）', slug: 'youngposse' },
  ]

  const info = {
    dateTime: '2025年10月11日（周六）18:00 - 20:00',
    entrance: '17:00入场开始',
    venue: '首尔蓝色广场（Blue Square）',
  }

  const venue = {
    name: '首尔蓝色广场（Blue Square）',
    address: '首尔特别市龙山区汉南洞（서울 용산구 한남동）',
    coord: { lng: 127.003, lat: 37.5405 },
    amapKeyword: encodeURIComponent('Blue Square Seoul'),
  }

  // 지도 이미지는 항상 map.png를 사용 (SSG 캐시 이슈 방지)
  const mapImagePublicRelative = path.join('concert2025', 'image', 'map.png')
  const mapImageFsPath = path.join(process.cwd(), 'public', mapImagePublicRelative)
  const hasMapImage = true

  // 정적 포스터 매니페스트 (slug별)
  type PosterFile = { src: string; alt: string; slug: string; variant?: number }
  const POSTERS_BY_SLUG: Record<string, PosterFile[]> = {
    'eastshine': [
      { src: '/concert2025/image/poster/eastshine-1.png', alt: 'eastshine-1', slug: 'eastshine', variant: 1 },
      { src: '/concert2025/image/poster/eastshine-2.png', alt: 'eastshine-2', slug: 'eastshine', variant: 2 },
    ],
    'ifeye': [
      { src: '/concert2025/image/poster/ifeye-1.png', alt: 'ifeye-1', slug: 'ifeye', variant: 1 },
      { src: '/concert2025/image/poster/ifeye-2.png', alt: 'ifeye-2', slug: 'ifeye', variant: 2 },
    ],
    'gavy-nj': [
      { src: '/concert2025/image/poster/gavy-nj.png', alt: 'gavy-nj', slug: 'gavy-nj', variant: 1 },
    ],
    'ryu-hwayoung': [
      { src: '/concert2025/image/poster/ryu-hwayoung.png', alt: 'ryu-hwayoung', slug: 'ryu-hwayoung', variant: 1 },
    ],
    'iii': [
      { src: '/concert2025/image/poster/iii.png', alt: 'iii', slug: 'iii', variant: 1 },
    ],
    'youngposse': [
      { src: '/concert2025/image/poster/youngposse.png', alt: 'youngposse', slug: 'youngposse', variant: 1 },
    ],
  }
  const postersBySlug = POSTERS_BY_SLUG
  const postersBySlugNormalized: Record<string, PosterFile[]> = Object.fromEntries(
    Object.entries(POSTERS_BY_SLUG).map(([k, v]) => [k.replace(/[^a-z0-9]/gi, '').toLowerCase(), v])
  )
  const postersFlat: PosterFile[] = Object.values(POSTERS_BY_SLUG).flat()
  const firstPosterSrc: string | undefined = postersFlat.length > 0 ? postersFlat[0].src : undefined

  // 포스터 → 아티스트명 매핑 (공백 없는 정규화 슬러그 기준)
  const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const slugToArtistName: Record<string, string> = Object.fromEntries(
    lineup.map((a) => [normalizeKey(a.slug), a.name])
  )

  // slug 기반 대표 이미지 선택
  const pickImageBySlug = (slug: string): string | undefined => {
    const arr = POSTERS_BY_SLUG[slug]
    if (!arr || arr.length === 0) return undefined
    const v1 = arr.find(p => p.variant === 1)
    return v1 ? v1.src : arr[0].src
  }

  // 소개 영상: 라인업 slug를 정규화하여 public 디렉토리의 mp4 파일 존재 여부로 자동 구성
  type VideoSource = { src: string; type: string }
  type VideoGroup = { key: string; sources: VideoSource[] }
  const publicVideoDir = path.join(process.cwd(), 'public', 'concert2025', 'video')
  const normalizeSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const videoGroups: VideoGroup[] = lineup
    .map((a) => normalizeSlug(a.slug))
    .filter((key, idx, arr) => arr.indexOf(key) === idx)
    .map((key) => {
      const filePath = path.join(publicVideoDir, `${key}.mp4`)
      console.log('filePath', filePath)
      const exists = fs.existsSync(filePath)
      return exists
        ? { key, sources: [{ src: `/concert2025/video/${key}.mp4?v=1`, type: 'video/mp4' }] }
        : null
    })
    .filter((v): v is VideoGroup => v !== null)

  // 비디오 키(파일 베이스명)로 포스터 찾기
  const getPosterForVideoKey = (key: string): string | undefined => {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    const list = postersBySlug[key] || postersBySlugNormalized[normKey]
    const pickPreferred = (arr: typeof list) => {
      if (!arr || arr.length === 0) return undefined
      const v1 = arr.find(p => p.variant === 1)
      if (v1) return v1.src
      const withVariant = arr.filter(p => typeof p.variant === 'number').sort((a,b) => (a.variant! - b.variant!))
      if (withVariant.length > 0) return withVariant[0].src
      return arr[0].src
    }
    const chosen = pickPreferred(list)
    if (chosen) return chosen
    // lineup 슬러그로도 매칭 시도
    const lineupMatch = lineup.find(a => a.slug.replace(/[^a-z0-9]/g, '') === normKey)
    if (lineupMatch) {
      const lNorm = lineupMatch.slug.replace(/[^a-z0-9]/g, '')
      const lList = postersBySlug[lineupMatch.slug] || postersBySlugNormalized[lNorm]
      return pickPreferred(lList)
    }
    return undefined
  }

  return (
    <main className="relative container mx-auto px-4 py-12 md:py-16">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-point/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-sub/20 blur-3xl" />
      </div>
      {/* Hero */}
      <section className="text-center space-y-3 md:space-y-4" lang="zh">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary-700 via-point-600 to-secondary-600 bg-clip-text text-transparent">耀首尔·5代艺人专场演出</h1>
      </section>

      {/* Info Bar (일정/장소) */}
      <section className="mt-6">
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur px-5 py-4 md:px-6 md:py-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center md:text-left">
            <div className="font-semibold text-gray-900">{info.dateTime}</div>
            <div className="text-sm text-gray-700">{info.entrance}</div>
            <div className="text-sm text-gray-700">{info.venue}</div>
          </div>
        </div>
      </section>

      {/* Posters section removed per request */}

      {/* Description */}
      <section className="mt-10" lang="zh">
        <div className="rounded-xl border border-secondary/30 bg-white/80 backdrop-blur p-6 shadow-sm">
          <p className="leading-relaxed text-gray-700">
            星耀首尔，艺人盛宴！三组以上韩国5代人气艺人，首次为中国粉丝呈现专属舞台。2025年10月11日，首尔蓝色广场，不见不散！
          </p>
        </div>
      </section>

      {/* Intro Video */}
      <section className="mt-10" lang="zh">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">介绍视频</h2>
        {videoGroups.length === 0 ? (
          <p className="text-sm text-gray-500">视频即将公开（如为 .mov 文件，请转换为 .mp4 后上传）。</p>
        ) : videoGroups.length === 1 ? (
          <div className="rounded-xl overflow-hidden border bg-black">
            <div className="relative w-full aspect-video">
              <video
                className="absolute inset-0 h-full w-full"
                controls
                playsInline
                preload="metadata"
                poster={getPosterForVideoKey(videoGroups[0].key) || firstPosterSrc}
              >
                {videoGroups[0].sources.map((v) => (
                  <source key={v.src} src={v.src} type={v.type} />
                ))}
                您的浏览器不支持视频播放。
              </video>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videoGroups.map((group) => (
              <div key={group.key} className="rounded-xl overflow-hidden border bg-black">
                <div className="relative w-full aspect-video">
                  <video
                    className="absolute inset-0 h-full w-full"
                    controls
                    playsInline
                    preload="metadata"
                    poster={getPosterForVideoKey(group.key) || firstPosterSrc}
                  >
                    {group.sources.map((v) => (
                      <source key={v.src} src={v.src} type={v.type} />
                    ))}
                    您的浏览器不支持视频播放。
                  </video>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contact / WeChat QR */}
      <section className="mt-10" lang="zh">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">联系方式</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-gray-700 leading-relaxed">
              客服微信：请扫描右侧二维码添加好友，或将二维码保存到相册后在微信中识别。
            </p>
            <ul className="list-disc pl-5 mt-3 text-sm text-gray-600">
              <li>服务时间：10:00 – 19:00（KST）</li>
              <li>演出、购票及现场相关咨询均可留言</li>
            </ul>
            <div className="mt-4">
              <a
                href="/concert2025/image/wechat-qr.png"
                download
                className="inline-flex items-center rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary/10"
              >
                下载二维码
              </a>
            </div>
          </div>
          <div className="justify-self-center">
            <div className="relative rounded-xl border bg-white p-3 shadow-sm">
              <Image
                src="/concert2025/image/wechat-qr.png?v=1"
                alt="WeChat QR"
                width={288}
                height={288}
                className="object-contain"
                unoptimized
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Location / Map */}
      <section className="mt-10" lang="zh">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">演出地点</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          <div className="mb-4">
            <p className="font-semibold">{venue.name}</p>
            <p className="text-sm text-gray-700">{venue.address}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <a
                href={`https://uri.amap.com/marker?position=${venue.coord.lng},${venue.coord.lat}&name=${venue.amapKeyword}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-primary-700 hover:underline"
              >
                在高德地图中打开
              </a>
              <a
                href={`https://map.baidu.com/search/${venue.amapKeyword}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-primary-700 hover:underline"
              >
                在百度地图中打开
              </a>
            </div>
          </div>
          <div className="relative w-full overflow-hidden rounded-lg border">
            <div className="relative w-full aspect-video bg-white">
              <Image
                src={`/${mapImagePublicRelative}?v=1`}
                alt="演出地点地图"
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Posters - Flat Grid (no grouping) */}
      <section className="mt-10" lang="zh">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">演出海报</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {[...postersFlat]
            .sort((a, b) => {
              const as = (a.slug || '').localeCompare(b.slug || '')
              if (as !== 0) return as
              const av = typeof a.variant === 'number' ? a.variant! : Number.MAX_SAFE_INTEGER
              const bv = typeof b.variant === 'number' ? b.variant! : Number.MAX_SAFE_INTEGER
              return av - bv
            })
            .map((p, i) => (
              <article key={`${p.src}-${i}`} className="group relative rounded-xl overflow-hidden border border-primary/10 shadow">
                <div className="p-2">
                  <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden">
                    <Image
                      src={p.src}
                      alt={p.alt || p.slug || 'poster'}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 200px"
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs md:text-sm font-medium text-gray-900 truncate" title={slugToArtistName[normalizeKey(p.slug || '')] || p.alt || p.slug}>
                      {slugToArtistName[normalizeKey(p.slug || '')] || p.alt || p.slug || '未知艺人'}
                    </p>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>
    </main>
  )
}


