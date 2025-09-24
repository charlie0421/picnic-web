import { Metadata } from 'next'
import { getLanguageFromParams } from '@/utils/api/language'
import Image from 'next/image'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

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
    { id: 1, name: 'T-ARA 柳和荣（류화영）', slug: 'ryu-hwayoung' },
    { id: 2, name: 'ifeye', slug: 'ifeye' },
    { id: 3, name: 'Gavy NJ（가비앤제이）', slug: 'gavy-nj' },
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

  // 포스터 이미지 자동 로드 (image 하위)
  const imagesDir = path.join(process.cwd(), 'public', 'concert2025', 'image')
  let posters: { src: string; alt: string }[] = []
  let imageFilesAll: string[] = []
  try {
    const files = await fs.readdir(imagesDir)
    imageFilesAll = files.filter((f) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f))
    const imageFiles = imageFilesAll.filter((f) => /poster/i.test(f))
    posters = imageFiles.map((file) => {
      const base = file.replace(/\.[^.]+$/, '')
      const alt = base.replace(/[-_]+/g, ' ')
      return { src: `/concert2025/image/${file}`, alt }
    })
  } catch (_) {
    posters = []
  }

  // poster 하위: slug 또는 slug-1/slug-2 파일명을 랜덤 노출 용도로 매핑
  const posterDir = path.join(process.cwd(), 'public', 'concert2025', 'image', 'poster')
  type PosterFile = { src: string; alt: string; slug: string; variant?: number }
  const normalizeSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  let postersBySlug: Record<string, PosterFile[]> = {}
  let postersBySlugNormalized: Record<string, PosterFile[]> = {}
  let postersFlat: PosterFile[] = []
  try {
    const files = await fs.readdir(posterDir)
    const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f))
    for (const file of imageFiles) {
      const base = file.replace(/\.[^.]+$/, '')
      const m = base.match(/^([a-z0-9-]+)(?:[-_](\d+))?$/i)
      if (!m) continue
      const slug = m[1].toLowerCase()
      const variant = m[2] ? parseInt(m[2], 10) : undefined
      const pf: PosterFile = { src: `/concert2025/image/poster/${file}`, alt: slug, slug, variant }
      const norm = normalizeSlug(slug)
      postersBySlug[slug] = postersBySlug[slug] ? [...postersBySlug[slug], pf] : [pf]
      postersBySlugNormalized[norm] = postersBySlugNormalized[norm] ? [...postersBySlugNormalized[norm], pf] : [pf]
      postersFlat.push(pf)
    }
  } catch (_) {
    postersBySlug = {}
    postersBySlugNormalized = {}
    postersFlat = []
  }

  // slug 기반 이미지 선택 헬퍼 (image 하위 파일명 우선)
  const pickImageBySlug = (slug: string): string | undefined => {
    const lower = slug.toLowerCase()
    const candidates = imageFilesAll
      .map((f) => ({ f, fl: f.toLowerCase() }))
    // 1) exact: slug.ext
      .sort((a, b) => a.f.localeCompare(b.f))

    const exact = candidates.find(({ fl }) => new RegExp(`^${lower}\.`, 'i').test(fl))
    if (exact) return `/concert2025/image/${exact.f}`

    // 2) slug-poster.ext or poster-slug.ext
    const hyphenPoster = candidates.find(({ fl }) => new RegExp(`^${lower}[-_]?poster\.`, 'i').test(fl))
    if (hyphenPoster) return `/concert2025/image/${hyphenPoster.f}`
    const posterHyphen = candidates.find(({ fl }) => new RegExp(`^poster[-_]?${lower}\.`, 'i').test(fl))
    if (posterHyphen) return `/concert2025/image/${posterHyphen.f}`

    // 3) includes slug and 'poster'
    const containsBoth = candidates.find(({ fl }) => fl.includes(lower) && /poster/i.test(fl))
    if (containsBoth) return `/concert2025/image/${containsBoth.f}`

    // 4) includes slug
    const containsSlug = candidates.find(({ fl }) => fl.includes(lower))
    if (containsSlug) return `/concert2025/image/${containsSlug.f}`

    // 5) fallback: 첫 poster 이미지
    if (posters[0]) return posters[0].src
  }

  // 아티스트별 포스터: public/concert2025/artists/{slug}/ 내 'poster' 포함 이미지
  const artistPosterMap: Record<string, { src: string; alt: string } | undefined> = {}
  for (const a of lineup) {
    const artistDir = path.join(process.cwd(), 'public', 'concert2025', 'artists', a.slug)
    try {
      const files = await fs.readdir(artistDir)
      const posterFile = files.find((f) => /poster/i.test(f) && /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f))
      if (posterFile) {
        const alt = a.name
        artistPosterMap[a.slug] = { src: `/concert2025/artists/${a.slug}/${posterFile}`, alt }
      }
    } catch (_) {
      artistPosterMap[a.slug] = undefined
    }
  }

  // 장소 지도 이미지 (사용자가 업로드한 경우 사용): public/concert2025/map/*
  let mapImage: { src: string; alt: string } | null = null
  try {
    const mapDir = path.join(process.cwd(), 'public', 'concert2025', 'map')
    const files = await fs.readdir(mapDir)
    const mapImg = files.find((f) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f))
    if (mapImg) {
      mapImage = { src: `/concert2025/map/${mapImg}`, alt: 'Blue Square Map' }
    }
  } catch (_) {
    mapImage = null
  }

  // 소개 영상 자동 로드 (concert2025/video 또는 /video 폴더 지원)
  const candidateVideoDirs = [
    { fsPath: path.join(process.cwd(), 'public', 'concert2025', 'video'), urlBase: '/concert2025/video' },
    { fsPath: path.join(process.cwd(), 'public', 'video'), urlBase: '/video' },
  ]
  type VideoSource = { src: string; type: string }
  type VideoGroup = { key: string; sources: VideoSource[] }
  let videoGroups: VideoGroup[] = []
  for (const dir of candidateVideoDirs) {
    try {
      const files = await fs.readdir(dir.fsPath)
      const videoFiles = files.filter((f) => /\.(mp4|webm|ogg|m4v)$/i.test(f))
      if (videoFiles.length > 0) {
        const mimeMap: Record<string, string> = {
          mp4: 'video/mp4',
          webm: 'video/webm',
          ogg: 'video/ogg',
          m4v: 'video/x-m4v',
        }
        const groups = new Map<string, VideoSource[]>()
        for (const file of videoFiles) {
          const ext = file.split('.').pop()?.toLowerCase() || 'mp4'
          const base = file.replace(/\.[^.]+$/, '')
          const key = base.toLowerCase()
          const list = groups.get(key) || []
          list.push({ src: `${dir.urlBase}/${file}`, type: mimeMap[ext] || 'video/mp4' })
          groups.set(key, list)
        }
        videoGroups = Array.from(groups.entries()).map(([key, sources]) => ({ key, sources }))
        break
      }
    } catch (_) {
      // skip
    }
  }

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
          {mapImage ? (
            <div className="relative w-full overflow-hidden rounded-lg border">
              <div className="relative w-full aspect-video">
                <Image src={mapImage.src} alt={mapImage.alt} fill className="object-cover" />
              </div>
            </div>
          ) : (
            <div className="relative w-full overflow-hidden rounded-lg border">
              <div className="relative w-full aspect-video">
                <iframe
                  title="Blue Square Seoul (AMap)"
                  className="absolute inset-0 h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://m.amap.com/search/mapview/keywords=${venue.amapKeyword}`}
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Lineup - Fancy Cards */}
      <section className="mt-10" lang="zh">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">演出阵容</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {lineup.map((artist, idx) => {
            const normKey = artist.slug.replace(/[^a-z0-9]/gi, '').toLowerCase()
            let listRaw = postersBySlug[artist.slug] || postersBySlugNormalized[normKey] || []
            if (listRaw.length === 0) {
              const slugLower = artist.slug.toLowerCase()
              listRaw = postersFlat.filter(p => p.slug === slugLower || p.src.toLowerCase().includes(`/poster/${slugLower}`))
            }
            const list = [...listRaw].sort((a, b) => {
              const av = typeof a.variant === 'number' ? a.variant! : Number.MAX_SAFE_INTEGER
              const bv = typeof b.variant === 'number' ? b.variant! : Number.MAX_SAFE_INTEGER
              return av - bv
            })

            // fallback poster if no slug-matched posters
            const fallbackPoster = artistPosterMap[artist.slug]?.src || pickImageBySlug(artist.slug) || posters[idx]?.src

            return (
              <article key={artist.id} className="group relative rounded-xl overflow-hidden border border-primary/10 shadow">
                <div className="p-2">
                  {list.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {list.map((p, i) => (
                        <div key={p.src} className="relative w-full aspect-[3/4] rounded-lg overflow-hidden">
                          <Image
                            src={p.src}
                            alt={`${artist.name} poster ${p.variant ?? i + 1}`}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 220px"
                            className="object-cover"
                          />
                          <div className="absolute top-2 left-2">
                            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1 rounded-full bg-white/90 text-[10px] font-semibold shadow">
                              {typeof p.variant === 'number' ? p.variant : i + 1}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-gradient-to-br from-primary/15 via-sub/15 to-point/15">
                      {fallbackPoster ? (
                        <Image
                          src={fallbackPoster}
                          alt={artist.name}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 220px"
                          className="object-cover"
                        />
                      ) : null}
                      {!fallbackPoster && (
                        <div className="absolute inset-0 grid place-items-center text-xs text-gray-500">暂无海报</div>
                      )}
                    </div>
                  )}
                  <div className="pt-2">
                    <h3 className="text-gray-900 font-semibold text-sm md:text-base truncate" title={artist.name}>{artist.name}</h3>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <p className="text-sm text-gray-500 mt-3">更多艺人即将公布…</p>
      </section>

      {/* Intro Video - move to bottom */}
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
                poster={getPosterForVideoKey(videoGroups[0].key) || postersFlat[0]?.src || posters[0]?.src}
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
            {videoGroups.map((group, i) => (
              <div key={group.key} className="rounded-xl overflow-hidden border bg-black">
                <div className="relative w-full aspect-video">
                  <video
                    className="absolute inset-0 h-full w-full"
                    controls
                    playsInline
                    preload="metadata"
                    poster={getPosterForVideoKey(group.key) || postersFlat[i]?.src || posters[i]?.src}
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
    </main>
  )
}


