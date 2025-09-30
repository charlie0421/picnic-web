import { Metadata } from 'next'
import { getLanguageFromParams } from '@/utils/api/language'
import Image from 'next/image'
import Link from 'next/link'
import BookingButtons from '@/components/client/concert2025/BookingButtons'
import PosterGrid from '@/components/client/PosterGrid'
import VideoSection from '@/components/client/VideoSection'
import fs from 'fs'
import path from 'path'
import { getTranslations } from '@/lib/i18n/server'

export const dynamic = 'force-static'
export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = getLanguageFromParams(await params)
  const t = await getTranslations(lang)
  return {
    title: t('concert2025.meta.title'),
    description: t('concert2025.meta.description'),
  }
}

export default async function Concert2025Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const isCn = (lang || '').toLowerCase().startsWith('zh-cn')
  const t = await getTranslations(getLanguageFromParams(await params))
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
    dateTime: t('concert2025.info.dateTime'),
    entrance: t('concert2025.info.entrance'),
    venue: t('concert2025.info.venue'),
  }

  const venue = {
    name: '서울 블루스퀘어(Blue Square)',
    address: '서울특별시 용산구 한남동',
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

  // 소개 영상: video 폴더의 mp4를 모두 노출 (한글/대소문자 파일명 포함)
  type VideoSource = { src: string; type: string }
  type VideoGroup = { key: string; sources: VideoSource[]; thumb?: string }
  const publicVideoDir = path.join(process.cwd(), 'public', 'concert2025', 'video')
  const toKeyFromFilename = (name: string) => {
    const base = name.replace(/\.mp4$/i, '')
    const ascii = base.toLowerCase().replace(/[^a-z0-9]/g, '')
    return ascii || base.toLowerCase()
  }
  const videoFiles = fs.existsSync(publicVideoDir)
    ? fs.readdirSync(publicVideoDir).filter((f) => f.toLowerCase().endsWith('.mp4'))
    : []
  const videoGroups: VideoGroup[] = videoFiles.map((file) => {
    const key = toKeyFromFilename(file)
    const thumb = `/concert2025/video/thumbs/${encodeURIComponent(file.replace(/\.mp4$/i, '.jpg'))}`
    return {
      key,
      sources: [{ src: `/concert2025/video/${encodeURIComponent(file)}?v=1`, type: 'video/mp4' }],
      thumb,
    }
  })

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
    <main className="relative container mx-auto px-4 py-12 md:py-16 break-words">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 15% 20%, rgba(118, 97, 255, 0.35), rgba(118,97,255,0) 60%),\
             radial-gradient(60% 60% at 85% 25%, rgba(255, 123, 172, 0.30), rgba(255,123,172,0) 60%),\
             radial-gradient(60% 60% at 50% 85%, rgba(255, 216, 170, 0.25), rgba(255,216,170,0) 60%),\
             linear-gradient(180deg, #BEB7FF 0%, #E8A6CF 55%, #FFD4C7 100%)',
        }}
      />
      <div className="relative z-10">
      {/* Hero */}
      <section className="text-center space-y-2 md:space-y-3" lang="ko">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="relative mx-auto w-full aspect-[16/7]">
            <Image
              src="/concert2025/image/logo.png?v=1"
              alt={t('concert2025.hero.altLogo')}
              fill
              sizes="(max-width: 768px) 80vw, 720px"
              priority
              className="object-contain"
            />
          </div>
        </div>
              <h2
                className="text-xl md:text-2xl font-bold mb-0 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent"
                lang="en"
              >
                {t('concert2025.hero.tagline')}
              </h2>
      </section>

      {/* Notice (non-CN only) */}
      {!isCn && (
        <section className="mt-6" lang="ko">
          <div className="rounded-xl border border-primary/30 bg-white/90 backdrop-blur p-5 shadow-sm">
            <div className="text-sm md:text-base text-gray-800 text-center">
              <pre className="whitespace-pre-line break-normal hyphens-none leading-relaxed" style={{ overflowWrap: 'normal', wordBreak: 'keep-all' }}>{t('concert2025.notice.koText')}</pre>
            </div>
          </div>
        </section>
      )}

      {isCn && (
        <section className="mt-6" lang="zh">
          <div className="rounded-xl border border-primary/30 bg-white/90 backdrop-blur p-5 shadow-sm">
            <div className="text-sm md:text-base text-gray-800 text-center">
              <pre className="whitespace-pre-line break-normal hyphens-none leading-relaxed" style={{ overflowWrap: 'normal', wordBreak: 'keep-all' }}>{
`本链接为前来参加“Shining Seoul”演唱会的中国籍游客提供的特别专属链接。
通过本链接购票的观众可享受优惠票价。
在预订门票时，即视为已同意本页面所载的所有须知事项。
本页面内容可能会根据情况进行补充或更改，恕不另行通知。
因未仔细阅读入场及观演须知而造成的不便或损失，由观众本人承担。
为避免观演受阻或产生不利影响，请您在入场前务必再次确认相关须知。`}
              </pre>
            </div>
          </div>
        </section>
      )}

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

      {/* Description removed per request */}

      {/* Intro Video moved below Korean guide per request */}

      {/* Ticket Guide moved below to above video section for zh */}

      {/* 한국어 안내사항 */}
      <section className="mt-10" lang="ko" style={{ contentVisibility: 'auto' }}>
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.guide.title')}</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          <div className="text-sm md:text-base text-gray-800 space-y-6">
            <p>{t('concert2025.guide.intro')}</p>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.seating.title')}</h3>
              {/* 좌석 안내 이미지 */}
              <div className="mt-3 space-y-4">
                <figure className="relative rounded-lg overflow-hidden border bg-white">
                  <div className="relative w-full aspect-[16/9] md:aspect-[21/9] bg-white">
                    <Image
                      src="/concert2025/image/seating-guide.png?v=1"
                      alt={t('concert2025.seating.alt')}
                      fill
                      sizes="100vw"
                      className="object-contain"
                    />
                  </div>
                  <figcaption className="px-2 py-1 text-center text-xs text-gray-600">{t('concert2025.seating.caption')}</figcaption>
                </figure>
              </div>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.seating.b1')}</li>
                <li>{t('concert2025.seating.b2')}</li>
                <li>{t('concert2025.seating.b3')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.booking.title')}</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.booking.b1')}</li>
                <li>{t('concert2025.booking.b2')}</li>
                <li>{t('concert2025.booking.b3')}</li>
                <li>{t('concert2025.booking.b4')}</li>
                <li>{t('concert2025.booking.b5')}</li>
                <li>{t('concert2025.booking.b6')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.pickup.title')}</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.pickup.b1')}</li>
                <li>{t('concert2025.pickup.b2')}</li>
                <li>{t('concert2025.pickup.b3')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.entry.title')}</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.entry.b1')}</li>
                <li>{t('concert2025.entry.b2')}</li>
                <li>{t('concert2025.entry.b3')}</li>
                <li>{t('concert2025.entry.b4')}</li>
                <li>{t('concert2025.entry.b5')}</li>
                <li>{t('concert2025.entry.b6')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.policy.title')}</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.policy.b1')}</li>
                <li>{t('concert2025.policy.b2')}</li>
                <li>{t('concert2025.policy.b3')}</li>
                <li>{t('concert2025.policy.b4')}</li>
                <li>{t('concert2025.policy.b5')}</li>
                <li>{t('concert2025.policy.b6')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.storage.title')}</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.storage.b1')}</li>
                <li>{t('concert2025.storage.b2')}</li>
                <li>{t('concert2025.storage.b3')}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900">{t('concert2025.transit.title')}</h3>
              <div className="mt-3 relative w-full overflow-hidden rounded-lg border">
                <div className="relative w-full aspect-video bg-white">
                  <Image
                    src={`/${mapImagePublicRelative}?v=1`}
                    alt={t('concert2025.transit.mapAlt')}
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
              </div>
              <p className="mt-2">{t('concert2025.transit.address')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.transit.traffic1')}</li>
                <li>{t('concert2025.transit.traffic2')}</li>
              </ul>
              <div className="mt-3 space-y-1">
                <p className="font-medium">{t('concert2025.transit.publicTransitTitle')}</p>
                <p className="text-gray-700">{t('concert2025.transit.subway')}</p>
                <p className="text-gray-700">{t('concert2025.transit.bus')}</p>
              </div>
              <div className="mt-3">
                <p className="font-medium">{t('concert2025.transit.parkingTitle')}</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>{t('concert2025.transit.parking1')}</li>
                  <li>{t('concert2025.transit.parking2')}</li>
                  <li>{t('concert2025.transit.parking3')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro Video */}
      {/* Booking buttons (ko/en etc) or Ticket Guide (zh) positioned ABOVE the video */}
      <section className="mt-10" style={{ contentVisibility: 'auto' }}>
        {!isCn ? (
          <BookingButtons
            lang={lang}
            title={t('concert2025.bookingButtons.title')}
            firstFloorLabel={t('concert2025.bookingButtons.firstFloor')}
            secondFloorLabel={t('concert2025.bookingButtons.secondFloor')}
          />
        ) : (
          <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm" lang="zh">
            <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">购票须知</h2>
            <div className="mt-6">
              <p className="text-gray-700 leading-relaxed">以下账户信息用于本次演出的购票打款：</p>
              <dl className="mt-4 space-y-3 text-sm text-gray-800">
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">公司名称</dt>
                  <dd className="col-span-2 break-all">大连艾康星文化传媒有限公司</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">账户号码</dt>
                  <dd className="col-span-2 break-all">285686624326</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">开户行</dt>
                  <dd className="col-span-2 break-all">中国银行大连市分行营业部</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-gray-600">
                <p>• 打款完成后请保留凭证，联系微信客服提交订单信息以便对账。</p>
                <p className="mt-1">• 若有改期/退款政策，以主办方公告为准。</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-10" lang="ko" style={{ contentVisibility: 'auto' }}>
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.introVideo.title')}</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          {videoGroups.length === 0 ? (
            <p className="text-sm text-gray-500">{t('concert2025.introVideo.comingSoon')}</p>
          ) : (
            <VideoSection
              groups={videoGroups.map((g) => ({
                key: g.key,
                sources: g.sources,
                poster: g.thumb || getPosterForVideoKey(g.key) || firstPosterSrc,
              }))}
            />
          )}
        </div>
      </section>

      {/* Contact / WeChat QR - CN only */}
            {isCn && (
              <section className="mt-10" lang="zh" style={{ contentVisibility: 'auto' }}>
                <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm grid place-items-center">
                  <div className="relative rounded-xl border bg-white p-3 shadow-sm">
                    <Image
                      src="/concert2025/image/wechat-qr.png?v=1"
                      alt=""
                      width={288}
                      height={288}
                      className="object-contain"
                    />
                  </div>
                </div>
              </section>
            )}

      {/* Location / Map (removed per request) */}

      {/* Posters - Flat Grid (no grouping) */}
      <section className="mt-10" lang="ko">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.posters.title')}</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          <PosterGrid
            posters={[...postersFlat]
              .sort((a, b) => {
                const as = (a.slug || '').localeCompare(b.slug || '')
                if (as !== 0) return as
                const av = typeof a.variant === 'number' ? a.variant! : Number.MAX_SAFE_INTEGER
                const bv = typeof b.variant === 'number' ? b.variant! : Number.MAX_SAFE_INTEGER
                return av - bv
              })
              .map((p) => ({
                src: p.src,
                alt: slugToArtistName[normalizeKey(p.slug || '')] || p.alt || p.slug || t('concert2025.posters.unknownArtist'),
                slug: p.slug,
                variant: p.variant,
              }))}
          />
        </div>
      </section>
      </div>
    </main>
  )
}


